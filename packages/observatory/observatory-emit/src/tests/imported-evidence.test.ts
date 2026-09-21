import { createHash } from "node:crypto";
import { once } from "node:events";
import nodeFs from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportedEvidenceDescriptor, Observation } from "@syrokomskyi/observatory-core";
import { EmitBundleWriter } from "../writer.js";
import { readEmitBundle, streamEvidence, streamObservations } from "../reader.js";

const init = {
  app_id: "offline-import",
  collector_version: "fixture",
  ruleset_version: "fixture",
  ontology_version: "fixture",
  run_id: "import-fixture",
  period: "2030-q1",
};
const hash = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
const observation: Observation = {
  observation_id: "0198f000-0000-7000-8000-000000000002",
  asset_id: "0198f000-0000-7000-8000-000000000001",
  crawl_id: "original-run",
  signal_path: "legal.impressum.present",
  value_type: "bool",
  value_bool: false,
  value_num: null,
  value_str: null,
  value_json: null,
  observed_at: "2030-01-02T00:00:00.000Z",
  recorded_at: "2030-01-03T00:00:00.000Z",
  collector_version: "original-collector",
  ruleset_version: "original-rules",
  probe_version: null,
  source_hash: null,
  crawl_hash: null,
  evidence_ref: null,
  confidence: 0.9,
  status: "active",
  superseded_by: null,
  deprecated_reason: null,
};
const evidence = (): ImportedEvidenceDescriptor => ({
  schema: "observatory-imported-evidence@1",
  origin: "converted-evidence",
  importedAt: "2030-04-01T00:00:00Z",
  sourceManifest: { uri: "archive/manifest.json", sha256: "a".repeat(64), bytes: 1024 },
  sourceRecords: [
    {
      artifact: { uri: "archive/snapshot.db", sha256: "b".repeat(64), bytes: 8192 },
      locator: `observations/${observation.observation_id}`,
    },
  ],
  target: {
    kind: "observation",
    assetId: observation.asset_id,
    recordId: observation.observation_id,
    sha256: hash(JSON.stringify(observation)),
  },
  measurement: { status: "observed", measuredAt: observation.observed_at },
});
let directory: string;
let writer: EmitBundleWriter;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "imported-evidence-emit-"));
  writer = new EmitBundleWriter(directory, init);
  await writer.open();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await writer.abort();
  await fs.rm(directory, { recursive: true, force: true });
});
async function readEvidence() {
  const output: unknown[] = [];
  for await (const record of streamEvidence(await readEmitBundle(directory))) output.push(record);
  return output;
}

function captureReadStreams() {
  const streams: nodeFs.ReadStream[] = [];
  const createReadStream = nodeFs.createReadStream;
  vi.spyOn(nodeFs, "createReadStream").mockImplementation((...args) => {
    const stream = createReadStream(...args);
    streams.push(stream);
    return stream;
  });
  return streams;
}

async function expectClosed(streams: nodeFs.ReadStream[]) {
  expect(streams).toHaveLength(1);
  expect(streams[0].destroyed).toBe(true);
  if (!streams[0].closed) await once(streams[0], "close");
  expect(streams[0].closed).toBe(true);
}

describe("imported evidence in the sole current emit format", () => {
  it("round-trips current observations and provenance without rewriting historical time or value", async () => {
    const descriptor = evidence();
    await writer.writeObservation(observation);
    await writer.writeEvidence(descriptor);
    const manifest = await writer.commit();
    expect(manifest.schema_version).toBe("3");
    expect(manifest.observation_count).toBe(1);
    expect(manifest.evidence_count).toBe(1);
    expect(await readEvidence()).toEqual([descriptor]);
    const observations: Observation[] = [];
    for await (const row of streamObservations(await readEmitBundle(directory)))
      observations.push(row);
    expect(observations).toEqual([observation]);
    const actualLine = await fs.readFile(
      path.join(directory, manifest.observation_partitions[0].uri),
      "utf8",
    );
    expect(hash(actualLine.slice(0, -1))).toBe(descriptor.target.sha256);
  });

  it.each(["time-unknown", "not-observed"] as const)(
    "keeps %s as retained evidence, with zero newly invented observations",
    async (status) => {
      const descriptor = evidence();
      const rawRecord = {
        evidenceType: "retained-record",
        recordId: "source-row-7",
        value: false,
        measuredAt: null,
      };
      const retained = {
        ...descriptor,
        target: {
          ...descriptor.target,
          kind: "retained-record",
          recordId: "source-row-7",
          sha256: hash(JSON.stringify(rawRecord)),
        },
        measurement: { status, measuredAt: null, reason: "source did not record measurement time" },
      };
      await writer.writeEvidence(rawRecord);
      await writer.writeEvidence(retained);
      const manifest = await writer.commit();
      expect(manifest.observation_count).toBe(0);
      expect(await readEvidence()).toEqual([rawRecord, retained]);
    },
  );

  it.each(["extra field", "unknown time", "unknown schema", "oversized time", "toJSON bypass"])(
    "rejects %s before writing evidence partitions",
    async (fault) => {
      const descriptor = evidence();
      const invalid =
        fault === "extra field"
          ? { ...descriptor, liveSeal: "invented" }
          : fault === "unknown time"
            ? {
                ...descriptor,
                measurement: { status: "time-unknown", measuredAt: null, reason: "missing" },
              }
            : fault === "unknown schema"
              ? { schema: "observatory-imported-evidence@2" }
              : fault === "oversized time"
                ? { ...descriptor, importedAt: `2030-04-01T00:00:00.${"0".repeat(65)}Z` }
                : { toJSON: () => ({ origin: "converted-evidence" }) };
      await expect(writer.writeEvidence(invalid)).rejects.toThrow();
      expect(await fs.readdir(path.join(directory, "evidence"))).toEqual([]);
      const manifest = await writer.commit();
      expect(manifest.evidence_count).toBe(0);
    },
  );

  it("rejects an invalid imported descriptor on read even with matching partition hashes", async () => {
    await writer.writeEvidence(evidence());
    const manifest = await writer.commit();
    const invalid = { ...evidence(), measurement: { status: "observed", measuredAt: null } };
    const bytes = `${JSON.stringify(invalid)}\n`;
    const part = manifest.evidence_partitions[0];
    await fs.writeFile(path.join(directory, part.uri), bytes);
    const replacement = { ...part, sha256: hash(bytes) };
    await fs.writeFile(
      path.join(directory, "manifest.json"),
      JSON.stringify({
        ...manifest,
        evidence_partitions: [replacement],
        evidence_hash: hash(`${replacement.uri}\0${replacement.row_count}\0${replacement.sha256}`),
      }),
    );
    const streams = captureReadStreams();
    let yielded = 0;
    await expect(async () => {
      for await (const _ of streamEvidence(await readEmitBundle(directory))) yielded++;
    }).rejects.toThrow();
    expect(yielded).toBe(0);
    await expectClosed(streams);
  });

  it("closes the partition handle when a consumer stops before full verification", async () => {
    await writer.writeEvidence(evidence());
    await writer.writeEvidence(evidence());
    await writer.commit();
    const streams = captureReadStreams();
    for await (const _ of streamEvidence(await readEmitBundle(directory))) break;
    await expectClosed(streams);
    // Early termination is resource-safe, but does not certify the unread remainder.
  });

  it.each(["CRLF", "blank line", "missing newline"])(
    "detects exact-byte tampering: %s",
    async (fault) => {
      await writer.writeEvidence(evidence());
      const manifest = await writer.commit();
      const file = path.join(directory, manifest.evidence_partitions[0].uri);
      const bytes = await fs.readFile(file, "utf8");
      await fs.writeFile(
        file,
        fault === "CRLF"
          ? bytes.replaceAll("\n", "\r\n")
          : fault === "blank line"
            ? `${bytes}\n`
            : bytes.slice(0, -1),
      );
      await expect(readEvidence()).rejects.toThrow(/integrity check failed/);
    },
  );
});
