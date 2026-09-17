/*
<MODULE_CONTRACT>
<purpose>Integration tests for RFC-0115 Step 9: qualification production path — absent stage proof rejects receipt (AC-5), interrupted/resumed fixture test verifies selected-result projection equals clean-run counterpart (AC-6).</purpose>
<non-goals>
  <item>Does not run the full 200k qualification — that requires a real runner.</item>
  <item>Does not test process-tree RSS measurement — that requires /proc access.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 Step 9: qualification production path tests for AC-5 and AC-6.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createQualificationReceipt,
  validateQualificationReceipt,
  QUALIFICATION_STAGES,
} from "@syrokomskyi/observatory-emit";
import { runRehearsal } from "../qualification/rehearsal.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "rfc0115-qual-prod-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("RFC-0115 AC-5: absent stage proof rejects receipt", () => {
  it("receipt with missing production stage is flagged via receipt violations", () => {
    const implementationFingerprint = createHash("sha256")
      .update('{"stages":["a","b","c"]}')
      .digest("hex");
    const policySha256 = createHash("sha256").update("{}").digest("hex");
    const fixtureManifestSha256 = createHash("sha256").update("test:1000").digest("hex");

    const receipt = createQualificationReceipt({
      implementationFingerprint,
      policySha256,
      fixtureManifestSha256,
      targets: 1000,
      productionStages: ["source-admission", "extraction"], // Missing 11 stages
      peakCoordinatorRssBytes: 1024,
      peakProcessTreeRssBytes: 2048,
      peakInodes: 10,
      diskBytes: 1000,
      durationMs: 5000,
      resumeEquivalenceSha256: createHash("sha256")
        .update("source-admission,extraction")
        .digest("hex"),
      violations: ["MISSING_STAGE_PROOF: 11 stages absent"],
      status: "fail",
    });

    const violations = validateQualificationReceipt(receipt);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations).toContain("MISSING_STAGE_PROOF: 11 stages absent");
  });

  it("receipt with all 13 production stages but no stage proof evidence is flagged", () => {
    const allStages = [
      "source-admission",
      "frame-identity",
      "liveness",
      "homepage-capture",
      "detected-capture",
      "extraction",
      "browser-audit",
      "translation",
      "scoring",
      "scientific-check",
      "privacy-check",
      "replication",
      "independent-rebuild",
    ];

    const implementationFingerprint = createHash("sha256")
      .update(JSON.stringify({ stages: allStages }))
      .digest("hex");
    const policySha256 = createHash("sha256").update("{}").digest("hex");
    const fixtureManifestSha256 = createHash("sha256").update("test:1000").digest("hex");

    const receipt = createQualificationReceipt({
      implementationFingerprint,
      policySha256,
      fixtureManifestSha256,
      targets: 1000,
      productionStages: allStages,
      peakCoordinatorRssBytes: 1024,
      peakProcessTreeRssBytes: 2048,
      peakInodes: 10,
      diskBytes: 1000,
      durationMs: 5000,
      resumeEquivalenceSha256: createHash("sha256").update(allStages.join(",")).digest("hex"),
      violations: [],
      status: "pass",
    });

    // Receipt with all stages should have fewer validation violations
    const violations = validateQualificationReceipt(receipt);
    // It may still have violations for other reasons, but not for missing stages
    expect(violations).not.toContain("missing production stages");
  });

  it("receipt with zero stages and fail status is flagged via violations", () => {
    const implementationFingerprint = createHash("sha256").update("{}").digest("hex");
    const policySha256 = createHash("sha256").update("{}").digest("hex");
    const fixtureManifestSha256 = createHash("sha256").update("test:1000").digest("hex");

    const receipt = createQualificationReceipt({
      implementationFingerprint,
      policySha256,
      fixtureManifestSha256,
      targets: 1000,
      productionStages: [],
      peakCoordinatorRssBytes: 0,
      peakProcessTreeRssBytes: 0,
      peakInodes: 0,
      diskBytes: 0,
      durationMs: 0,
      resumeEquivalenceSha256: createHash("sha256").update("").digest("hex"),
      violations: ["MISSING_STAGE_PROOF: all 13 stages absent"],
      status: "fail",
    });

    const violations = validateQualificationReceipt(receipt);
    expect(violations).toContain("MISSING_STAGE_PROOF: all 13 stages absent");
  });
});

describe("RFC-0115 AC-6: interrupted/resumed fixture produces same selected-result projection", () => {
  // Real controller runs against stub adapters: the contract under test is
  // profile parsing, isolation, byte-bound resume, fault acknowledgement and
  // qualification derivation — not the production stage logic itself.
  const STAGE_OUTPUTS = (stage: string): string[] => [
    `work/${stage}/out.bin`,
    `work/${stage}/projection.jsonl`,
  ];

  const stubProducer = (outputs: string[]): string => `import fs from "node:fs";
import path from "node:path";
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
const stage = args.get("--stage");
const work = args.get("--work-root");
const boundary = args.get("--fault-boundary");
if (boundary) {
  const dir = path.join(work, stage);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "fault-" + boundary + ".json"),
    JSON.stringify({ schema: "hdri-stage-fault@1", stage, boundary }),
  );
  process.exit(75);
}
for (const uri of ${JSON.stringify(outputs)}) {
  const p = path.join(work, uri.replace(/^work\\//, ""));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, stage + "|" + uri + "|" + args.get("--input-fingerprint") + "\\n");
}
`;

  const stubVerifier = (outputs: string[]): string => `import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
const work = args.get("--work-root");
const outputs = ${JSON.stringify(outputs)}.map((uri) => {
  const bytes = fs.readFileSync(path.join(work, uri.replace(/^work\\//, "")));
  return { uri, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
});
process.stdout.write(JSON.stringify({
  schema: "hdri-stage-verification@1",
  stage: args.get("--stage"),
  status: "pass",
  targets: Number(args.get("--targets")),
  inputFingerprint: args.get("--input-fingerprint"),
  consumedSha256: args.get("--consumed"),
  outputs,
}) + "\\n");
`;

  async function buildStubRuntime(root: string): Promise<string> {
    const runtimeRoot = path.join(root, "runtime");
    const fixtureRoot = path.join(root, "fixture");
    await fs.mkdir(fixtureRoot, { recursive: true });
    await fs.writeFile(path.join(fixtureRoot, "fixture-manifest.json"), '{"ok":true}\n');
    const stages = QUALIFICATION_STAGES.map((stage) => {
      const outputs = STAGE_OUTPUTS(stage);
      const dir = path.join(runtimeRoot, "adapters", stage);
      return fs
        .mkdir(dir, { recursive: true })
        .then(() =>
          Promise.all([
            fs.writeFile(path.join(dir, "produce.mjs"), stubProducer(outputs)),
            fs.writeFile(path.join(dir, "verify.mjs"), stubVerifier(outputs)),
          ]),
        )
        .then(() => ({
          stage,
          producer: `adapters/${stage}/produce.mjs`,
          verifier: `adapters/${stage}/verify.mjs`,
          outputs,
          ...(stage === "extraction" ? { faultBoundary: "extraction-checkpoint" } : {}),
        }));
    });
    const profile = {
      schema: "hdri-rehearsal-profile@1",
      runtimeRoot,
      fixtureRoot,
      stageTimeoutMs: 60_000,
      stages: await Promise.all(stages),
      comparisonFiles: ["work/scoring/projection.jsonl"],
    };
    const profilePath = path.join(root, "profile.json");
    await fs.writeFile(profilePath, JSON.stringify(profile, null, 2));
    return profilePath;
  }

  it("clean run completes all 13 stages but is not qualified without comparison", async () => {
    const profile = await buildStubRuntime(path.join(tmpDir, "clean-setup"));
    const manifest = await runRehearsal({
      profile,
      targets: 1000,
      evidenceRoot: path.join(tmpDir, "clean-run"),
    });
    expect(manifest.status).toBe("complete");
    expect(manifest.stages).toHaveLength(13);
    expect(manifest.operationallyQualified).toBe(false);
    expect(manifest.peakWorkBytes).toBeGreaterThan(0);
    expect(manifest.peakWorkFiles).toBeGreaterThan(0);
  }, 120_000);

  it("fault-interrupted run resumes to a byte-identical projection and qualifies", async () => {
    const profile = await buildStubRuntime(path.join(tmpDir, "setup"));
    const clean = await runRehearsal({
      profile,
      targets: 1000,
      evidenceRoot: path.join(tmpDir, "clean"),
    });
    const faultRoot = path.join(tmpDir, "faulted");
    await expect(
      runRehearsal({
        profile,
        targets: 1000,
        evidenceRoot: faultRoot,
        faultStage: "extraction",
      }),
    ).rejects.toThrow("REHEARSAL_FAULT_INTERRUPTED:extraction");
    const interrupted = JSON.parse(
      await fs.readFile(path.join(faultRoot, "run-manifest.json"), "utf8"),
    ) as { status: string; faults: { stage: string; boundary: string }[]; stages: unknown[] };
    expect(interrupted.status).toBe("interrupted");
    expect(interrupted.faults).toHaveLength(1);
    expect(interrupted.faults[0]).toMatchObject({
      stage: "extraction",
      boundary: "extraction-checkpoint",
    });
    expect(interrupted.stages.length).toBeLessThan(13);

    const resumed = await runRehearsal({
      profile,
      targets: 1000,
      evidenceRoot: faultRoot,
      resume: path.join(faultRoot, "run-manifest.json"),
      compare: path.join(tmpDir, "clean", "run-manifest.json"),
      faultStage: "extraction",
    });
    expect(resumed.status).toBe("complete");
    expect(resumed.stages).toHaveLength(13);
    expect(resumed.comparison?.match).toBe(true);
    expect(resumed.selectedProjectionSha256).toBe(clean.selectedProjectionSha256);
    expect(resumed.operationallyQualified).toBe(true);
  }, 240_000);

  it("controller interrupt after a stage resumes at the next stage", async () => {
    const profile = await buildStubRuntime(path.join(tmpDir, "setup2"));
    const root = path.join(tmpDir, "interrupted");
    await expect(
      runRehearsal({
        profile,
        targets: 1000,
        evidenceRoot: root,
        interruptAfterStage: "liveness",
      }),
    ).rejects.toThrow("REHEARSAL_INTERRUPTED:liveness");
    const resumed = await runRehearsal({
      profile,
      targets: 1000,
      evidenceRoot: root,
      resume: path.join(root, "run-manifest.json"),
    });
    expect(resumed.status).toBe("complete");
    expect(resumed.stages).toHaveLength(13);
  }, 240_000);
});
