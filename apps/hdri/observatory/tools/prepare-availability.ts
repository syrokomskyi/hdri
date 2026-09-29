/*
<MODULE_CONTRACT>
  <purpose>Prepare a private availability-only candidate using authenticated retained liveness execution evidence.</purpose>
  <non-goals><item>Does not publish, seal the quarter, modify raw evidence, or substitute for independent release verification.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Add explicit capsule/key inputs and content-addressed, retry-stable private candidate output.</item></CHANGE_SUMMARY>
*/
// @ai-invariant: Preparing an aggregate confers no publish authority; never write it into the public archive.

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { parse as parseYaml } from "yaml";
import {
  capsuleConfigSha256,
  loadVerifiedQuarterExecution,
  validateCapsule,
  type HdriPeriod,
  type QuarterCapsule,
} from "@syrokomskyi/factory-core";
import { loadVerificationKeys } from "@syrokomskyi/observatory-crypto";
import { deriveAvailabilityCandidate } from "../run/release/availability-candidate";
import { loadKAnonPolicy } from "./k-anon-policy";

const digest = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

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
    throw new Error("--capsule-dir and --keys-dir are required");
  const capsuleDir = await fs.realpath(path.resolve(values["capsule-dir"]));
  const manifest = JSON.parse(
    await fs.readFile(path.join(capsuleDir, "capsule-staging.json"), "utf8"),
  ) as QuarterCapsule;
  validateCapsule(manifest);
  if (!manifest.deviceId) throw new Error("AVAILABILITY_DEVICE_REQUIRED");
  const keys = await loadVerificationKeys(await fs.realpath(path.resolve(values["keys-dir"])));
  if (!keys.size) throw new Error("AVAILABILITY_VERIFICATION_KEYS_MISSING");
  const execution = await loadVerifiedQuarterExecution(capsuleDir, ["liveness"], keys);
  if (
    execution.capsuleConfigSha256 !==
    capsuleConfigSha256(manifest.period as HdriPeriod, manifest.capsuleId, manifest.instrumentPlan)
  )
    throw new Error("AVAILABILITY_CAPSULE_CONFIG_MISMATCH");
  const policy = await loadKAnonPolicy();
  const policyBytes = await fs.readFile(path.resolve(policy.policyPath));
  const retainedPolicy = parseYaml(policyBytes.toString("utf8"));
  if (
    retainedPolicy.default_k !== policy.default_k ||
    retainedPolicy.hard_floor !== policy.hard_floor ||
    retainedPolicy.high_risk_release !== policy.high_risk_release
  )
    throw new Error("AVAILABILITY_POLICY_CHANGED");
  const candidate = await deriveAvailabilityCandidate(
    capsuleDir,
    execution,
    {
      period: manifest.period,
      capsuleId: manifest.capsuleId,
      deviceId: manifest.deviceId,
    },
    policy.effective_k_min,
  );
  if (digest(await fs.readFile(path.resolve(policy.policyPath))) !== digest(policyBytes))
    throw new Error("AVAILABILITY_POLICY_CHANGED");
  const bytes = `${JSON.stringify(
    {
      ...candidate,
      policySha256: digest(policyBytes),
      keyAuthority: "explicit-caller-supplied-keys-not-publication-admission",
    },
    null,
    2,
  )}\n`;
  const hash = digest(bytes);
  // Private scratch is deliberately outside the capsule and the publication route.
  const root = path.resolve(
    ".output",
    "availability-candidates",
    manifest.period,
    manifest.capsuleId,
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
        throw new Error("AVAILABILITY_CANDIDATE_COLLISION");
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
  process.stdout.write(
    `${JSON.stringify({
      status: candidate.status,
      candidatePath: target,
      sha256: hash,
      n: candidate.n,
      counts: candidate.counts,
      cellPrivacy: candidate.cellPrivacy,
    })}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
