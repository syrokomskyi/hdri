import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compareBaselineRecords,
  type BaselineRecord,
} from "../../tools/preservation/baseline-comparison.js";
import { migrateCore } from "@syrokomskyi/business-core/migrate";
import { generateSigningKey, signSource } from "@syrokomskyi/observatory-crypto";
import { inspectRetainedFile } from "@warpgogol/pipeline-node";
import { inventorySources } from "../../tools/preservation/inventory.js";
import {
  preserveQ2,
  prepareBaselineSource,
  verifyReplicas,
} from "../../tools/preservation/preserve.js";
import {
  streamPreparedHarvestSeeds,
  streamPreparedHarvestSites,
  streamPreparedHarvestMappings,
} from "../../tools/preservation/harvest-source.js";
import {
  streamPreparedCohorts,
  streamPreparedStrata,
} from "../../tools/preservation/cohort-source.js";
import { inspectBaselineScope } from "../../tools/preservation/baseline-scope.js";
import { verifyBaselineProvenance } from "../../tools/preservation/baseline-provenance.js";

const roots: string[] = [];
const handles: Database.Database[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const db of handles.splice(0)) if (db.open) db.close();
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
const key = { ...generateSigningKey(), signingKeyId: "seed-test", collectorId: "fixture" };
const json = ' { "name": "café", "opaque": [1, 2] }\n';
async function fixture(
  edit?: (db: Database.Database) => void,
  wal = false,
  afterDatabaseReady?: (source: string) => Promise<void>,
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-seed-reader-"));
  roots.push(root);
  const source = path.join(root, "source");
  await fs.mkdir(source);
  const db = new Database(path.join(source, "core.db"));
  handles.push(db);
  if (wal) {
    db.pragma("journal_mode=WAL");
    db.pragma("wal_autocheckpoint=0");
  }
  migrateCore(db);
  db.exec("INSERT INTO sites(id,domain) VALUES(1,'retained.example')");
  db.prepare(
    `INSERT INTO site_source_seeds VALUES
    (9007199254740993,1,'input/page.html','item-1',?,'Street','01234','City',NULL,'mail@example.test',
    'https://retained.example','category','https://source.example/profile',?,NULL)`,
  ).run("\uFEFFcafé\0🙂", json);
  edit?.(db);
  if (!wal) db.close();
  await afterDatabaseReady?.(source);
  const destinations = [0, 1, 2].map((n) => ({
    path: path.join(root, `replica-${n}`),
    failureDomain: `fixture-${n}`,
    medium: `fixture-disk-${n}`,
    credentialBoundary: `fixture-key-${n}`,
  }));
  const preserved = await preserveQ2({
    sourceRoots: [source],
    inventory: await inventorySources({ roots: [source] }),
    destinations,
    dryRun: false,
    signingKey: key,
  });
  expect(preserved.status).toBe("pass");
  const options = {
    destinations,
    manifestSha256: preserved.inputFingerprint,
    verificationKeys: new Map([
      [key.signingKeyId, { signingKeyId: key.signingKeyId, publicKeyPem: key.publicKeyPem }],
    ]),
    sourceDestinationPath: destinations[0].path,
    workRoot: path.join(root, "private"),
  };
  const prepared = await prepareBaselineSource(options);
  const snapshot = prepared.manifest.artifacts.find((a) => a.representation === "sqlite-snapshot")!;
  return {
    source,
    options,
    prepared,
    snapshot,
    file: path.join(prepared.root, snapshot.uri),
    rows: () => streamPreparedHarvestSeeds(prepared, snapshot.uri),
    sites: () => streamPreparedHarvestSites(prepared, snapshot.uri),
    mappings: () => streamPreparedHarvestMappings(prepared, snapshot.uri),
    cohorts: () => streamPreparedCohorts(prepared, snapshot.uri),
    strata: () => streamPreparedStrata(prepared, snapshot.uri),
  };
}
async function collect<T>(rows: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const row of rows) result.push(row);
  return result;
}

describe("complete prepared baseline source declarations", () => {
  it("rejects a changed prepared snapshot before inventorying its tables", async () => {
    const f = await fixture();
    await fs.appendFile(f.file, "changed");
    await expect(inspectBaselineScope(f.prepared, declaration(f))).rejects.toThrow(
      "BASELINE_SNAPSHOT_CHANGED",
    );
  });
  it("bounds total declaration text across snapshots before starting I/O", async () => {
    const f = await fixture((db) => {
      for (const name of ["second.db", "third.db"]) {
        const other = new Database(path.join(path.dirname(db.name), name));
        try {
          other.exec("CREATE TABLE other(id INTEGER)");
        } finally {
          other.close();
        }
      }
    });
    const input = {
      schema: "hdri-baseline-scope@1",
      manifestSha256: f.prepared.manifestSha256,
      sources: f.prepared.manifest.artifacts
        .filter((a) => a.representation === "sqlite-snapshot")
        .map((a) => ({
          snapshot: { uri: a.uri, sha256: a.sha256, bytes: a.bytes },
          profile: "unclassified",
          scope: { status: "unavailable", reason: "Unknown source scope" },
          tables: Array.from({ length: 1024 }, (_, n) => ({
            name: `unclassified-${n}`,
            disposition: "retained-only",
            reason: "x".repeat(4096),
          })),
        })),
    };
    const lstat = vi.spyOn(fs, "lstat");
    await expect(inspectBaselineScope(f.prepared, input)).rejects.toThrow(
      "BASELINE_SCOPE_METADATA_LIMIT",
    );
    expect(lstat).not.toHaveBeenCalled();
  });
  const required = [
    "sites",
    "site_source_seeds",
    "site_hwo_mappings",
    "site_cohorts",
    "site_strata",
  ];
  const retained = ["_schema_meta", "consent_events", "batch_step_runs", "site_step_runs"];
  function declaration(f: Awaited<ReturnType<typeof fixture>>) {
    return {
      schema: "hdri-baseline-scope@1",
      manifestSha256: f.prepared.manifestSha256,
      sources: [
        {
          snapshot: { uri: f.snapshot.uri, sha256: f.snapshot.sha256, bytes: f.snapshot.bytes },
          profile: "harvest",
          scope: { status: "unavailable", reason: "Historical device attribution not established" },
          tables: [
            ...required.map((name) => ({
              name,
              disposition: "required",
              reason: null as string | null,
            })),
            ...retained.map((name) => ({
              name,
              disposition: "retained-only",
              reason: "Preserved bytes; conversion owner still required" as string | null,
            })),
          ],
        },
      ],
    };
  }
  it("accounts for every actual table and preserves original/snapshot generation distinction", async () => {
    const f = await fixture(undefined, true);
    const before = await inventorySources({ roots: [f.source] });
    const result = await inspectBaselineScope(f.prepared, declaration(f));
    expect(result.status).toBe("inventory-checked-not-admitted");
    expect(result.retainedArtifactCount).toBe(f.prepared.manifest.artifacts.length);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].objects.map((o) => o.name).sort()).toEqual(
      [...required, ...retained].sort(),
    );
    expect(result.sources[0].declaration.scope).toEqual({
      status: "unavailable",
      reason: "Historical device attribution not established",
    });
    expect(result.sources[0].original.sha256).not.toBe(f.snapshot.sha256);
    expect(result.sources[0].declaration.snapshot.sha256).toBe(f.snapshot.sha256);
    for (const value of [
      result,
      result.sources,
      result.sources[0],
      result.sources[0].original,
      result.sources[0].objects,
      result.sources[0].objects[0],
      result.sources[0].declaration,
      result.sources[0].declaration.tables,
      result.sources[0].declaration.scope,
    ])
      expect(Object.isFrozen(value)).toBe(true);
    expect(await inventorySources({ roots: [f.source] })).toEqual(before);
    expect((await verifyReplicas(f.options)).status).toBe("pass");
  });
  it.each([
    "snapshot",
    "required-table",
    "retained-table",
    "extra-table",
    "duplicate-source",
    "duplicate-table",
    "wrong-digest",
    "wrong-bytes",
    "wrong-manifest",
  ])("rejects incomplete or mismatched declaration: %s", async (defect) => {
    const f = await fixture();
    const input = declaration(f);
    const source = input.sources[0];
    if (defect === "snapshot") input.sources = [];
    if (defect === "required-table")
      source.tables = source.tables.filter((t) => t.name !== "sites");
    if (defect === "retained-table")
      source.tables = source.tables.filter((t) => t.name !== "consent_events");
    if (defect === "extra-table")
      source.tables.push({ name: "absent", disposition: "retained-only", reason: "not present" });
    if (defect === "duplicate-source") input.sources.push(source);
    if (defect === "duplicate-table") source.tables.push(source.tables[0]);
    if (defect === "wrong-digest") source.snapshot.sha256 = "0".repeat(64);
    if (defect === "wrong-bytes") source.snapshot.bytes++;
    if (defect === "wrong-manifest") input.manifestSha256 = "0".repeat(64);
    await expect(inspectBaselineScope(f.prepared, input)).rejects.toThrow();
  });
  it("requires reasons for retained-only data and forbids hiding a profile-required table", async () => {
    const f = await fixture();
    const input = declaration(f);
    input.sources[0].tables[0] = { name: "sites", disposition: "retained-only", reason: "skip" };
    await expect(inspectBaselineScope(f.prepared, input)).rejects.toThrow(
      "REQUIRED_BASELINE_DOMAIN_OMITTED",
    );
    const blank = declaration(f);
    blank.sources[0].tables[5].reason = "";
    await expect(inspectBaselineScope(f.prepared, blank)).rejects.toThrow(
      "INVALID_BASELINE_SCOPE_TEXT",
    );
  });
  it("detects a second snapshot omitted from the declaration", async () => {
    const f = await fixture((db) => {
      const other = new Database(path.join(path.dirname(db.name), "other.db"));
      try {
        other.exec("CREATE TABLE other(id INTEGER)");
      } finally {
        other.close();
      }
    });
    await expect(inspectBaselineScope(f.prepared, declaration(f))).rejects.toThrow(
      "INCOMPLETE_BASELINE_SNAPSHOT_SCOPE",
    );
  });
  it("detects undeclared empty tables and views, and inventories explicit retained-only objects", async () => {
    const f = await fixture((db) =>
      db.exec(
        "CREATE TABLE unknown_table(id INTEGER); CREATE VIEW unknown_view AS SELECT id FROM unknown_table",
      ),
    );
    const input = declaration(f);
    await expect(inspectBaselineScope(f.prepared, input)).rejects.toThrow(
      "INCOMPLETE_BASELINE_TABLE_SCOPE",
    );
    input.sources[0].tables.push(
      ...["unknown_table", "unknown_view"].map((name) => ({
        name,
        disposition: "retained-only",
        reason: "Unsupported owner; retained only",
      })),
    );
    const result = await inspectBaselineScope(f.prepared, input);
    expect(result.sources[0].objects.find((o) => o.name === "unknown_view")?.kind).toBe("view");
    expect(result.status).toBe("inventory-checked-not-admitted");
  });
  it("never upgrades retained producer/device claims into historical authentication", async () => {
    const f = await fixture();
    const base = declaration(f);
    const evidence = f.prepared.manifest.artifacts.find(
      (artifact) => artifact.representation === "original",
    )!;
    const input = {
      ...base,
      sources: [
        {
          ...base.sources[0],
          scope: {
            status: "retained-claim",
            producer: "claimed-owner",
            device: "claimed-device",
            sourceToken: "2026-q2-de",
            signatureUri: evidence.uri,
            evidenceUris: [evidence.uri],
          },
        },
      ],
    };
    const result = await inspectBaselineScope(f.prepared, input);
    expect(result.sources[0].declaration.scope).toEqual(input.sources[0].scope);
    expect(result.status).toBe("inventory-checked-not-admitted");
    input.sources[0].scope.evidenceUris = ["outside/not-retained.json"];
    await expect(inspectBaselineScope(f.prepared, input)).rejects.toThrow(
      "BASELINE_SCOPE_EVIDENCE_UNLISTED",
    );
  });
  async function signedFixture(
    mutate?: (manifest: ReturnType<typeof signSource>) => ReturnType<typeof signSource>,
    encode: (manifest: ReturnType<typeof signSource>) => string = JSON.stringify,
  ) {
    return fixture(undefined, false, async (source) => {
      const original = await inspectRetainedFile(path.join(source, "core.db"));
      const signed = signSource({
        signingKey: key,
        sourceToken: "2026-q2-de",
        appId: "0-harvest-source",
        appVersion: "2.0.0",
        contentHash: original.sha256,
        rowsSigned: 1,
      });
      const manifest = mutate?.(signed) ?? signed;
      await fs.writeFile(path.join(source, "source-signature.json"), encode(manifest), {
        flag: "wx",
      });
    });
  }
  function signedDeclaration(f: Awaited<ReturnType<typeof fixture>>) {
    const base = declaration(f);
    const signatureUri = "originals/source-0000/source-signature.json";
    return {
      ...base,
      sources: [
        {
          ...base.sources[0],
          scope: {
            status: "retained-claim",
            producer: "0-harvest-source",
            device: "fixture",
            sourceToken: "2026-q2-de",
            signatureUri,
            evidenceUris: [signatureUri],
          },
        },
      ],
    };
  }
  const provenanceKeys = () =>
    new Map([
      [
        key.signingKeyId,
        {
          signingKeyId: key.signingKeyId,
          publicKeyPem: key.publicKeyPem,
          collectorId: key.collectorId,
        },
      ],
    ]);
  it("reports only the signed original-byte claim and keeps snapshot generation unbound", async () => {
    const f = await signedFixture((manifest) => ({ ...manifest, app_id: "retained-app-claim" }));
    const input = signedDeclaration(f);
    input.sources[0].scope.producer = "retained-app-claim";
    const inventory = await inspectBaselineScope(f.prepared, input);
    const report = await verifyBaselineProvenance(f.prepared, inventory, provenanceKeys());
    expect(report).toMatchObject({
      status: "provenance-checked-not-admitted",
      signedByteClaimsVerified: 1,
      unavailableClaims: 0,
    });
    expect(report.sources[0]).toMatchObject({
      status: "device-token-original-bytes-verified-snapshot-generation-unbound",
      device: "fixture",
      sourceToken: "2026-q2-de",
      originalSha256: inventory.sources[0].original.sha256,
      unsignedMetadata: { producer: "retained-app-claim", appVersion: "2.0.0" },
    });
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.sources)).toBe(true);
    expect(Object.isFrozen(report.sources[0])).toBe(true);
  });
  it.each([
    "forged-inventory",
    "wrong-period",
    "wrong-device",
    "wrong-producer",
    "wrong-original-hash",
    "unknown-key",
    "invalid-signature",
  ])("rejects an unauthenticated baseline source claim: %s", async (defect) => {
    const f = await signedFixture(
      defect === "invalid-signature"
        ? (manifest) => ({
            ...manifest,
            signature: `${manifest.signature[0] === "A" ? "B" : "A"}${manifest.signature.slice(1)}`,
          })
        : defect === "wrong-original-hash"
          ? (manifest) => ({ ...manifest, content_hash: "0".repeat(64) })
          : undefined,
    );
    const input = signedDeclaration(f);
    if (defect === "wrong-period") input.sources[0].scope.sourceToken = "2026-q3-de";
    if (defect === "wrong-device") input.sources[0].scope.device = "other-device";
    if (defect === "wrong-producer") input.sources[0].scope.producer = "other-app";
    const inventory = await inspectBaselineScope(f.prepared, input);
    const keys = provenanceKeys();
    if (defect === "unknown-key") keys.clear();
    await expect(
      verifyBaselineProvenance(
        f.prepared,
        defect === "forged-inventory" ? { ...inventory } : inventory,
        keys,
      ),
    ).rejects.toThrow();
  });
  it("rejects duplicate manifest fields even when JSON.parse would overwrite them", async () => {
    const f = await signedFixture(undefined, (manifest) => {
      const normal = JSON.stringify(manifest);
      return normal.replace(
        '{"device_id":"fixture",',
        '{"device_id":"other","device_id":"fixture",',
      );
    });
    const inventory = await inspectBaselineScope(f.prepared, signedDeclaration(f));
    await expect(verifyBaselineProvenance(f.prepared, inventory, provenanceKeys())).rejects.toThrow(
      "INVALID_BASELINE_SOURCE_SIGNATURE_SHAPE",
    );
  });
  it("detaches caller state before I/O and rejects changed retained non-snapshot bytes", async () => {
    const f = await fixture();
    const input = declaration(f);
    const pending = inspectBaselineScope(f.prepared, input);
    input.sources[0].tables.length = 0;
    input.sources[0].scope.reason = "changed";
    const result = await pending;
    expect(result.sources[0].declaration.tables).toHaveLength(9);
    expect(result.sources[0].declaration.scope).toMatchObject({
      reason: "Historical device attribution not established",
    });
    await fs.appendFile(path.join(f.prepared.root, result.sources[0].original.uri), "changed");
    await expect(inspectBaselineScope(f.prepared, declaration(f))).rejects.toThrow(
      "BASELINE_SCOPE_ARTIFACT_CHANGED",
    );
  });
  it("rejects forged preparation, additional fields, accessors and oversized declarations before I/O", async () => {
    const f = await fixture();
    const input = declaration(f);
    const lstat = vi.spyOn(fs, "lstat");
    await expect(inspectBaselineScope({ ...f.prepared }, input)).rejects.toThrow(
      "PROCESS_LOCAL_PREPARED_SOURCE_REQUIRED",
    );
    await expect(inspectBaselineScope(f.prepared, { ...input, admitted: true })).rejects.toThrow(
      "INVALID_BASELINE_SCOPE_SHAPE",
    );
    let invoked = false;
    const getter = { ...input };
    Object.defineProperty(getter, "sources", {
      get() {
        invoked = true;
        return [];
      },
    });
    await expect(inspectBaselineScope(f.prepared, getter)).rejects.toThrow(
      "INVALID_BASELINE_SCOPE_SHAPE",
    );
    const oversized = declaration(f);
    oversized.sources[0].scope.reason = "x".repeat(4097);
    await expect(inspectBaselineScope(f.prepared, oversized)).rejects.toThrow(
      "INVALID_BASELINE_SCOPE_TEXT",
    );
    expect(invoked).toBe(false);
    expect(lstat).not.toHaveBeenCalled();
  });
});

describe("prepared asynchronous source comparison", () => {
  it.each(["equal", "changed-value", "changed-file"] as const)(
    "compares complete site fields with an independent target: %s",
    async (scenario) => {
      const f = await fixture((db) => db.exec("UPDATE sites SET created_at=42"), true);
      const fields = [
        "id",
        "domain",
        "hwo_uid",
        "hwo_confidence",
        "hwo_provenance",
        "bundesland",
        "gemeinde",
        "created_at",
      ] as const;
      async function* source(): AsyncGenerator<BaselineRecord> {
        for await (const row of f.sites())
          yield {
            key: row.source.siteLocator.id,
            values: fields.map((field) => row.columns[field]),
          };
      }
      async function* target(): AsyncGenerator<BaselineRecord> {
        if (scenario === "changed-file") await fs.appendFile(f.file, "changed after source row");
        yield {
          key: "1",
          values: [
            1n,
            scenario === "changed-value" ? "other.example" : "retained.example",
            null,
            null,
            null,
            null,
            null,
            42n,
          ],
        };
      }
      const result = compareBaselineRecords({
        domain: "fixture-sites",
        fields,
        source: source(),
        target: target(),
      });
      if (scenario === "changed-file")
        await expect(result).rejects.toThrow("HARVEST_SNAPSHOT_CHANGED");
      else {
        const report = await result;
        expect(report).toMatchObject({
          status: scenario === "equal" ? "equal" : "different",
          sourceRows: 1,
          targetRows: 1,
        });
        expect(report.fieldDifferences.domain).toBe(scenario === "equal" ? 0 : 1);
      }
    },
  );
});

describe("retained cohort definitions and memberships", () => {
  it("streams 10000 definitions and memberships without a whole-population set", async () => {
    const f = await fixture((db) => {
      const cohort = db.prepare("INSERT INTO site_cohorts VALUES(?,NULL,'owner',NULL,'seed',NULL)");
      const member = db.prepare("INSERT INTO site_strata VALUES(?,1,'system','01',NULL,NULL,NULL)");
      db.transaction(() => {
        for (let n = 0; n < 10000; n++) {
          const id = `cohort-${String(n).padStart(5, "0")}`;
          cohort.run(id);
          member.run(id);
        }
      })();
    });
    let count = 0;
    for await (const row of f.cohorts())
      expect(row.columns.id).toBe(`cohort-${String(count++).padStart(5, "0")}`);
    expect(count).toBe(10000);
    count = 0;
    for await (const row of f.strata())
      expect(row.columns.cohort_id).toBe(`cohort-${String(count++).padStart(5, "0")}`);
    expect(count).toBe(10000);
  });
  const selection = (db: Database.Database) =>
    db.exec(`
    INSERT INTO site_cohorts VALUES('cohort-a',NULL,'original-owner','v-old','seed-001',NULL);
    INSERT INTO site_strata VALUES('cohort-a',1,'original-system','01',NULL,NULL,NULL)`);
  it("preserves WAL definitions, unreferenced cohorts and every membership without quarter inference", async () => {
    const f = await fixture((db) => {
      selection(db);
      db.prepare("UPDATE site_cohorts SET description=?,created_at=-9").run(
        "\uFEFFdescription\0é🙂",
      );
      db.exec(`INSERT INTO site_cohorts VALUES('empty',NULL,'owner',NULL,'',NULL);
        INSERT INTO site_cohorts VALUES('second','other','owner',NULL,'seed-002',0);
        INSERT INTO sites(id,domain) VALUES(9007199254740993,'other.example');
        INSERT INTO site_strata VALUES('cohort-a',9007199254740993,'unknown','009','BE','rural','001');
        INSERT INTO site_strata VALUES('second',1,'different','x','','','')`);
    }, true);
    const before = await inventorySources({ roots: [f.source] });
    const cohorts = await collect(f.cohorts());
    expect(cohorts.map((r) => r.columns)).toEqual([
      {
        id: "cohort-a",
        description: "\uFEFFdescription\0é🙂",
        owner_app: "original-owner",
        codebook_version: "v-old",
        random_seed: "seed-001",
        created_at: -9n,
      },
      {
        id: "empty",
        description: null,
        owner_app: "owner",
        codebook_version: null,
        random_seed: "",
        created_at: null,
      },
      {
        id: "second",
        description: "other",
        owner_app: "owner",
        codebook_version: null,
        random_seed: "seed-002",
        created_at: 0n,
      },
    ]);
    const rows = await collect(f.strata());
    expect(rows.map((r) => r.columns)).toEqual([
      {
        cohort_id: "cohort-a",
        site_id: 1n,
        strata_system: "original-system",
        strata_code: "01",
        bundesland: null,
        settlement_type: null,
        gemeinde: null,
      },
      {
        cohort_id: "cohort-a",
        site_id: 9007199254740993n,
        strata_system: "unknown",
        strata_code: "009",
        bundesland: "BE",
        settlement_type: "rural",
        gemeinde: "001",
      },
      {
        cohort_id: "second",
        site_id: 1n,
        strata_system: "different",
        strata_code: "x",
        bundesland: "",
        settlement_type: "",
        gemeinde: "",
      },
    ]);
    expect(rows[1].source).toEqual({
      manifestSha256: f.prepared.manifestSha256,
      artifact: { uri: f.snapshot.uri, sha256: f.snapshot.sha256, bytes: f.snapshot.bytes },
      stratumLocator: { table: "site_strata", cohort_id: "cohort-a", site_id: "9007199254740993" },
      cohortLocator: { table: "site_cohorts", id: "cohort-a" },
      siteLocator: { table: "sites", id: "9007199254740993" },
    });
    expect(cohorts[0].source.cohortLocator).toEqual({ table: "site_cohorts", id: "cohort-a" });
    for (const value of [
      rows[1],
      rows[1].columns,
      rows[1].source,
      rows[1].source.artifact,
      rows[1].source.stratumLocator,
      rows[1].source.siteLocator,
      rows[1].source.cohortLocator,
      cohorts[0],
      cohorts[0].columns,
      cohorts[0].source,
      cohorts[0].source.cohortLocator,
    ])
      expect(Object.isFrozen(value)).toBe(true);
    expect(await inventorySources({ roots: [f.source] })).toEqual(before);
    expect((await verifyReplicas(f.options)).status).toBe("pass");
  });
  it.each([
    ["cohorts", "UPDATE site_cohorts SET id=NULL", "INVALID_OR_OVERSIZED"],
    ["cohorts", "UPDATE site_cohorts SET random_seed=X'80'", "INVALID_OR_OVERSIZED"],
    ["cohorts", "UPDATE site_cohorts SET description=CAST(X'80' AS TEXT)", "encoded data"],
    ["cohorts", "UPDATE site_cohorts SET created_at=1.5", "INVALID_OR_OVERSIZED"],
    [
      "cohorts",
      "ALTER TABLE site_cohorts ADD COLUMN unknown TEXT",
      "UNSUPPORTED_COHORT_SOURCE_SCHEMA",
    ],
    [
      "cohorts",
      "ALTER TABLE site_cohorts RENAME TO old; CREATE VIEW site_cohorts AS SELECT * FROM old",
      "UNSUPPORTED_COHORT_SOURCE_SCHEMA",
    ],
    ["strata", "DELETE FROM site_cohorts", "INVALID_OR_OVERSIZED"],
    ["strata", "UPDATE site_strata SET cohort_id='COHORT-A'", "INVALID_OR_OVERSIZED"],
    ["strata", "DELETE FROM sites", "INVALID_OR_OVERSIZED"],
    ["strata", "UPDATE site_strata SET site_id=1.5", "INVALID_OR_OVERSIZED"],
    ["strata", "UPDATE site_strata SET gemeinde=CAST(X'80' AS TEXT)", "encoded data"],
    ["strata", "UPDATE site_strata SET strata_code=X'80'", "INVALID_OR_OVERSIZED"],
    [
      "strata",
      "ALTER TABLE site_strata ADD COLUMN unknown TEXT",
      "UNSUPPORTED_COHORT_SOURCE_SCHEMA",
    ],
    ["strata", "DROP TABLE site_strata", "UNSUPPORTED_COHORT_SOURCE_SCHEMA"],
    [
      "strata",
      "ALTER TABLE sites RENAME TO old; CREATE VIEW sites AS SELECT * FROM old",
      "UNSUPPORTED_COHORT_SITE_SCHEMA",
    ],
  ] as const)("rejects invalid %s data: %s", async (reader, sql, error) => {
    const f = await fixture((db) => {
      selection(db);
      db.exec(sql);
    });
    await expect(collect<unknown>(f[reader]())).rejects.toThrow(error);
  });
  it.each(["COLLATE NOCASE", "DESC"])("rejects noncanonical cohort index %s", async (order) => {
    const f = await fixture((db) =>
      db.exec(`DROP TABLE site_cohorts; CREATE TABLE site_cohorts(
      id TEXT PRIMARY KEY ${order},description TEXT,owner_app TEXT NOT NULL,
      codebook_version TEXT,random_seed TEXT NOT NULL,created_at INTEGER)`),
    );
    await expect(collect(f.cohorts())).rejects.toThrow("UNSUPPORTED_COHORT_SOURCE_INDEX");
    await expect(collect(f.strata())).rejects.toThrow("UNSUPPORTED_COHORT_SOURCE_INDEX");
  });
  it.each(["COLLATE NOCASE", "DESC"])("rejects noncanonical membership index %s", async (order) => {
    const f = await fixture((db) =>
      db.exec(`DROP TABLE site_strata; CREATE TABLE site_strata(
      cohort_id TEXT NOT NULL,site_id INTEGER NOT NULL,strata_system TEXT NOT NULL,
      strata_code TEXT NOT NULL,bundesland TEXT,settlement_type TEXT,gemeinde TEXT,
      PRIMARY KEY(cohort_id ${order},site_id))`),
    );
    await expect(collect(f.strata())).rejects.toThrow("UNSUPPORTED_COHORT_SOURCE_INDEX");
  });
  it("preserves empty tables and reads definitions independently of membership or sites", async () => {
    const empty = await fixture();
    expect(await collect(empty.cohorts())).toEqual([]);
    expect(await collect(empty.strata())).toEqual([]);
    const f = await fixture((db) => {
      selection(db);
      db.exec("DROP TABLE site_strata; DROP TABLE sites");
    });
    expect(await collect(f.cohorts())).toHaveLength(1);
  });
  it.each(["cohorts", "strata"] as const)(
    "bounds aggregate %s text before driver transfer",
    async (reader) => {
      const f = await fixture((db) => {
        selection(db);
        db.exec(
          reader === "cohorts"
            ? "UPDATE site_cohorts SET description=CAST(zeroblob(5000000) AS TEXT),random_seed=CAST(zeroblob(5000000) AS TEXT)"
            : "UPDATE site_strata SET gemeinde=CAST(zeroblob(5000000) AS TEXT),settlement_type=CAST(zeroblob(5000000) AS TEXT)",
        );
      });
      const prepare = Database.prototype.prepare;
      let seen = false;
      vi.spyOn(Database.prototype, "prepare").mockImplementation(function (
        this: Database.Database,
        sql: string,
      ) {
        const statement = prepare.call(this, sql);
        if (sql.startsWith("SELECT CASE WHEN")) {
          const iterate = statement.iterate.bind(statement);
          vi.spyOn(statement, "iterate").mockImplementation(function* () {
            for (const row of Reflect.apply(iterate, statement, []) as Iterable<
              Record<string, unknown>
            >) {
              expect(row.admissible).toBe(0n);
              expect(
                Object.entries(row)
                  .filter(([name]) => name !== "admissible")
                  .every(([, value]) => value === null),
              ).toBe(true);
              seen = true;
              yield row;
            }
          });
        }
        return statement;
      });
      await expect(collect<unknown>(f[reader]())).rejects.toThrow(
        "INVALID_OR_OVERSIZED_COHORT_SOURCE_ROW",
      );
      expect(seen).toBe(true);
    },
  );
  it.each(["cohorts", "strata"] as const)("requires prepared authority for %s", async (reader) => {
    const f = await fixture(selection);
    const read = reader === "cohorts" ? streamPreparedCohorts : streamPreparedStrata;
    expect(() => read({ ...f.prepared }, f.snapshot.uri)).toThrow(
      "PROCESS_LOCAL_PREPARED_SOURCE_REQUIRED",
    );
    const original = f.prepared.manifest.artifacts.find((a) => a.representation === "original")!;
    expect(() => read(f.prepared, original.uri)).toThrow("DECLARED_HARVEST_SNAPSHOT_REQUIRED");
  });
  it.each(["cohorts", "strata"] as const)(
    "rehashes %s after early return and releases SQLite",
    async (reader) => {
      const f = await fixture(selection);
      const close = vi.spyOn(Database.prototype, "close");
      const rows = f[reader]();
      await rows.next();
      await fs.appendFile(f.file, "changed");
      await expect(rows.return(undefined)).rejects.toThrow("HARVEST_SNAPSHOT_CHANGED");
      expect(close).toHaveBeenCalledTimes(1);
    },
  );
});

describe("complete retained mapping records", () => {
  it("bounds aggregate driver transfer before decoding mapping text", async () => {
    const f = await fixture((db) =>
      db.exec(`INSERT INTO site_hwo_mappings VALUES
      (1,'group','code',CAST(zeroblob(5000000) AS TEXT),CAST(zeroblob(5000000) AS TEXT),NULL)`),
    );
    const prepare = Database.prototype.prepare;
    let seen = false;
    vi.spyOn(Database.prototype, "prepare").mockImplementation(function (
      this: Database.Database,
      sql: string,
    ) {
      const statement = prepare.call(this, sql);
      if (sql.includes("FROM site_hwo_mappings AS m")) {
        const iterate = statement.iterate.bind(statement);
        vi.spyOn(statement, "iterate").mockImplementation(function* () {
          for (const row of Reflect.apply(iterate, statement, []) as Iterable<
            Record<string, unknown>
          >) {
            expect(row).toEqual({
              admissible: 0n,
              site_id: null,
              mapping_system: null,
              target_code: null,
              target_label: null,
              source: null,
              created_at: null,
            });
            seen = true;
            yield row;
          }
        });
      }
      return statement;
    });
    await expect(collect(f.mappings())).rejects.toThrow("INVALID_OR_OVERSIZED_HARVEST_MAPPING_ROW");
    expect(seen).toBe(true);
  });
  it("streams 10000 mappings and releases the reader after early return", async () => {
    const f = await fixture((db) => {
      const insert = db.prepare(
        "INSERT INTO site_hwo_mappings VALUES(1,?,'code',NULL,'source',NULL)",
      );
      db.transaction(() => {
        for (let n = 0; n < 10000; n++) insert.run(`system-${String(n).padStart(5, "0")}`);
      })();
    });
    let count = 0;
    for await (const row of f.mappings())
      expect(row.columns.mapping_system).toBe(`system-${String(count++).padStart(5, "0")}`);
    expect(count).toBe(10000);
    const close = vi.spyOn(Database.prototype, "close");
    const rows = f.mappings();
    await rows.next();
    await rows.return(undefined);
    expect(close).toHaveBeenCalledTimes(1);
  });
  const insertMapping = (db: Database.Database) =>
    db.exec(`INSERT INTO site_hwo_mappings
    VALUES(1,'destatis_group','01',NULL,'retained-source',NULL)`);
  it("retains all systems and exact composite locators from WAL without reclassification", async () => {
    const f = await fixture((db) => {
      insertMapping(db);
      db.exec("INSERT INTO sites(id,domain) VALUES(9007199254740993,'unseeded.example')");
      db.prepare("INSERT INTO site_hwo_mappings VALUES(9007199254740993,?,?,?,?,?)").run(
        "\uFEFFunknown\0system",
        "001",
        "café🙂",
        "old-codebook",
        -9,
      );
      db.exec("INSERT INTO site_hwo_mappings VALUES(1,'Other','unchanged','label','raw',0)");
    }, true);
    const before = await inventorySources({ roots: [f.source] });
    const rows = await collect(f.mappings());
    expect(rows.map((r) => r.columns)).toEqual([
      {
        site_id: 1n,
        mapping_system: "Other",
        target_code: "unchanged",
        target_label: "label",
        source: "raw",
        created_at: 0n,
      },
      {
        site_id: 1n,
        mapping_system: "destatis_group",
        target_code: "01",
        target_label: null,
        source: "retained-source",
        created_at: null,
      },
      {
        site_id: 9007199254740993n,
        mapping_system: "\uFEFFunknown\0system",
        target_code: "001",
        target_label: "café🙂",
        source: "old-codebook",
        created_at: -9n,
      },
    ]);
    expect(rows[2].source).toEqual({
      manifestSha256: f.prepared.manifestSha256,
      artifact: { uri: f.snapshot.uri, sha256: f.snapshot.sha256, bytes: f.snapshot.bytes },
      mappingLocator: {
        table: "site_hwo_mappings",
        site_id: "9007199254740993",
        mapping_system: "\uFEFFunknown\0system",
      },
      siteLocator: { table: "sites", id: "9007199254740993" },
    });
    for (const value of [
      rows[2],
      rows[2].columns,
      rows[2].source,
      rows[2].source.artifact,
      rows[2].source.mappingLocator,
      rows[2].source.siteLocator,
    ])
      expect(Object.isFrozen(value)).toBe(true);
    expect(await inventorySources({ roots: [f.source] })).toEqual(before);
    expect((await verifyReplicas(f.options)).status).toBe("pass");
  });
  it.each([
    ["orphan", "DELETE FROM sites", "INVALID_OR_OVERSIZED_HARVEST_MAPPING_ROW"],
    ["missing table", "DROP TABLE site_hwo_mappings", "UNSUPPORTED_HARVEST_MAPPING_SCHEMA"],
    [
      "extra column",
      "ALTER TABLE site_hwo_mappings ADD COLUMN unknown TEXT",
      "UNSUPPORTED_HARVEST_MAPPING_SCHEMA",
    ],
    [
      "view",
      "ALTER TABLE site_hwo_mappings RENAME TO retained_map; CREATE VIEW site_hwo_mappings AS SELECT * FROM retained_map",
      "UNSUPPORTED_HARVEST_MAPPING_SCHEMA",
    ],
    [
      "binary code",
      "UPDATE site_hwo_mappings SET target_code=X'80'",
      "INVALID_OR_OVERSIZED_HARVEST_MAPPING_ROW",
    ],
    [
      "invalid UTF8",
      "UPDATE site_hwo_mappings SET mapping_system=CAST(X'80' AS TEXT)",
      "encoded data",
    ],
    [
      "fractional timestamp",
      "UPDATE site_hwo_mappings SET created_at=1.5",
      "INVALID_OR_OVERSIZED_HARVEST_MAPPING_ROW",
    ],
    [
      "oversized text",
      "UPDATE site_hwo_mappings SET source=CAST(zeroblob(8388609) AS TEXT)",
      "INVALID_OR_OVERSIZED_HARVEST_MAPPING_ROW",
    ],
  ])("rejects %s rather than dropping a mapping", async (_label, sql, error) => {
    const f = await fixture((db) => {
      insertMapping(db);
      db.exec(sql);
    });
    await expect(collect(f.mappings())).rejects.toThrow(error);
  });
  it.each(["COLLATE NOCASE", "DESC"])("rejects incompatible primary index %s", async (ordering) => {
    const f = await fixture((db) => {
      db.exec(`DROP TABLE site_hwo_mappings; CREATE TABLE site_hwo_mappings(
        site_id INTEGER NOT NULL,mapping_system TEXT NOT NULL,target_code TEXT NOT NULL,
        target_label TEXT,source TEXT NOT NULL,created_at INTEGER,
        PRIMARY KEY(site_id,mapping_system ${ordering}))`);
    });
    await expect(collect(f.mappings())).rejects.toThrow("UNSUPPORTED_HARVEST_MAPPING_INDEX");
  });
  it("does not synthesize absent mappings or reject blank historical text", async () => {
    const empty = await fixture();
    expect(await collect(empty.mappings())).toEqual([]);
    const f = await fixture((db) => {
      insertMapping(db);
      db.exec("UPDATE site_hwo_mappings SET mapping_system='',source='',target_code='' ");
    });
    expect((await collect(f.mappings()))[0].columns).toMatchObject({
      mapping_system: "",
      source: "",
      target_code: "",
    });
  });
  it("requires prepared snapshot authority", async () => {
    const f = await fixture(insertMapping);
    expect(() => streamPreparedHarvestMappings({ ...f.prepared }, f.snapshot.uri)).toThrow(
      "PROCESS_LOCAL_PREPARED_SOURCE_REQUIRED",
    );
    const original = f.prepared.manifest.artifacts.find((a) => a.representation === "original")!;
    expect(() => streamPreparedHarvestMappings(f.prepared, original.uri)).toThrow(
      "DECLARED_HARVEST_SNAPSHOT_REQUIRED",
    );
  });
  it.each(["before", "exhaustion", "return"])("detects snapshot changes on %s", async (when) => {
    const f = await fixture(insertMapping);
    const rows = f.mappings();
    if (when !== "before") expect((await rows.next()).done).toBe(false);
    await fs.appendFile(f.file, "changed");
    await expect(when === "return" ? rows.return(undefined) : rows.next()).rejects.toThrow(
      "HARVEST_SNAPSHOT_CHANGED",
    );
  });
});

describe("complete retained site records", () => {
  it("guards aggregate size before transferring site text to the driver", async () => {
    const f = await fixture((db) =>
      db.exec(`UPDATE sites SET hwo_provenance=CAST(zeroblob(5000000) AS TEXT),
      gemeinde=CAST(zeroblob(5000000) AS TEXT)`),
    );
    const prepare = Database.prototype.prepare;
    let seen = false;
    vi.spyOn(Database.prototype, "prepare").mockImplementation(function (
      this: Database.Database,
      sql: string,
    ) {
      const statement = prepare.call(this, sql);
      if (sql.includes("FROM sites NOT INDEXED")) {
        const iterate = statement.iterate.bind(statement);
        vi.spyOn(statement, "iterate").mockImplementation(function* () {
          for (const row of Reflect.apply(iterate, statement, []) as Iterable<
            Record<string, unknown>
          >) {
            expect(row).toEqual({
              admissible: 0n,
              id: null,
              domain: null,
              hwo_uid: null,
              hwo_confidence: null,
              hwo_provenance: null,
              bundesland: null,
              gemeinde: null,
              created_at: null,
            });
            seen = true;
            yield row;
          }
        });
      }
      return statement;
    });
    await expect(collect(f.sites())).rejects.toThrow("INVALID_OR_OVERSIZED_HARVEST_SITE_ROW");
    expect(seen).toBe(true);
  });
  it("streams all 10000 sites without requiring seeds or retaining a domain set", async () => {
    const f = await fixture((db) => {
      db.exec("DELETE FROM site_source_seeds; DELETE FROM sites");
      const insert = db.prepare("INSERT INTO sites(id,domain,created_at) VALUES(?,?,NULL)");
      db.transaction(() => {
        for (let id = 1; id <= 10000; id++) insert.run(id, `site-${id}.example`);
      })();
    });
    let count = 0;
    for await (const row of f.sites()) expect(row.columns.id).toBe(BigInt(++count));
    expect(count).toBe(10000);
    const close = vi.spyOn(Database.prototype, "close");
    const rows = f.sites();
    await rows.next();
    await rows.return(undefined);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("preserves all site fields from WAL, including sites without seeds and missing classification", async () => {
    const provenance = "\uFEFFhistorical\0é🙂";
    const f = await fixture((db) => {
      db.prepare(
        `UPDATE sites SET hwo_uid='A-01',hwo_confidence=0.875,hwo_provenance=?,
        bundesland='BE',gemeinde='001',created_at=-7`,
      ).run(provenance);
      db.exec(
        `INSERT INTO sites(id,domain,created_at) VALUES(9007199254740993,'unseeded.example',NULL)`,
      );
    }, true);
    const before = await inventorySources({ roots: [f.source] });
    const rows = await collect(f.sites());
    expect(rows.map((row) => row.columns)).toEqual([
      {
        id: 1n,
        domain: "retained.example",
        hwo_uid: "A-01",
        hwo_confidence: 0.875,
        hwo_provenance: provenance,
        bundesland: "BE",
        gemeinde: "001",
        created_at: -7n,
      },
      {
        id: 9007199254740993n,
        domain: "unseeded.example",
        hwo_uid: null,
        hwo_confidence: null,
        hwo_provenance: null,
        bundesland: null,
        gemeinde: null,
        created_at: null,
      },
    ]);
    expect(rows[1].source).toEqual({
      manifestSha256: f.prepared.manifestSha256,
      artifact: { uri: f.snapshot.uri, sha256: f.snapshot.sha256, bytes: f.snapshot.bytes },
      siteLocator: { table: "sites", id: "9007199254740993" },
    });
    for (const value of [
      rows[1],
      rows[1].columns,
      rows[1].source,
      rows[1].source.artifact,
      rows[1].source.siteLocator,
    ])
      expect(Object.isFrozen(value)).toBe(true);
    expect(await inventorySources({ roots: [f.source] })).toEqual(before);
    expect((await verifyReplicas(f.options)).status).toBe("pass");
  });
  it.each([
    [
      "extra column",
      "ALTER TABLE sites ADD COLUMN unknown TEXT",
      "UNSUPPORTED_HARVEST_SOURCE_SCHEMA",
    ],
    [
      "missing classification column",
      "ALTER TABLE sites DROP COLUMN hwo_provenance",
      "UNSUPPORTED_HARVEST_SOURCE_SCHEMA",
    ],
    [
      "view",
      "ALTER TABLE sites RENAME TO hidden_sites; CREATE VIEW sites AS SELECT * FROM hidden_sites",
      "UNSUPPORTED_HARVEST_SOURCE_SCHEMA",
    ],
    ["binary text", "UPDATE sites SET hwo_uid=X'80'", "INVALID_OR_OVERSIZED_HARVEST_SITE_ROW"],
    ["invalid UTF8", "UPDATE sites SET hwo_provenance=CAST(X'80' AS TEXT)", "encoded data"],
    [
      "non-numeric confidence",
      "UPDATE sites SET hwo_confidence='unknown'",
      "INVALID_OR_OVERSIZED_HARVEST_SITE_ROW",
    ],
    ["infinite confidence", "UPDATE sites SET hwo_confidence=1e999", "INVALID_HARVEST_SITE_CELL"],
    ["fractional time", "UPDATE sites SET created_at=1.5", "INVALID_OR_OVERSIZED_HARVEST_SITE_ROW"],
    [
      "oversized provenance",
      "UPDATE sites SET hwo_provenance=CAST(zeroblob(8388609) AS TEXT)",
      "INVALID_OR_OVERSIZED_HARVEST_SITE_ROW",
    ],
  ])("rejects %s without silently substituting historical values", async (_label, sql, error) => {
    const f = await fixture((db) => db.exec(sql));
    await expect(collect(f.sites())).rejects.toThrow(error);
  });
  it("does not impose new classification semantics on finite historical values", async () => {
    const f = await fixture((db) =>
      db.exec("UPDATE sites SET domain='',hwo_uid='',hwo_provenance='not JSON',hwo_confidence=2"),
    );
    const [row] = await collect(f.sites());
    expect(row.columns).toMatchObject({
      domain: "",
      hwo_uid: "",
      hwo_provenance: "not JSON",
      hwo_confidence: 2,
    });
  });
  it("reads sites independently of seed availability and preserves empty tables", async () => {
    const f = await fixture((db) => db.exec("DROP TABLE site_source_seeds"));
    expect(await collect(f.sites())).toHaveLength(1);
    const empty = await fixture((db) => db.exec("DELETE FROM sites"));
    expect(await collect(empty.sites())).toEqual([]);
    await expect(collect(empty.rows())).rejects.toThrow("INVALID_OR_OVERSIZED_HARVEST_SOURCE_ROW");
  });
  it("requires a process-prepared snapshot, not cloned metadata or an original", async () => {
    const f = await fixture();
    expect(() => streamPreparedHarvestSites({ ...f.prepared }, f.snapshot.uri)).toThrow(
      "PROCESS_LOCAL_PREPARED_SOURCE_REQUIRED",
    );
    const original = f.prepared.manifest.artifacts.find((a) => a.representation === "original")!;
    expect(() => streamPreparedHarvestSites(f.prepared, original.uri)).toThrow(
      "DECLARED_HARVEST_SNAPSHOT_REQUIRED",
    );
  });
  it.each(["before", "exhaustion", "return"])("rehashes the site snapshot on %s", async (when) => {
    const f = await fixture();
    const rows = f.sites();
    if (when !== "before") expect((await rows.next()).done).toBe(false);
    await fs.appendFile(f.file, "changed");
    await expect(when === "return" ? rows.return(undefined) : rows.next()).rejects.toThrow(
      "HARVEST_SNAPSHOT_CHANGED",
    );
  });
});

describe("retained harvest seeds", () => {
  it("rejects indexed INTEGER PRIMARY KEY DESC rather than assuming a rowid alias", async () => {
    const f = await fixture((db) => {
      db.exec(
        "DROP TABLE sites; CREATE TABLE sites(id INTEGER PRIMARY KEY DESC,domain TEXT NOT NULL)",
      );
    });
    await expect(collect(f.rows())).rejects.toThrow("UNSUPPORTED_HARVEST_SOURCE_SCHEMA");
  });
  it("transfers only a small sentinel for oversized rows, including an oversized joined domain", async () => {
    const f = await fixture((db) =>
      db.exec("UPDATE sites SET domain=CAST(zeroblob(8388609) AS TEXT)"),
    );
    const prepare = Database.prototype.prepare;
    let seen = false;
    vi.spyOn(Database.prototype, "prepare").mockImplementation(function (
      this: Database.Database,
      sql: string,
    ) {
      const statement = prepare.call(this, sql);
      if (sql.includes("FROM site_source_seeds AS s")) {
        const iterate = statement.iterate.bind(statement);
        vi.spyOn(statement, "iterate").mockImplementation(function* () {
          for (const row of Reflect.apply(iterate, statement, []) as Iterable<
            Record<string, unknown>
          >) {
            expect(row.admissible).toBe(0n);
            expect(
              Object.entries(row)
                .filter(([name]) => name !== "admissible")
                .every(([, value]) => value === null),
            ).toBe(true);
            seen = true;
            yield row;
          }
        });
      }
      return statement;
    });
    await expect(collect(f.rows())).rejects.toThrow("INVALID_OR_OVERSIZED_HARVEST_SOURCE_ROW");
    expect(seen).toBe(true);
  });
  it("preserves WAL-only fields, exact integers, Unicode, nulls and raw text without changing originals or replicas", async () => {
    const f = await fixture(undefined, true);
    const before = await inventorySources({ roots: [f.source] });
    const [row] = await collect(f.rows());
    expect(row.columns).toEqual({
      id: 9007199254740993n,
      site_id: 1n,
      source_path: "input/page.html",
      source_item_key: "item-1",
      business_name: "\uFEFFcafé\0🙂",
      street_address: "Street",
      postal_code: "01234",
      city: "City",
      phone: null,
      email: "mail@example.test",
      website_url: "https://retained.example",
      category: "category",
      source_profile_url: "https://source.example/profile",
      raw_json: json,
      created_at: null,
    });
    expect(row.domain).toBe("retained.example");
    expect(row.source).toEqual({
      manifestSha256: f.prepared.manifestSha256,
      artifact: { uri: f.snapshot.uri, sha256: f.snapshot.sha256, bytes: f.snapshot.bytes },
      seedLocator: { table: "site_source_seeds", id: "9007199254740993" },
      siteLocator: { table: "sites", id: "1" },
    });
    for (const obj of [
      row,
      row.columns,
      row.source,
      row.source.artifact,
      row.source.seedLocator,
      row.source.siteLocator,
    ])
      expect(Object.isFrozen(obj)).toBe(true);
    expect(await inventorySources({ roots: [f.source] })).toEqual(before);
    expect((await verifyReplicas(f.options)).status).toBe("pass");
  });
  it.each([
    ["orphan", "DELETE FROM sites", "INVALID_OR_OVERSIZED"],
    ["binary text", "UPDATE site_source_seeds SET raw_json=X'80'", "INVALID_OR_OVERSIZED"],
    ["invalid UTF8", "UPDATE site_source_seeds SET city=CAST(X'80' AS TEXT)", "encoded data"],
    ["wrong timestamp", "UPDATE site_source_seeds SET created_at=1.5", "INVALID_OR_OVERSIZED"],
    [
      "oversized payload",
      "UPDATE site_source_seeds SET raw_json=CAST(zeroblob(8388609) AS TEXT)",
      "INVALID_OR_OVERSIZED",
    ],
    [
      "extra column",
      "ALTER TABLE site_source_seeds ADD COLUMN unknown TEXT",
      "UNSUPPORTED_HARVEST_SOURCE_SCHEMA",
    ],
    [
      "view",
      "ALTER TABLE site_source_seeds RENAME TO seeds; CREATE VIEW site_source_seeds AS SELECT * FROM seeds",
      "UNSUPPORTED_HARVEST_SOURCE_SCHEMA",
    ],
    [
      "site view",
      "ALTER TABLE sites RENAME TO old_sites; CREATE VIEW sites AS SELECT * FROM old_sites",
      "UNSUPPORTED_HARVEST_SOURCE_SCHEMA",
    ],
  ])("rejects %s rather than dropping a row", async (_label, sql, error) => {
    const f = await fixture((db) => db.exec(sql));
    await expect(collect(f.rows())).rejects.toThrow(error);
  });
  it("keeps opaque historical JSON and timestamps without reclassification", async () => {
    const f = await fixture((db) =>
      db.exec("UPDATE site_source_seeds SET raw_json='not JSON',created_at=-1"),
    );
    const [row] = await collect(f.rows());
    expect(row.columns.raw_json).toBe("not JSON");
    expect(row.columns.created_at).toBe(-1n);
  });
  it("rejects forged preparation and original artifact selection before opening SQLite", async () => {
    const f = await fixture();
    expect(() => streamPreparedHarvestSeeds({ ...f.prepared }, f.snapshot.uri)).toThrow(
      "PROCESS_LOCAL_PREPARED_SOURCE_REQUIRED",
    );
    const original = f.prepared.manifest.artifacts.find((a) => a.representation === "original")!;
    expect(() => streamPreparedHarvestSeeds(f.prepared, original.uri)).toThrow(
      "DECLARED_HARVEST_SNAPSHOT_REQUIRED",
    );
  });
  it.each(["before", "exhaustion", "return"])("detects changed snapshot on %s", async (when) => {
    const f = await fixture();
    const rows = f.rows();
    if (when !== "before") expect((await rows.next()).done).toBe(false);
    await fs.appendFile(f.file, "changed");
    await expect(when === "return" ? rows.return(undefined) : rows.next()).rejects.toThrow(
      "HARVEST_SNAPSHOT_CHANGED",
    );
  });
  it("does not deduplicate seeds sharing one domain; empty input remains empty", async () => {
    const f = await fixture((db) =>
      db.exec(`INSERT INTO site_source_seeds(site_id,source_path,source_item_key,raw_json)
      VALUES(1,'other.html','item-2','{}')`),
    );
    const rows = await collect(f.rows());
    expect(rows).toHaveLength(2);
    expect(rows[0].domain).toBe(rows[1].domain);
    expect(rows[0].source.seedLocator).not.toEqual(rows[1].source.seedLocator);
    const empty = await fixture((db) => db.exec("DELETE FROM site_source_seeds"));
    expect(await collect(empty.rows())).toEqual([]);
  });
  it("closes the private reader on early return without claiming completeness", async () => {
    const f = await fixture();
    const close = vi.spyOn(Database.prototype, "close");
    const rows = f.rows();
    await rows.next();
    await rows.return(undefined);
    expect(close).toHaveBeenCalledTimes(1);
    expect(await collect(f.rows())).toHaveLength(1);
  });
});
