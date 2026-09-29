import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deriveAssetId,
  readOntologyFile,
  withAvailabilityOntologyV2,
  type SignalOntology,
} from "@syrokomskyi/observatory-core";
import { generateSigningKey } from "@syrokomskyi/observatory-crypto";
import {
  createQuarterCapsuleStaging,
  DEFAULT_INSTRUMENT_PLAN,
  QuarterExecutionJournal,
  loadVerifiedQuarterExecution,
  writeExecutionCasObject,
  sha256File,
  capsuleConfigSha256,
  type WorkKey,
} from "@syrokomskyi/factory-core";
import type { PipelineContext } from "../pipeline/types.js";

const fixture = vi.hoisted(() => ({ root: "" }));
vi.mock("../config.js", () => ({
  get outputRootDir() {
    return fixture.root;
  },
}));

import {
  reconcileTranslationCoverage,
  TranslateOntologyGogol,
} from "../gogols/TranslateOntologyGogol.js";

let ontology: SignalOntology;
const paths = [
  "legal.impressum.present",
  "availability.website.outcome",
  "availability.website.is_reachable",
  "availability.website.error_code",
  "audit.axe.violations.total.count",
];

beforeEach(async () => {
  fixture.root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-coverage-"));
  const full = withAvailabilityOntologyV2(
    await readOntologyFile("apps/hdri/observatory/.input/ontology.yaml"),
  );
  ontology = { ...full, signals: Object.fromEntries(paths.map((p) => [p, full.signals[p]!])) };
});
afterEach(async () => {
  await fs.rm(fixture.root, { recursive: true, force: true });
});

function persistedSignals(signals: string[]): string {
  const dbPath = path.join(fixture.root, "coverage.sqlite");
  const db = new Database(dbPath);
  try {
    db.exec("CREATE TABLE observations (conflict_key TEXT, payload_json TEXT)");
    const insert = db.prepare("INSERT INTO observations VALUES (?, ?)");
    for (const signal_path of signals) {
      insert.run(`asset\0${signal_path}`, JSON.stringify({ signal_path }));
    }
  } finally {
    db.close();
  }
  return dbPath;
}

async function translationContext(emptyProfile = false): Promise<PipelineContext> {
  const period = "2026-q3";
  const capsuleId = "019ff219-69fe-7025-943c-dae2a8c37801";
  const signingKey = {
    ...generateSigningKey(),
    signingKeyId: "test-key",
    collectorId: "test-device",
  };
  const profileHtml = "<html><body><a href='/impressum'>Impressum</a></body></html>";
  const profileHash = createHash("sha256").update(profileHtml).digest("hex");
  await fs.mkdir(path.join(fixture.root, "data/content", profileHash.slice(0, 2)), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(fixture.root, "data/content", profileHash.slice(0, 2), `${profileHash}.html`),
    profileHtml,
  );
  await createQuarterCapsuleStaging(
    fixture.root,
    { period, capsuleId, deviceId: "test-device" },
    DEFAULT_INSTRUMENT_PLAN,
  );
  const journal = new QuarterExecutionJournal(
    path.join(fixture.root, "staging/execution/events"),
    capsuleConfigSha256(period, capsuleId, DEFAULT_INSTRUMENT_PLAN),
    signingKey,
  );
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 7, 1) + tick++ * 1000).toISOString();
  await journal.initialize("configured", now());
  const stages = {
    "homepage-capture": [deriveAssetId("example.test"), deriveAssetId("shared.test")],
    liveness: ["da-live", "da-dead"],
    axe: ["da-live"],
  } as const;
  for (const [stageId, assetIds] of Object.entries(stages)) {
    const keys = assetIds.map(
      (provisionalAssetId) =>
        ({
          period,
          capsuleId,
          stageId,
          provisionalAssetId,
          instrumentVersion: "test-v1",
        }) as WorkKey,
    );
    await journal.declareStageTargets({
      stageId: stageId as WorkKey["stageId"],
      keys,
      eventId: `targets-${stageId}`,
      now: now(),
    });
    for (const key of keys) {
      const attempt = await journal.begin({
        key,
        attemptId: `attempt-${stageId}-${key.provisionalAssetId}`,
        leaseOwner: "test-device",
        now: now(),
        leaseExpiresAt: "2026-08-02T00:00:00.000Z",
      });
      const live = key.provisionalAssetId === "da-live";
      const body =
        stageId === "homepage-capture"
          ? {
              siteId: key.provisionalAssetId === deriveAssetId("example.test") ? 1 : 2,
              result: { ok: true, contentHash: profileHash },
            }
          : stageId === "liveness"
            ? {
                result: {
                  domain: live ? "example.test" : "dead.test",
                  httpStatus: live ? 200 : null,
                  latencyMs: live ? 20 : null,
                  isLive: live,
                  errorCode: live ? null : "timeout",
                },
              }
            : {
                result: {
                  ok: true,
                  extracted: {
                    violationsTotal: 2,
                    criticalCount: 0,
                    seriousCount: 1,
                    moderateCount: 1,
                    minorCount: 0,
                    nodesScanned: 50,
                    axeVersion: "test-v1",
                  },
                },
              };
      const evidence = await writeExecutionCasObject(fixture.root, {
        schemaVersion: stageId === "axe" ? 2 : 1,
        stage: stageId === "homepage-capture" ? "profile" : stageId,
        provisionalAssetId: key.provisionalAssetId,
        ...body,
      });
      await journal.finish(attempt!, {
        eventId: `done-${stageId}-${key.provisionalAssetId}`,
        now: now(),
        state: "succeeded",
        resultSha256: evidence.sha256,
      });
    }
    await journal.sealStage({
      stageId: stageId as WorkKey["stageId"],
      keys,
      eventId: `sealed-${stageId}`,
      now: now(),
      outputArtifacts: [],
    });
  }
  const execution = await loadVerifiedQuarterExecution(
    fixture.root,
    ["homepage-capture", "liveness", "axe"],
    new Map([[signingKey.signingKeyId, signingKey]]),
  );
  const source = async (dbPath: string, stage: "profile" | "liveness" | "axe") => ({
    deviceId: "test-device",
    capsuleDir: fixture.root,
    sourceOutputRoot: fixture.root,
    execution,
    artifact: {
      stage,
      uri: path.basename(dbPath),
      sha256: await sha256File(dbPath),
      bytes: (await fs.stat(dbPath)).size,
    },
  });
  const pagesDbPath = path.join(fixture.root, "pages.db");
  const pages = new Database(pagesDbPath);
  pages.exec(`
    CREATE TABLE ext_impressum (content_sha256 TEXT, extractor_ver TEXT, extracted_at INTEGER, present INTEGER,
      asset_id TEXT, page_observation_id INTEGER, effective_url TEXT, policy_hash TEXT);
    CREATE TABLE page_observations (content_sha256 TEXT, site_page_id INTEGER);
    CREATE TABLE site_pages (id INTEGER, url_norm TEXT, site_id INTEGER);
    INSERT INTO ext_impressum VALUES ('${profileHash}', 'test-v1', 1785542400, 1, '1', 1, 'https://example.test/', 'policy');
    INSERT INTO ext_impressum VALUES ('${profileHash}', 'test-v1', 1785542400, 1, '2', 2, 'https://shared.test/', 'policy');
    INSERT INTO page_observations VALUES ('${profileHash}', 1), ('${profileHash}', 2);
    INSERT INTO site_pages VALUES (1, 'https://example.test/', 1), (2, 'https://shared.test/', 2);
  `);
  if (emptyProfile) pages.exec("DELETE FROM ext_impressum");
  pages.close();
  const livenessDbPath = path.join(fixture.root, "liveness.db");
  const live = new Database(livenessDbPath);
  live.exec(`
    CREATE TABLE liveness_checks (provisional_asset_id TEXT, domain TEXT, checked_at INTEGER,
      http_status INTEGER, latency_ms INTEGER, is_live INTEGER, error_code TEXT);
    INSERT INTO liveness_checks VALUES ('da-live', 'example.test', 1785542400, 200, 20, 1, NULL);
    INSERT INTO liveness_checks VALUES ('da-dead', 'dead.test', 1785542400, NULL, NULL, 0, 'timeout');
  `);
  live.close();
  const axeDbPath = path.join(fixture.root, "axe.db");
  const axe = new Database(axeDbPath);
  axe.exec(`
    CREATE TABLE axe_runs (site_id INTEGER, provisional_asset_id TEXT, violations_total INTEGER,
      critical_count INTEGER, serious_count INTEGER, moderate_count INTEGER, minor_count INTEGER,
      nodes_scanned INTEGER, axe_version TEXT);
    CREATE TABLE audit_runs (tool TEXT, provisional_asset_id TEXT, fetched_at INTEGER,
      ok INTEGER, error_class TEXT, error_message TEXT);
    INSERT INTO axe_runs VALUES (1, 'da-live', 2, 0, 1, 1, 0, 50, 'test-v1');
    INSERT INTO audit_runs VALUES ('axe', 'da-live', 1785542400, 1, NULL, NULL);
    INSERT INTO axe_runs VALUES (99, 'da-stale', 999, 0, 1, 1, 0, 50, 'test-v1');
    INSERT INTO audit_runs VALUES ('axe', 'da-stale', 1785542400, 1, NULL, NULL);
  `);
  axe.close();
  return {
    outputDir: fixture.root,
    state: {
      brief: {
        period: "2026-q3",
        capsuleId: "019ff219-69fe-7025-943c-dae2a8c37801",
        ontologyVersion: "2.0.0",
        instrumentPlan: DEFAULT_INSTRUMENT_PLAN,
      },
      ontology,
      discoveredPages: [{ ...(await source(pagesDbPath, "profile")), pagesDbPath }],
      livenessDbs: [{ ...(await source(livenessDbPath, "liveness")), livenessDbPath }],
      axeDbs: [{ ...(await source(axeDbPath, "axe")), axeDbPath }],
      verifiedSnapshots: [],
      coreDbs: [],
    },
  } as unknown as PipelineContext;
}

describe("ontology translation coverage", () => {
  it("reads payload paths despite NUL conflict keys and expects the real liveness paths", () => {
    const result = reconcileTranslationCoverage(persistedSignals([...paths, paths[0]!]), ontology);
    expect(result).toMatchObject({ unresolvedReferences: 0, missing: [], extra: [] });
    expect(result.expectedKeysSha256).toBe(result.emittedKeysSha256);
  });

  it("keeps genuine missing and unexpected signals blocking", () => {
    const result = reconcileTranslationCoverage(
      persistedSignals([...paths.slice(1), "audit.axe.nodes_scanned.count"]),
      ontology,
    );
    expect(result).toMatchObject({
      missing: ["legal.impressum.present"],
      extra: ["audit.axe.nodes_scanned.count"],
      unresolvedReferences: 2,
    });
    expect(result.expectedKeysSha256).not.toBe(result.emittedKeysSha256);
  });

  it("translates real SQLite sources, excludes unknown Axe values, and resumes identically", async () => {
    const ctx = await translationContext();
    const translator = new TranslateOntologyGogol();
    await translator.run(ctx);
    const read = () => {
      const db = new Database(ctx.state.observationDbPath!, { readonly: true });
      try {
        return db
          .prepare("SELECT payload_json FROM observations ORDER BY observation_id")
          .all() as Array<{ payload_json: string }>;
      } finally {
        db.close();
      }
    };
    const first = read();
    expect(first).toHaveLength(8);
    expect(first.map((r) => JSON.parse(r.payload_json).signal_path).sort()).toEqual(
      [
        ...paths,
        "legal.impressum.present",
        "availability.website.outcome",
        "availability.website.is_reachable",
      ].sort(),
    );
    const profiles = first
      .map((r) => JSON.parse(r.payload_json))
      .filter((r) => r.signal_path === "legal.impressum.present");
    expect(new Map(profiles.map((r) => [r.asset_id, r.value_bool]))).toEqual(
      new Map([
        [deriveAssetId("example.test"), true],
        [deriveAssetId("shared.test"), true],
      ]),
    );
    expect(first.some((r) => r.payload_json.includes("da-stale"))).toBe(false);
    await translator.run(ctx);
    expect(read()).toEqual(first);
    expect(ctx.state.translationClosure?.unresolvedReferences).toBe(0);
  });

  it("stops translation on an empty admitted signal before conflict resolution or signing", async () => {
    const ctx = await translationContext(true);
    await expect(new TranslateOntologyGogol().run(ctx)).rejects.toThrow(
      "Profile legal.impressum.present lacks 2 selected successful owner(s)",
    );
    expect(ctx.state.observationDbPath).toBeNull();
    expect(ctx.state.translationClosure).toBeNull();
  });

  it("rejects a source changed after admission and leaves original bytes untouched by translation", async () => {
    const ctx = await translationContext();
    const db = new Database(ctx.state.discoveredPages[0]!.pagesDbPath);
    db.exec("UPDATE ext_impressum SET present = 0");
    db.close();
    const changed = await sha256File(ctx.state.discoveredPages[0]!.pagesDbPath);
    await expect(new TranslateOntologyGogol().run(ctx)).rejects.toThrow(/hash|digest|SHA|changed/i);
    expect(await sha256File(ctx.state.discoveredPages[0]!.pagesDbPath)).toBe(changed);
  });

  it.each([
    [
      "liveness",
      "UPDATE liveness_checks SET latency_ms = 999 WHERE provisional_asset_id = 'da-live'",
      "Liveness projection differs",
    ],
    [
      "axe",
      "UPDATE axe_runs SET violations_total = 999 WHERE provisional_asset_id = 'da-live'",
      "Axe projection differs",
    ],
    [
      "liveness",
      "DELETE FROM liveness_checks WHERE provisional_asset_id = 'da-dead'",
      "Liveness projection lacks 1",
    ],
    [
      "axe",
      "DELETE FROM axe_runs WHERE provisional_asset_id = 'da-live'",
      "Axe projection lacks 1",
    ],
  ])(
    "rejects %s projection drift even when the snapshot digest is updated: %s",
    async (stage, sql, error) => {
      const ctx = await translationContext();
      const src = stage === "liveness" ? ctx.state.livenessDbs[0]! : ctx.state.axeDbs[0]!;
      const filename = path.join(src.capsuleDir, src.artifact.uri);
      const db = new Database(filename);
      db.exec(sql);
      db.close();
      src.artifact.sha256 = await sha256File(filename);
      src.artifact.bytes = (await fs.stat(filename)).size;
      await expect(new TranslateOntologyGogol().run(ctx)).rejects.toThrow(error);
      expect(
        ctx.state.observationDbPath,
        "Unreconciled projections must never reach signing; check TranslateOntologyGogol.run",
      ).toBeNull();
    },
  );

  it("preserves capture ownership when redirected pages share a URL and later observations replace HTML", async () => {
    const ctx = await translationContext();
    const src = ctx.state.discoveredPages[0]!;
    const db = new Database(src.pagesDbPath);
    db.exec(
      "UPDATE site_pages SET url_norm = 'https://redirect.test/'; UPDATE page_observations SET content_sha256 = 'later-content'",
    );
    db.close();
    src.artifact.sha256 = await sha256File(src.pagesDbPath);
    await new TranslateOntologyGogol().run(ctx);
    const translated = new Database(ctx.state.observationDbPath!, { readonly: true });
    try {
      const rows = translated
        .prepare(
          "SELECT json_extract(payload_json, '$.asset_id') AS asset, json_extract(payload_json, '$.value_bool') AS value FROM observations WHERE json_extract(payload_json, '$.signal_path') = 'legal.impressum.present'",
        )
        .all();
      expect(rows).toEqual(
        expect.arrayContaining([
          { asset: deriveAssetId("example.test"), value: 1 },
          { asset: deriveAssetId("shared.test"), value: 1 },
        ]),
      );
      expect(rows).toHaveLength(2);
    } finally {
      translated.close();
    }
  });
});
