/*
<MODULE_CONTRACT>
  <purpose>Validate explicit readiness requests without granting authority from unchecked reference strings.</purpose>
  <non-goals>
    <item>Does not manufacture readiness receipts or modify quarter inputs.</item>
    <item>Does not substitute a shape check for missing authenticated evidence I/O.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0113/0115 review: remove digest-file fallback and fail closed until trusted evidence verification is wired.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  createFileAdmissionVerificationDeps,
  evaluateProgramGate,
  parseAdmissionInput,
  parseAdmissionTrustManifest,
  verifyAdmissionInput,
} from "@syrokomskyi/factory-core";
import { readBoundedFile } from "@warpgogol/pipeline-node";

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      period: { type: "string" },
      operation: { type: "string" },
      "evidence-input": { type: "string" },
      "evidence-root": { type: "string" },
      "trusted-keys": { type: "string" },
      json: { type: "boolean", default: false },
    },
  });
  if (
    !values.period ||
    !/^\d{4}-q[1-4]$/.test(values.period) ||
    !values.operation ||
    !["preserve", "collect", "publish"].includes(values.operation) ||
    !values["evidence-input"] ||
    !values["evidence-root"] ||
    !values["trusted-keys"]
  ) {
    throw new Error("EXPLICIT_PERIOD_OPERATION_EVIDENCE_ROOT_AND_TRUSTED_KEYS_REQUIRED");
  }
  const input = parseAdmissionInput(
    JSON.parse(
      (await readBoundedFile(path.resolve(values["evidence-input"]), 4 * 1024 * 1024)).toString(
        "utf8",
      ),
    ),
  );
  if (input.scope.period !== values.period || input.scope.operation !== values.operation)
    throw new Error("ADMISSION_SCOPE_MISMATCH");
  const trustedKeys = parseAdmissionTrustManifest(
    JSON.parse(
      (await readBoundedFile(path.resolve(values["trusted-keys"]), 4 * 1024 * 1024)).toString(
        "utf8",
      ),
    ),
  );
  const verified = await verifyAdmissionInput(
    input,
    createFileAdmissionVerificationDeps({
      evidenceRoot: path.resolve(values["evidence-root"]),
      trustedKeys,
    }),
  );
  const gate = evaluateProgramGate(verified);
  const report = {
    schema: "hdri-admission-report@1",
    operation: values.operation,
    period: values.period,
    status: gate.status === "allowed" ? "ready" : "blocked",
    inputFingerprint: gate.inputFingerprint,
    evidenceRefs: gate.evidenceRefs,
    violations: gate.blockerCodes.map((code) => ({ code })),
  };
  process.stdout.write(
    values.json
      ? `${JSON.stringify(report)}\n`
      : gate.status === "allowed"
        ? "Quarter readiness is ready: authenticated evidence verification passed.\n"
        : `Quarter readiness is blocked: ${gate.blockerCodes.join(", ")}\n`,
  );
  process.exitCode = gate.status === "allowed" ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({ status: "blocked", error: error instanceof Error ? error.message : String(error) })}\n`,
    );
    process.exitCode = 1;
  });
}
