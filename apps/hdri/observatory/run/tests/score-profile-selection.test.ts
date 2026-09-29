import {expect, test} from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import {parseCodebookOrThrow} from "@syrokomskyi/hdri-codebook";
import {migrateObservatory} from "../db/migrate";
import {scoreAndWriteForRun, scoreSelectionForPeriod} from "../score/score-core";

test("Q3 excludes unavailable and Axe-only sites without deleting evidence or changing retained scores", () => {
  const db = new Database(":memory:");
  try {
    migrateObservatory(db);
    const book = parseCodebookOrThrow(fs.readFileSync(path.resolve(__dirname,"../../.input/codebook.yaml"),"utf8"));
    const insert = db.prepare(`INSERT INTO observations (id,asset_id,signal_path,ontology_version,value_bool,value_num,value_str,value_type,observed_at,recorded_at,run_id,period)
      VALUES (?,?,?,'2.0.0',?,?,?,?,'2026-09-25T00:00:00Z','2026-09-25T00:00:00Z','run','2026-q3')`);
    let count = 0;
    const observation = (asset: string, key: string, value: boolean | number | string | null) => {
      const kind = typeof value === "boolean" ? "bool" : typeof value === "number" ? "num" : "str";
      insert.run(`obs-${++count}`,asset,key,kind === "bool" ? Number(value) : null,kind === "num" ? value : null,kind === "str" ? value : null,kind);
    };
    const profile = (asset: string) => {
      for (const dimension of book.dimensions) for (const ind of dimension.indicators) {
        if (ind.inputKey.startsWith("audit.axe.")) continue;
        observation(asset,ind.inputKey,ind.rule.type === "enum" ? Object.keys(ind.rule.cases)[0]! : false);
      }
    };
    profile("profile-only"); profile("unavailable"); profile("complete");
    for (const asset of ["profile-only","complete","axe-only","no-measurements"])
      observation(asset,"availability.website.is_reachable",true);
    observation("unavailable","availability.website.is_reachable",false);
    for (const asset of ["axe-only","complete"]) for (const dimension of book.dimensions) for (const ind of dimension.indicators)
      if (ind.inputKey.startsWith("audit.axe.")) observation(asset,ind.inputKey,0);
    const options = {runId: "run", period: "2026-q3", now: "2026-09-28T00:00:00Z"};
    const legacy = scoreAndWriteForRun(db,book,{...options,selectionPolicy: "legacy"});
    expect(legacy.scored).toBe(5);
    const selected = scoreAndWriteForRun(db,book,{...options,selectionPolicy: scoreSelectionForPeriod(options.period)});
    expect(selected.scored).toBe(2);
    expect(selected.excludedUnavailable).toBe(1);
    expect(selected.excludedMissingProfile).toBe(2);
    expect([...selected.perAsset.keys()].sort()).toEqual(["complete","profile-only"]);
    for (const [asset,score] of selected.perAsset) expect(score).toEqual(legacy.perAsset.get(asset));
    expect(db.prepare("SELECT COUNT(*) n FROM observations").get()).toEqual({n: count});
    expect(db.prepare("SELECT COUNT(*) n FROM scores").get()).toEqual({n: 2});
    expect(db.prepare("SELECT COUNT(*) n FROM score_indicator_traces t LEFT JOIN scores s ON s.id=t.score_id WHERE s.id IS NULL").get()).toEqual({n: 0});
    const repeated = scoreAndWriteForRun(db,book,{...options,selectionPolicy: scoreSelectionForPeriod(options.period)});
    expect(repeated.perAsset).toEqual(selected.perAsset);
  } finally {db.close();}
});

test("historical Q2 keeps its original selection while Q3 and Q4 use collected profiles", () => {
  expect(scoreSelectionForPeriod("2026-q2")).toBe("legacy");
  expect(scoreSelectionForPeriod("2026-q3")).toBe("reachable-profile-v1");
  expect(scoreSelectionForPeriod("2026-q4")).toBe("reachable-profile-v1");
  expect(()=>scoreSelectionForPeriod("invalid")).toThrow();
});
