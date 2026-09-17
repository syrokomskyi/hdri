/*
<MODULE_CONTRACT>
  <purpose>Production adapter: translate extracted signals into signed observations through the real ontology/signal-map/observation-builder/emit-writer path.</purpose>
  <non-goals><item>Does not mint operational signatures — the fixture key is deterministic rehearsal material.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: translation producer — signals → signed observations → emit bundle.</item>
</CHANGE_SUMMARY>
*/
import path from "node:path";
import Database from "better-sqlite3";
import { boolObs, jsonObs, numObs, readOntologyFile, strObs } from "@syrokomskyi/observatory-core";
import { signObservation } from "@syrokomskyi/observatory-crypto";
import { EmitBundleWriter } from "@syrokomskyi/observatory-emit";
import { migrateObservatory } from "../../../db/migrate.js";
import {
  ackFault,
  appendJsonl,
  deterministicId,
  loadFixtureManifest,
  parseAdapterArgs,
  scratchPath,
  writeJsonAtomic,
} from "../common.js";

const args = parseAdapterArgs();
const manifest = loadFixtureManifest(args.fixtureRoot);
const stageDir = path.join(args.workRoot, args.stage);

// Real ontology from the frozen runtime closure.
const ontology = await readOntologyFile("/runtime/closure/config/ontology.yaml");

const signalsDb = new Database(scratchPath(args.workRoot, "work/extraction/signals.sqlite"), {
  readonly: true,
});
const signals = signalsDb
  .prepare(
    "SELECT domain, page_kind, signal, value_json FROM extracted_signals ORDER BY domain, page_kind, signal",
  )
  .all() as { domain: string; page_kind: string; signal: string; value_json: string }[];
signalsDb.close();

const identityDb = new Database(scratchPath(args.workRoot, "work/frame-identity/identity.sqlite"), {
  readonly: true,
});
const idMap = new Map(
  (
    identityDb.prepare("SELECT domain, canonical_id FROM asset_id_map").all() as {
      domain: string;
      canonical_id: string;
    }[]
  ).map((r) => [r.domain, r.canonical_id]),
);
identityDb.close();

// Map extractor fields onto ontology signal paths via the real EXT_SIGNAL_MAP.
// Only extraction fields with a real ontology signal path are mapped; the
// rest (phones, emails, socialLinks, pageTitle, canonicalUrl, lang, *_Url) are
// skipped by pathFor → null.
const SIGNAL_PATH: Record<string, string> = {
  impressumPresent: "legal.impressum.present",
  datenschutzPresent: "legal.datenschutz.present",
  cookieBannerPresent: "privacy.consent.banner.present",
  openingHoursText: "content.opening_hours.present",
};
const pathFor = (signal: string, value: unknown): string | null => {
  const mapped = SIGNAL_PATH[signal];
  if (!mapped) return null;
  // presence-typed fields collapse to a boolean signal
  if (signal === "pageTitle" || signal === "openingHoursText") return mapped;
  if (typeof value === "boolean" || typeof value === "number" || Array.isArray(value))
    return mapped;
  return null;
};

const db = new Database(path.join(stageDir, "observations.sqlite"));
migrateObservatory(db);

const emitDir = path.join(stageDir, "emit");
const writer = new EmitBundleWriter(emitDir, {
  app_id: "hdri-observatory",
  collector_version: "rehearsal-translator@1",
  ruleset_version: ontology.version,
  ontology_version: ontology.version,
  run_id: manifest.runId,
  period: manifest.period,
});
await writer.open();

const insertObs = db.prepare(
  `INSERT INTO observations(
    id, asset_id, signal_path, ontology_version,
    value_bool, value_num, value_str, value_json, value_type,
    observed_at, recorded_at, run_id, evidence_ref, extractor_version,
    confidence, status, obs_json, signature, signed_at, signing_key_id,
    collector_id, collection_status, period, crawl_hash
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`,
);

const projection = path.join(stageDir, "projection.jsonl");
const signingKey = {
  privateKeyPem: manifest.signingKey.privateKeyPem,
  publicKeyPem: manifest.signingKey.publicKeyPem,
  signingKeyId: manifest.signingKey.signingKeyId,
  collectorId: manifest.signingKey.collectorId,
};

let translated = 0;
const midpoint = Math.floor(signals.length / 2);
const CHUNK = 5_000;

// better-sqlite3 transactions are synchronous — collect signed observations
// inside the transaction, then drain them to the emit writer after commit.
const writeChunk = async (batch: typeof signals): Promise<void> => {
  const signedBatch: ReturnType<typeof signObservation>[] = [];
  db.transaction(() => {
    for (const row of batch) {
      const assetId = idMap.get(row.domain);
      if (!assetId) throw new Error(`TRANSLATION_NO_IDENTITY:${row.domain}`);
      const value = JSON.parse(row.value_json) as unknown;
      const signalPath = pathFor(row.signal, value);
      if (!signalPath) continue;
      if (!ontology.signals[signalPath]) throw new Error(`TRANSLATION_UNMAPPED:${signalPath}`);
      const init = {
        asset_id: assetId,
        crawl_id: manifest.runId,
        signal_path: signalPath,
        observed_at: manifest.frozenTime,
        collector_version: "rehearsal-translator@1",
        ruleset_version: ontology.version,
        source_hash: args.consumedSha256,
        crawl_hash: args.inputFingerprint,
        evidence_ref: `work/extraction/signals.sqlite#${row.domain}:${row.page_kind}:${row.signal}`,
        confidence: 1,
      };
      // Build from the ontology's declared value_type so presence-typed signals
      // (e.g. openingHoursText string → bool) collapse correctly and the emitted
      // value_type always matches the ontology.
      const valueType = ontology.signals[signalPath].value_type;
      const built =
        valueType === "bool"
          ? boolObs(init, typeof value === "boolean" ? value : true)
          : valueType === "num"
            ? numObs(init, typeof value === "number" ? value : Number(value))
            : valueType === "str"
              ? strObs(init, typeof value === "string" ? value : JSON.stringify(value))
              : jsonObs(init, value);
      // Deterministic identity/time so resume produces byte-identical output.
      const obs = {
        ...built,
        observation_id: deterministicId("obs", `${row.domain}:${row.page_kind}:${row.signal}`),
        recorded_at: manifest.frozenTime,
      };
      const signed = { ...signObservation(obs, signingKey), signed_at: manifest.frozenTime };
      insertObs.run(
        obs.observation_id,
        obs.asset_id,
        obs.signal_path,
        ontology.version,
        // better-sqlite3 rejects booleans — bind value_bool as 0/1/null.
        obs.value_bool === null ? null : obs.value_bool ? 1 : 0,
        obs.value_num,
        obs.value_str,
        obs.value_json,
        obs.value_type,
        obs.observed_at,
        obs.recorded_at,
        obs.crawl_id,
        obs.evidence_ref,
        obs.collector_version,
        obs.confidence,
        JSON.stringify(signed),
        signed.signature,
        signed.signed_at,
        signed.signing_key_id,
        signed.collector_id,
        null,
        manifest.period,
        obs.crawl_hash,
      );
      signedBatch.push(signed);
      void appendJsonl(projection, {
        observation_id: obs.observation_id,
        asset_id: obs.asset_id,
        signal_path: obs.signal_path,
        value:
          obs.value_bool ?? obs.value_num ?? obs.value_str ?? JSON.parse(obs.value_json ?? "null"),
      });
      translated++;
    }
  })();
  for (const signed of signedBatch) await writer.writeObservation(signed);
};

// The first loop's slice end must clamp to midpoint — otherwise the last chunk
// overshoots into the second half and those rows are inserted twice (PK collide).
for (let i = 0; i < midpoint; i += CHUNK)
  await writeChunk(signals.slice(i, Math.min(i + CHUNK, midpoint)));
if (args.faultBoundary === "event-transaction")
  await ackFault(args, "event-transaction", {
    committedObservations: translated,
    pendingSignals: signals.length - midpoint,
  });
for (let i = midpoint; i < signals.length; i += CHUNK)
  await writeChunk(signals.slice(i, i + CHUNK));

const emitManifest = await writer.commit();
await writeJsonAtomic(path.join(stageDir, "translation-receipt.json"), {
  schema: "hdri-translation@1",
  stage: args.stage,
  signals: signals.length,
  observations: translated,
  emitPartitions: emitManifest.observation_partitions.length,
  bundleHash: emitManifest.bundle_hash,
  translatedAt: manifest.frozenTime,
});
db.close();
