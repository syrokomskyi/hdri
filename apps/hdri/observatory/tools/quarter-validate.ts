/*
<MODULE_CONTRACT>
<purpose>Independently validates a fully assembled HDRI release candidate and reports every hard gate.</purpose>
<non-goals><item>Does not write, seal, replicate or publish anything.</item></non-goals>
</MODULE_CONTRACT>
*/

import fs from "node:fs/promises";
import path from "node:path";
import type { QuarterCapsule } from "@syrokomskyi/factory-core";
import { verifyQuarterCapsuleArtifacts } from "@syrokomskyi/factory-core";
import {
  readScientificReports,
  sha256File,
  validateReleaseEvidence,
  type RebuildReceipt,
  type ReplicaReceipt,
} from "../run/release/release-contract";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
if (!arg("--candidate") || !arg("--evidence-dir")) throw new Error("--candidate and --evidence-dir are required");
const candidatePath = path.resolve(arg("--candidate")!);
const capsuleDir = path.dirname(candidatePath);
const candidate = JSON.parse(await fs.readFile(candidatePath, "utf8")) as QuarterCapsule;
await verifyQuarterCapsuleArtifacts(capsuleDir, candidate);
const reports = await readScientificReports(path.resolve(arg("--evidence-dir")!), candidate);
const rebuild = JSON.parse(await fs.readFile(path.join(capsuleDir, "release", "rebuild-receipt.json"), "utf8")) as RebuildReceipt;
const replicas = JSON.parse(await fs.readFile(path.join(capsuleDir, "artifacts", "qc", "release", "replica-receipts.json"), "utf8")) as ReplicaReceipt[];
const report = validateReleaseEvidence(candidate, reports, rebuild, replicas, await sha256File(path.join(capsuleDir, "capsule-candidate.json")));
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== "pass") process.exitCode = 1;
