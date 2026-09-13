/*
<MODULE_CONTRACT>
  <purpose>Parse explicit offline rehearsal inputs and execute the byte-verifying isolated controller.</purpose>
  <non-goals>
    <item>Does not mark unimplemented production stages complete or grant operational qualification.</item>
    <item>Does not discover live collectors, production credentials or collected quarter data.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 review: remove fabricated stage proofs and reject ignored or malformed CLI arguments.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { runRehearsal } from "../run/qualification/rehearsal.js";

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      profile: { type: "string" },
      targets: { type: "string" },
      "evidence-root": { type: "string" },
      resume: { type: "string" },
      compare: { type: "string" },
      "interrupt-after-stage": { type: "string" },
      json: { type: "boolean", default: false },
    },
  });
  if (!values.profile || !values.targets || !values["evidence-root"])
    throw new Error("EXPLICIT_PROFILE_TARGETS_AND_EVIDENCE_ROOT_REQUIRED");
  if (!/^(1000|10000|50000|200000)$/.test(values.targets)) throw new Error("INVALID_TARGET_COUNT");
  const result = await runRehearsal({
    profile: values.profile,
    targets: Number(values.targets),
    evidenceRoot: values["evidence-root"],
    resume: values.resume,
    compare: values.compare,
    interruptAfterStage: values["interrupt-after-stage"],
  });
  if (values.json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else
    process.stdout.write(
      `Verified ${result.stages.length} adapter stages. Operational qualification is not granted.\n`,
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({ status: "fail", error: error instanceof Error ? error.message : String(error) })}\n`,
    );
    process.exitCode = 1;
  });
}
