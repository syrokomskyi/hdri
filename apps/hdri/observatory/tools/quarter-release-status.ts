/*
<MODULE_CONTRACT>
<purpose>Read-only release artifact inspection with explicit scope and no inferred scientific, custody or publication success.</purpose>
<non-goals><item>Does not verify trusted signatures, remote custody, admission or public delivery; does not mutate release evidence.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Reject guessed period/receipt paths and false published status from unverified attestation presence.</item></CHANGE_SUMMARY>
*/
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { verifyReleaseEnvelope, type ReleaseEnvelope } from "../run/release/release-contract";

/** An artifact inspector must not claim verified release state from caller-owned JSON. */
export async function inspectReleaseArtifacts(vaultDir: string, period: string, releaseId: string) {
  if (!/^\d{4}-q[1-4]$/.test(period) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(releaseId))
    throw new Error("EXPLICIT_RELEASE_SCOPE_INVALID");
  const envelopePath = path.join(path.resolve(vaultDir), "releases", `period=${period}`, `${releaseId}.json`);
  let envelopeFound = false;
  let envelopeSha256: string | null = null;
  let envelopeFileSha256: string | null = null;
  const violations: string[] = [];
  try {
    const bytes = await fs.readFile(envelopePath);
    envelopeFound = true;
    envelopeFileSha256 = createHash("sha256").update(bytes).digest("hex");
    const envelope = JSON.parse(bytes.toString("utf8")) as ReleaseEnvelope;
    if (!envelope || !Array.isArray(envelope.inventory) ||
      envelope.inventory.some(entry => !entry || typeof entry !== "object")) {
      violations.push("envelope_shape_invalid");
    } else {
      violations.push(...verifyReleaseEnvelope(envelope));
      if (envelope.period !== period || envelope.releaseId !== releaseId)
        violations.push("envelope_scope_mismatch");
      // The writer signs the compact serialization hash, not the pretty file hash.
      envelopeSha256 = createHash("sha256").update(JSON.stringify(envelope)).digest("hex");
    }
  } catch (error) {
    violations.push((error as NodeJS.ErrnoException).code === "ENOENT" ? "envelope_not_found" : "envelope_unreadable_or_invalid");
  }
  return {
    command: "hdri.quarter.release-status",
    status: violations.length ? "fail" : "unverified",
    period, releaseId, envelopePath, envelopeFound, envelopeSha256, envelopeFileSha256,
    releaseState: null, replicasVerified: null, attestationDelivered: null, violations,
    unverifiedRequirements: ["trusted-attestation-signature", "scientific-and-publication-admission",
      "local-and-remote-closure-custody", "public-archive-content-and-delivery"],
  };
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    "release-id": { type: "string" }, period: { type: "string" }, "vault-dir": { type: "string" }, json: { type: "boolean" },
  } });
  if (!values["release-id"] || !values.period || !values["vault-dir"])
    throw new Error("--period, --release-id and --vault-dir are required");
  const result = await inspectReleaseArtifacts(values["vault-dir"], values.period, values["release-id"]);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  // No successful publication verdict is implemented here; CI must not treat inspection as a gate pass.
  process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
