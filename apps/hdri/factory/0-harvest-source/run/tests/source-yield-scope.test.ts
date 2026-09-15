import { afterEach, expect, test } from "vitest";
import Database from "better-sqlite3";
import { migrateCore } from "@syrokomskyi/business-core/migrate";
import { checkPerSourceYield } from "../gogols/check-min-sites-guard.js";
import { upsertSite, upsertSourceSeed } from "../gogols/parse-sources-db.js";
import type { SourceBusinessSeed } from "../source-records.js";

const databases: Database.Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});
function fixture() {
  const db = new Database(":memory:");
  databases.push(db);
  migrateCore(db);
  const siteId = upsertSite(db, "known-company.example");
  const item: SourceBusinessSeed = {
    sourceItemKey: "company-1",
    sourcePageNumber: null,
    businessName: "Known Company",
    streetAddress: null,
    postalCode: null,
    city: null,
    phone: null,
    email: null,
    websiteUrl: "https://known-company.example",
    category: null,
    sourceProfileUrl: null,
    raw: {},
  };
  return { db, add: (sourcePath: string) => upsertSourceSeed(db, siteId, sourcePath, item) };
}
const current = "2026-q3-de-01";
test.each(["2026-q2-de-01", "2026-q3-de-02"])(
  "evidence from %s remains intact but cannot prove another batch's yield",
  (batch) => {
    const f = fixture();
    f.add(`${batch}/catalog.example/1.csv`);
    const before = f.db.serialize();
    expect(() => checkPerSourceYield(f.db, ["catalog.example"], {}, -1, current)).toThrow(
      /zero accepted seeds/,
    );
    expect(f.db.serialize()).toEqual(before);
  },
);
test("new-batch provenance for an already known domain is valid yield, not required domain novelty", () => {
  const f = fixture();
  f.add("2026-q2-de-01/catalog.example/1.csv");
  f.add(`${current}/catalog.example/1.csv`);
  const before = f.db.serialize();
  expect(() => checkPerSourceYield(f.db, ["catalog.example"], {}, -1, current)).not.toThrow();
  expect(f.db.serialize()).toEqual(before);
  expect(f.db.prepare("SELECT count(*) AS n FROM sites").get()).toEqual({ n: 1 });
  expect(f.db.prepare("SELECT count(*) AS n FROM site_source_seeds").get()).toEqual({ n: 2 });
});
test.each(["nested/catalog.example", "catalog.example-extra", "CATALOG.EXAMPLE"])(
  "different top-level source %s does not satisfy the requested source",
  (folder) => {
    const f = fixture();
    f.add(`${current}/${folder}/1.csv`);
    expect(() => checkPerSourceYield(f.db, ["catalog.example"], {}, -1, current)).toThrow(
      /zero accepted seeds/,
    );
  },
);
test.each(["source_%", "source' OR 1=1 --", "quelle-ä-🌍"])(
  "source name %s is matched literally",
  (folder) => {
    const f = fixture();
    f.add(`${current}/source-ordinary/1.csv`);
    expect(() => checkPerSourceYield(f.db, [folder], {}, -1, current)).toThrow(
      /zero accepted seeds/,
    );
    f.add(`${current}/${folder}/1.csv`);
    expect(() => checkPerSourceYield(f.db, [folder], {}, -1, current)).not.toThrow();
  },
);
test("batch-root sources require direct files, not any nested source in the batch", () => {
  const f = fixture();
  f.add(`${current}/catalog.example/1.csv`);
  expect(() => checkPerSourceYield(f.db, ["__batch_root__"], {}, -1, current)).toThrow(
    /zero accepted seeds/,
  );
  f.add(`${current}/1.csv`);
  expect(() => checkPerSourceYield(f.db, ["__batch_root__"], {}, -1, current)).not.toThrow();
});
test.each(["", ".", "..", "batch/subdir", "batch\\subdir", "batch\u0000"])(
  "invalid batch scope %j fails",
  (batch) => {
    const f = fixture();
    expect(() => checkPerSourceYield(f.db, ["catalog.example"], {}, -1, batch)).toThrow(
      /exact batch ID/,
    );
  },
);
test("diagnostic runs remain unsealed and explicit source dispositions do not leak to another source", () => {
  const f = fixture();
  expect(() => checkPerSourceYield(f.db, ["catalog.example"], {}, 0, current)).not.toThrow();
  expect(() =>
    checkPerSourceYield(
      f.db,
      ["catalog.example"],
      { "catalog.example": "declared-noise" },
      -1,
      current,
    ),
  ).not.toThrow();
  expect(() =>
    checkPerSourceYield(
      f.db,
      ["other.example"],
      { "catalog.example": "declared-noise" },
      -1,
      current,
    ),
  ).toThrow(/zero accepted seeds/);
});
