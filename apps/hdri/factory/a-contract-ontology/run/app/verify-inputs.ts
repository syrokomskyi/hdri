/*
<MODULE_CONTRACT>
<purpose>Read-only diagnostic command that validates a manifest set using the same admission function as normal pipeline execution.</purpose>
<non-goals>
  <item>Does not write any files or modify state.</item>
  <item>Does not run the pipeline.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0106: add --verify-inputs read-only diagnostic command.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import fsp from "node:fs/promises";
import { loadVerificationKeys } from "@syrokomskyi/observatory-crypto";
import { validateManifestSet } from "@syrokomskyi/factory-core";
import { upstreamOutputRoots, briefInputDir } from "../config.js";
import { parseBriefMarkdown } from "../brief.js";

type DiagnosticOutput = {
  schema: "hdri-verify-inputs@1";
  operation: string;
  status: "pass" | "fail";
  inputFingerprint: string;
  evidenceRefs: string[];
  violations: string[];
};

export async function verifyInputs(args: readonly string[]): Promise<void> {
  const sourcesFlagIdx = args.indexOf("--sources");
  if (sourcesFlagIdx === -1 || sourcesFlagIdx + 1 >= args.length) {
    const output: DiagnosticOutput = {
      schema: "hdri-verify-inputs@1",
      operation: "verify-inputs",
      status: "fail",
      inputFingerprint: "",
      evidenceRefs: [],
      violations: ["--sources <manifest-set> is required"],
    };
    console.log(JSON.stringify(output, null, 2));
    process.exitCode = 1;
    return;
  }

  const sourcesArg = args[sourcesFlagIdx + 1]!;
  const manifestPaths = sourcesArg
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let briefMd: string;
  try {
    briefMd = await fsp.readFile(path.join(briefInputDir, "brief.md"), "utf-8");
  } catch (err) {
    const output: DiagnosticOutput = {
      schema: "hdri-verify-inputs@1",
      operation: "verify-inputs",
      status: "fail",
      inputFingerprint: "",
      evidenceRefs: [],
      violations: [`Cannot read brief.md: ${(err as Error).message}`],
    };
    console.log(JSON.stringify(output, null, 2));
    process.exitCode = 1;
    return;
  }

  const brief = parseBriefMarkdown(briefMd);

  const verificationKeys = await loadVerificationKeys(
    path.join(upstreamOutputRoots.harvest, "..", "..", "transparency", "keys"),
  );

  const violations: string[] = [];
  let inputFingerprint = "";
  let evidenceRefs: string[] = [];

  try {
    const verified = await validateManifestSet(
      manifestPaths,
      verificationKeys,
      brief.period,
      brief.capsuleId,
    );
    inputFingerprint = verified.deviceIds.join(",");
    evidenceRefs = [...verified.stageSeals.values()];
  } catch (err) {
    violations.push((err as Error).message);
  }

  const output: DiagnosticOutput = {
    schema: "hdri-verify-inputs@1",
    operation: "verify-inputs",
    status: violations.length === 0 ? "pass" : "fail",
    inputFingerprint,
    evidenceRefs,
    violations,
  };

  console.log(JSON.stringify(output, null, 2));
  if (violations.length > 0) process.exitCode = 1;
}
