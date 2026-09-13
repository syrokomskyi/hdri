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

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { parseAdmissionInput } from "@syrokomskyi/factory-core";

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      period: { type: "string" },
      operation: { type: "string" },
      "evidence-input": { type: "string" },
      json: { type: "boolean", default: false },
    },
  });
  if (
    !values.period ||
    !/^\d{4}-q[1-4]$/.test(values.period) ||
    !values.operation ||
    !["preserve", "collect", "publish"].includes(values.operation) ||
    !values["evidence-input"]
  ) {
    throw new Error("EXPLICIT_PERIOD_OPERATION_AND_EVIDENCE_INPUT_REQUIRED");
  }
  const input = parseAdmissionInput(
    JSON.parse(await fs.readFile(values["evidence-input"], "utf8")),
  );
  if (input.scope.period !== values.period || input.scope.operation !== values.operation)
    throw new Error("ADMISSION_SCOPE_MISMATCH");
  // There is no production implementation of AdmissionVerificationDeps in this repository yet.
  // Removing this guard requires pinned keys, bounded closure I/O and verified domain verdicts.
  const report = {
    schema: "hdri-admission-report@1",
    operation: values.operation,
    period: values.period,
    status: "blocked",
    inputFingerprint: null,
    evidenceRefs: [],
    violations: [{ code: "ADMISSION_VERIFIER_UNAVAILABLE" }],
  };
  process.stdout.write(
    values.json
      ? `${JSON.stringify(report)}\n`
      : "Quarter readiness is blocked: authenticated evidence verification is not wired.\n",
  );
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({ status: "blocked", error: error instanceof Error ? error.message : String(error) })}\n`,
    );
    process.exitCode = 1;
  });
}
