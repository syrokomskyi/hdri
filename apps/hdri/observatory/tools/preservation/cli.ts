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
import { loadSigningKeyFromEnv } from "@syrokomskyi/observatory-crypto";
import { readBoundedFile } from "@warpgogol/pipeline-node";
import {
  parseDestinations,
  parsePreservationInventory,
  preserveQ2,
  verifyReplicas,
} from "./preserve.js";

const readJson = async (file: string): Promise<unknown> =>
  JSON.parse((await readBoundedFile(path.resolve(file), 64 * 1024 * 1024)).toString("utf8"));
function required(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("REQUIRED_ARGUMENT_MISSING");
  return value;
}
export async function main(args = process.argv.slice(2)): Promise<number> {
  const [command, ...rest] = args;
  try {
    // No partial conversion may produce a successful CLI receipt. Replacement is
    // the next A1 step; the old converter is intentionally not imported here.
    if (command === "baseline:import") throw new Error("BASELINE_CONVERSION_UNVERIFIED");
    if (command !== "preserve:q2" && command !== "preserve:verify")
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
      const raw = await readJson(required(values.inventory));
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
      const dryRun = values["dry-run"] === true;
      diagnostic = await preserveQ2({
        inventory: parsePreservationInventory(input.entries),
        sourceRoots: input.sourceRoots as string[],
        destinations,
        dryRun,
        signingKey: dryRun ? undefined : loadSigningKeyFromEnv(),
      });
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
    // Always emit a machine-readable result, even without --json.
    process.stdout.write(`${JSON.stringify(diagnostic)}\n`);
    return diagnostic.status === "pass" || diagnostic.status === "planned" ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
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
