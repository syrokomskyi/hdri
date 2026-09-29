/*
<MODULE_CONTRACT>
  <purpose>Run explicit Q2 preservation and pinned full verification with strictly parsed input files.</purpose>
  <non-goals><item>Does not invent custody metadata, load implicit environment files or admit an unverified baseline.</item></non-goals>
  <!-- risk: sign -->
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Replace ambiguous archive flags with explicit inventories and destination sets; block unverified baseline conversion.</item></CHANGE_SUMMARY>
*/
// @ai-invariant: Dry-run and verification never load private keys or create outputs; failed baseline conversion is not callable here.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { findRepoRoot, getDeviceId, loadSigningKeyFromEnv } from "@syrokomskyi/observatory-crypto";
import { mintAssetId } from "@syrokomskyi/observatory-core";
import { readBoundedFile } from "@warpgogol/pipeline-node";
import {
  parseDestinations,
  parsePreservationInventory,
  prepareBaselineSource,
  preserveQ2,
  verifyReplicas,
} from "./preserve.js";
import { inspectBaselineScope } from "./baseline-scope.js";
import { materializeBaselineClosure } from "./baseline-closure-materialization.js";
import { sealConvertedBaselineCapsule } from "./baseline-capsule.js";

const readJson = async (file: string): Promise<unknown> =>
  JSON.parse((await readBoundedFile(path.resolve(file), 64 * 1024 * 1024)).toString("utf8"));
function required(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("REQUIRED_ARGUMENT_MISSING");
  return value;
}
const readPreservationInventory = async (
  file: string,
): Promise<{ sourceRoots: string[]; entries: ReturnType<typeof parsePreservationInventory> }> => {
  const raw = await readJson(file);
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("INVALID_PRESERVATION_INPUT");
  const input = raw as Record<string, unknown>;
  if (
    Object.keys(input).sort().join(",") !== "entries,schema,sourceRoots" ||
    input.schema !== "hdri-preservation-input@1" ||
    !Array.isArray(input.sourceRoots) ||
    !input.sourceRoots.length ||
    input.sourceRoots.some((root) => typeof root !== "string")
  )
    throw new Error("INVALID_PRESERVATION_INPUT");
  return {
    sourceRoots: input.sourceRoots as string[],
    entries: parsePreservationInventory(input.entries),
  };
};
export async function main(args = process.argv.slice(2)): Promise<number> {
  const [command, ...rest] = args;
  try {
    if (command !== "preserve:q2" && command !== "preserve:verify" && command !== "baseline:import")
      throw new Error("UNKNOWN_PRESERVATION_COMMAND");
    const common = {
      destinations: { type: "string" as const },
      json: { type: "boolean" as const },
    };
    const { values: parsedValues, tokens } = parseArgs({
      args: rest,
      strict: true,
      allowPositionals: false,
      tokens: true,
      options:
        command === "preserve:q2"
          ? { ...common, inventory: { type: "string" }, "dry-run": { type: "boolean" } }
          : command === "baseline:import"
            ? {
                ...common,
                "manifest-sha256": { type: "string" },
                "verification-key": { type: "string" },
                "key-id": { type: "string" },
                "source-destination": { type: "string" },
                "work-root": { type: "string" },
                "scope-declaration": { type: "string" },
                "ontology-artifact": { type: "string" },
                "codebook-artifact": { type: "string" },
                "import-metadata": { type: "string" },
                target: { type: "string" },
                period: { type: "string" },
                "preserved-capsule": { type: "string" },
                "preservation-inventory": { type: "string" },
                "publication-dir": { type: "string" },
                "capsule-root": { type: "string" },
                "device-id": { type: "string" },
              }
            : {
                ...common,
                "manifest-sha256": { type: "string" },
                "verification-key": { type: "string" },
                "key-id": { type: "string" },
              },
    });
    const values: Record<string, unknown> = parsedValues;
    const seen = new Set<string>();
    for (const token of tokens)
      if (token.kind === "option") {
        if (seen.has(token.name)) throw new Error("DUPLICATE_PRESERVATION_ARGUMENT");
        seen.add(token.name);
      }
    const destinations = parseDestinations(await readJson(required(values.destinations)));
    let diagnostic;
    if (command === "preserve:q2") {
      const input = await readPreservationInventory(required(values.inventory));
      const dryRun = values["dry-run"] === true;
      diagnostic = await preserveQ2({
        inventory: input.entries,
        sourceRoots: input.sourceRoots,
        destinations,
        dryRun,
        signingKey: dryRun ? undefined : loadSigningKeyFromEnv(),
      });
    } else if (command === "baseline:import") {
      const signingKeyId = required(values["key-id"]);
      const publicKeyPem = (
        await readBoundedFile(path.resolve(required(values["verification-key"])), 4096)
      ).toString("utf8");
      // Authenticate every declared replica, then copy the complete pinned closure into a
      // fresh private root. The scope declaration and import metadata are operator-authored
      // files; the converter validates them against the prepared manifest before any write.
      const prepared = await prepareBaselineSource({
        destinations,
        manifestSha256: required(values["manifest-sha256"]),
        verificationKeys: new Map([[signingKeyId, { signingKeyId, publicKeyPem }]]),
        sourceDestinationPath: path.resolve(required(values["source-destination"])),
        workRoot: path.resolve(required(values["work-root"])),
      });
      const scopeInventory = await inspectBaselineScope(
        prepared,
        await readJson(required(values["scope-declaration"])),
      );
      const snapshots = new Map(
        scopeInventory.sources.map((s) => [s.declaration.profile, s.declaration.snapshot.uri]),
      );
      const observatorySnapshotUri = snapshots.get("observatory");
      const harvestSnapshotUri = snapshots.get("harvest");
      if (!observatorySnapshotUri || !harvestSnapshotUri)
        throw new Error("BASELINE_SCOPE_PROFILE_MISSING");
      const importMetadata = await readJson(required(values["import-metadata"]));
      if (!importMetadata || typeof importMetadata !== "object" || Array.isArray(importMetadata))
        throw new Error("INVALID_BASELINE_IMPORT_METADATA");
      const period = required(values.period);
      const report = await materializeBaselineClosure({
        prepared,
        scopeInventory,
        observatorySnapshotUri,
        harvestSnapshotUri,
        ontologyArtifactUri: required(values["ontology-artifact"]),
        codebookArtifactUri: required(values["codebook-artifact"]),
        targetPath: path.resolve(required(values.target)),
        period,
        import: importMetadata as never,
      });
      // RFC-0129: the verified conversion is sealed as a first-class prior
      // capsule — the preserved signed source-ledger closure is carried
      // byte-identical and the closure report is bound as qc evidence.
      const deviceId =
        typeof values["device-id"] === "string" && values["device-id"].trim()
          ? (values["device-id"] as string)
          : getDeviceId();
      const capsuleId = mintAssetId();
      const capsuleDir = path.join(
        path.resolve(
          typeof values["capsule-root"] === "string" && values["capsule-root"].trim()
            ? (values["capsule-root"] as string)
            : path.join(findRepoRoot(), "apps", "hdri", "capsules"),
        ),
        deviceId,
        period,
        capsuleId,
      );
      const sealedCapsule = await sealConvertedBaselineCapsule({
        capsuleDir,
        preservedCapsuleRoot: path.resolve(required(values["preserved-capsule"])),
        inventory: await readPreservationInventory(required(values["preservation-inventory"])),
        convertedBaselinePath: path.resolve(required(values.target)),
        publicationDir: path.resolve(required(values["publication-dir"])),
        report,
        identity: { period, capsuleId, deviceId },
        signingKey: loadSigningKeyFromEnv(),
      });
      diagnostic = { ...report, sealedCapsule };
    } else {
      const signingKeyId = required(values["key-id"]);
      const publicKeyPem = (
        await readBoundedFile(path.resolve(required(values["verification-key"])), 4096)
      ).toString("utf8");
      diagnostic = await verifyReplicas({
        destinations,
        manifestSha256: required(values["manifest-sha256"]),
        verificationKeys: new Map([[signingKeyId, { signingKeyId, publicKeyPem }]]),
      });
    }
    // Always emit a machine-readable result, even without --json. The baseline report
    // completes only after zero-difference comparison; its status stays
    // compared-not-admitted — admission is a separate gate, not this command's verdict.
    process.stdout.write(`${JSON.stringify(diagnostic)}\n`);
    return diagnostic.status === "pass" ||
      diagnostic.status === "planned" ||
      diagnostic.status === "compared-not-admitted"
      ? 0
      : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    process.stderr.write(
      `[baseline:import error] ${message}\n${error instanceof Error ? (error.stack ?? "") : ""}\n`,
    );
    const reason =
      /^[A-Z][A-Z0-9_]{2,60}(?=:|$)/.exec(message)?.[0] ?? "PRESERVATION_COMMAND_FAILED";
    const code =
      reason === "BASELINE_CONVERSION_UNVERIFIED" || reason === "CHANGED_SOURCE_BYTES"
        ? reason
        : "PRESERVATION_COMMAND_FAILED";
    process.stdout.write(
      `${JSON.stringify({ schema: "hdri-preservation@1", operation: command, status: "incomplete", inputFingerprint: "", evidenceRefs: [], violations: [{ code, message: `${reason}: no successful preservation or baseline conversion is attested.`, artifactRef: "preservation-input" }] })}\n`,
    );
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  process.exitCode = await main();
