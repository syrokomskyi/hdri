/*
<MODULE_CONTRACT>
  <purpose>Run independent target-level availability reconciliation and retain a private content-addressed comparison artifact.</purpose>
  <non-goals><item>Does not publish, modify the capsule, or grant operational admission.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0115: expose complete signed-bundle versus selected-CAS reconciliation as an executable command.</item></CHANGE_SUMMARY>
*/
// @ai-invariant: Do not write a comparison artifact before the complete input stream and all signatures pass.

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  capsuleConfigSha256,
  loadVerifiedQuarterExecution,
  validateCapsule,
  type QuarterCapsule,
  type HdriPeriod,
} from "@syrokomskyi/factory-core";
import { loadVerificationKeys } from "@syrokomskyi/observatory-crypto";
import { reconcileAvailabilityBundle } from "../run/release/availability-reconciliation";

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      "capsule-dir": { type: "string" },
      "keys-dir": { type: "string" },
    },
  });
  if (!values["capsule-dir"] || !values["keys-dir"])
    throw new Error("EXPLICIT_CAPSULE_AND_KEYS_REQUIRED");
  const capsuleDir = await fs.realpath(path.resolve(values["capsule-dir"]));
  const capsule = JSON.parse(
    await fs.readFile(path.join(capsuleDir, "capsule-staging.json"), "utf8"),
  ) as QuarterCapsule;
  validateCapsule(capsule);
  if (!capsule.deviceId) throw new Error("AVAILABILITY_DEVICE_REQUIRED");
  const keys = await loadVerificationKeys(path.resolve(values["keys-dir"]));
  if (!keys.size) throw new Error("AVAILABILITY_VERIFICATION_KEYS_MISSING");
  const execution = await loadVerifiedQuarterExecution(capsuleDir, ["liveness"], keys);
  if (
    execution.capsuleConfigSha256 !==
    capsuleConfigSha256(capsule.period as HdriPeriod, capsule.capsuleId, capsule.instrumentPlan)
  )
    throw new Error("AVAILABILITY_CAPSULE_CONFIG_MISMATCH");
  const result = await reconcileAvailabilityBundle(
    capsuleDir,
    execution,
    path.join(capsuleDir, "artifacts", "emit"),
    {
      period: capsule.period,
      capsuleId: capsule.capsuleId,
      deviceId: capsule.deviceId,
    },
    keys,
  );
  const bytes = `${JSON.stringify(result, null, 2)}\n`;
  const hash = createHash("sha256").update(bytes).digest("hex");
  const root = path.resolve(
    ".output",
    "availability-reconciliation",
    capsule.period,
    capsule.capsuleId,
  );
  await fs.mkdir(root, { recursive: true });
  const target = path.join(root, `${hash}.json`);
  const temporary = path.join(root, `.${randomUUID()}.tmp`);
  const file = await fs.open(temporary, "wx", 0o600);
  try {
    await file.writeFile(bytes);
    await file.sync();
  } finally {
    await file.close();
  }
  try {
    try {
      await fs.link(temporary, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if ((await fs.readFile(target, "utf8")) !== bytes)
        throw new Error("AVAILABILITY_COMPARISON_COLLISION");
    }
  } finally {
    await fs.unlink(temporary);
  }
  const directory = await fs.open(root, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
  process.stdout.write(`${JSON.stringify({ ...result, reportPath: target, sha256: hash })}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
