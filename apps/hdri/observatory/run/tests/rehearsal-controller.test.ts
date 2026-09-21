import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { QUALIFICATION_STAGES } from "@syrokomskyi/observatory-emit";
import { runRehearsal, type RehearsalOptions } from "../qualification/rehearsal.js";
import { main } from "../../tools/quarter-rehearsal.js";

// Real subprocess contract tests, deliberately NOT proof of the production HDRI chain.
// These tiny adapters exercise the controller only; no operational receipt may result.
const argumentsScript = `
const args = Object.fromEntries(Array.from({length: process.argv.slice(2).length / 2}, (_,i) => [process.argv[2+i*2].slice(2), process.argv[3+i*2]]));
`;
const producerScript = `
import fs from 'node:fs';
${argumentsScript}
const fixture = fs.readFileSync(args['fixture-root'] + '/corpus.txt', 'utf8');
fs.writeFileSync(args['work-root'] + '/' + args.stage + '.json', JSON.stringify({stage:args.stage, targets:Number(args.targets), fixture}));
`;
const verifierScript = `
import fs from 'node:fs';
import {createHash} from 'node:crypto';
${argumentsScript}
const bytes = fs.readFileSync(args['work-root'] + '/' + args.stage + '.json');
const result = JSON.parse(bytes);
if (result.stage !== args.stage || result.targets !== Number(args.targets) || result.fixture !== fs.readFileSync(args['fixture-root']+'/corpus.txt','utf8')) process.exit(2);
console.log(JSON.stringify({schema:'hdri-stage-verification@1',stage:args.stage,status:'pass',targets:Number(args.targets),inputFingerprint:args['input-fingerprint'],consumedSha256:args['consumed'],outputs:[{uri:'work/'+args.stage+'.json',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]}));
`;

let root: string;
let runtime: string;
let fixtures: string;
let profile: string;
let evidence: string;
let options: RehearsalOptions;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-rehearsal-controller-"));
  runtime = path.join(root, "runtime");
  fixtures = path.join(root, "fixtures");
  profile = path.join(root, "profile.json");
  evidence = path.join(root, "evidence");
  await fs.mkdir(runtime);
  await fs.mkdir(fixtures);
  await fs.writeFile(path.join(runtime, "produce.mjs"), producerScript);
  await fs.writeFile(path.join(runtime, "verify.mjs"), verifierScript);
  await fs.writeFile(path.join(fixtures, "corpus.txt"), "controller-only deterministic fixture");
  await fs.writeFile(
    profile,
    JSON.stringify({
      schema: "hdri-rehearsal-profile@1",
      runtimeRoot: runtime,
      fixtureRoot: fixtures,
      stages: QUALIFICATION_STAGES.map((stage) => ({
        stage,
        producer: "produce.mjs",
        verifier: "verify.mjs",
        outputs: [`work/${stage}.json`],
      })),
      comparisonFiles: ["work/scoring.json", "work/independent-rebuild.json"],
      stageTimeoutMs: 5000,
    }),
  );
  options = { profile, evidenceRoot: evidence, targets: 1000 };
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const manifestPath = () => path.join(evidence, "run-manifest.json");
const readManifest = async () => JSON.parse(await fs.readFile(manifestPath(), "utf8"));

describe.runIf(process.platform === "linux")(
  "isolated rehearsal controller, not operational qualification",
  () => {
    it("runs the real CLI and verifies thirteen produced files without granting qualification", async () => {
      const cli = fileURLToPath(new URL("../../tools/quarter-rehearsal.ts", import.meta.url));
      const { stdout } = await promisify(execFile)(
        process.execPath,
        [
          "--import",
          "tsx",
          "--conditions=@syrokomskyi/source",
          cli,
          "--profile",
          profile,
          "--targets",
          "1000",
          "--evidence-root",
          evidence,
          "--json",
        ],
        { cwd: fileURLToPath(new URL("../../", import.meta.url)), timeout: 20_000 },
      );
      const result = JSON.parse(stdout);
      expect(result.status).toBe("complete");
      expect(result.stages.map((stage: { stage: string }) => stage.stage)).toEqual(
        QUALIFICATION_STAGES,
      );
      expect(result.operationallyQualified).toBe(false);
      expect(result.selectedProjectionSha256).toMatch(/^[a-f0-9]{64}$/);
      await expect(fs.access(path.join(evidence, "qualification-receipt.json"))).rejects.toThrow();
      for (const stage of result.stages) {
        const execution = JSON.parse(
          await fs.readFile(path.join(evidence, stage.execution.uri), "utf8"),
        );
        expect(execution.exitCode).toBe(0);
        expect(execution.peakProcessTreeRssBytes).toBeGreaterThan(0);
        expect(stage.samples).toHaveLength(2);
        for (const sample of stage.samples)
          expect((await fs.stat(path.join(evidence, sample.uri))).size).toBeGreaterThan(0);
      }
    }, 25_000);

    it("reuses byte-verified stages after interruption and compares with an independent clean run", async () => {
      const cleanRoot = path.join(root, "clean");
      const clean = await runRehearsal({ ...options, evidenceRoot: cleanRoot });
      await expect(runRehearsal({ ...options, interruptAfterStage: "liveness" })).rejects.toThrow(
        "REHEARSAL_INTERRUPTED",
      );
      const before = await readManifest();
      expect(before.stages).toHaveLength(3);
      const resumed = await runRehearsal({
        ...options,
        resume: manifestPath(),
        compare: path.join(cleanRoot, "run-manifest.json"),
      });
      expect(resumed.stages.slice(0, 3)).toEqual(before.stages);
      expect(resumed.selectedProjectionSha256).toBe(clean.selectedProjectionSha256);
      expect(resumed.comparison?.match).toBe(true);
      expect(resumed.operationallyQualified).toBe(false);
    }, 25_000);

    it("rejects changed completed output without rewriting the interrupted manifest", async () => {
      await expect(
        runRehearsal({ ...options, interruptAfterStage: "source-admission" }),
      ).rejects.toThrow("REHEARSAL_INTERRUPTED");
      const before = await fs.readFile(manifestPath());
      await fs.writeFile(path.join(evidence, "work/source-admission.json"), "corrupted");
      await expect(runRehearsal({ ...options, resume: manifestPath() })).rejects.toThrow(
        "CHANGED_COMPLETED_EVIDENCE",
      );
      expect(await fs.readFile(manifestPath())).toEqual(before);
    });

    it("binds resume to the actual runtime and fixture bytes", async () => {
      await expect(
        runRehearsal({ ...options, interruptAfterStage: "source-admission" }),
      ).rejects.toThrow("REHEARSAL_INTERRUPTED");
      const before = await fs.readFile(manifestPath());
      await fs.appendFile(path.join(runtime, "produce.mjs"), "\n// changed implementation");
      await expect(runRehearsal({ ...options, resume: manifestPath() })).rejects.toThrow(
        "RESUME_INPUT_MISMATCH",
      );
      expect(await fs.readFile(manifestPath())).toEqual(before);
    });

    it("does not accept exit zero without actual stage output", async () => {
      await fs.writeFile(path.join(runtime, "produce.mjs"), "process.exit(0);");
      await expect(runRehearsal(options)).rejects.toThrow();
      expect((await readManifest()).stages).toEqual([]);
      expect((await readManifest()).status).toBe("interrupted");
    });

    it("does not accept a success label without independent verification of actual bytes", async () => {
      await fs.writeFile(
        path.join(runtime, "verify.mjs"),
        "console.log(JSON.stringify({status:'pass'}));",
      );
      await expect(runRehearsal(options)).rejects.toThrow("STAGE_VERIFICATION_MISMATCH");
      expect((await readManifest()).stages).toEqual([]);
    });

    it("rejects a missing adapter before creating an evidence directory", async () => {
      await fs.rename(path.join(runtime, "verify.mjs"), path.join(runtime, "wrong.mjs"));
      await expect(runRehearsal(options)).rejects.toThrow();
      await expect(fs.access(evidence)).rejects.toThrow();
    });

    it("does not create files through a symlinked evidence parent", async () => {
      const outside = path.join(root, "outside");
      const link = path.join(root, "link");
      await fs.mkdir(outside);
      await fs.symlink(outside, link);
      await expect(
        runRehearsal({ ...options, evidenceRoot: path.join(link, "new-run") }),
      ).rejects.toThrow("SYMLINK_REHEARSAL_ROOT");
      expect(await fs.readdir(outside)).toEqual([]);
    });

    it("rejects a second coordinator without changing existing evidence", async () => {
      await expect(
        runRehearsal({ ...options, interruptAfterStage: "source-admission" }),
      ).rejects.toThrow("REHEARSAL_INTERRUPTED");
      const before = await fs.readFile(manifestPath());
      const lock = new Database(path.join(evidence, ".rehearsal-lock.sqlite"));
      try {
        lock.exec("BEGIN EXCLUSIVE");
        await expect(runRehearsal({ ...options, resume: manifestPath() })).rejects.toThrow(
          "locked",
        );
      } finally {
        if (lock.inTransaction) lock.exec("ROLLBACK");
        lock.close();
      }
      expect(await fs.readFile(manifestPath())).toEqual(before);
    });

    it("requires explicit resume and forbids self-comparison", async () => {
      await fs.mkdir(evidence);
      await fs.writeFile(path.join(evidence, "sentinel"), "retain");
      await expect(runRehearsal(options)).rejects.toThrow("FRESH_REHEARSAL_ROOT_NOT_EMPTY");
      await expect(runRehearsal({ ...options, compare: manifestPath() })).rejects.toThrow(
        "SELF_COMPARISON_FORBIDDEN",
      );
      expect(await fs.readFile(path.join(evidence, "sentinel"), "utf8")).toBe("retain");
    });

    it.each([
      ["--ignored-option"],
      ["--resume"],
      ["--profile", "p", "--targets", "1e3", "--evidence-root", "p"],
    ])("rejects ignored or ambiguous CLI arguments: %j", async (...args) => {
      await expect(main(args)).rejects.toThrow();
      await expect(fs.access(evidence)).rejects.toThrow();
    });
  },
);
