import { expect, test } from "vitest";
import { generateSigningKey, signObservation } from "@syrokomskyi/observatory-crypto";
import type { Observation } from "@syrokomskyi/observatory-core";
import {
  compareAvailabilityObservations,
  type ExpectedAvailability,
} from "../release/availability-reconciliation";

const scope = { period: "2026-q3", capsuleId: "capsule", deviceId: "device" };
const signer = { ...generateSigningKey(), signingKeyId: "key", collectorId: "device" };
const keys = new Map([["key", signer]]);
const expected: ExpectedAvailability[] = [
  { assetId: "da-a", outcome: "reachable", isReachable: true, sourceHash: "a".repeat(64) },
  { assetId: "da-b", outcome: "blocked", isReachable: false, sourceHash: "b".repeat(64) },
];
function rows() {
  return expected.flatMap((record) =>
    [true, false].map((outcome): Observation => ({
      observation_id: `${record.assetId}-${outcome}`,
      asset_id: record.assetId,
      crawl_id: "crawl",
      signal_path: `availability.website.${outcome ? "outcome" : "is_reachable"}`,
      value_type: outcome ? "str" : "bool",
      value_str: outcome ? record.outcome : null,
      value_bool: outcome ? null : record.isReachable,
      value_num: null,
      value_json: null,
      observed_at: "2026-09-23T00:00:00.000Z",
      recorded_at: "2026-09-23T00:00:00.000Z",
      collector_version: "test",
      probe_version: "test",
      ruleset_version: "2.0.0",
      source_hash: record.sourceHash,
      crawl_hash: "capsule",
      evidence_ref: `staging/execution/cas/${record.sourceHash.slice(0, 2)}/${record.sourceHash}.json`,
      confidence: 1,
      status: "active",
      superseded_by: null,
      deprecated_reason: null,
    })),
  );
}
const compare = (input = rows()) =>
  compareAvailabilityObservations(
    scope,
    expected,
    input.map((row) => signObservation(row, signer)),
    keys,
  );
test("compares every required signal and retains all target outcomes", async () => {
  expect(await compare()).toMatchObject({
    targets: 2,
    observationsCompared: 4,
    counts: { reachable: 1, unavailable: 0, blocked: 1, indeterminate: 0 },
    status: "projection-matched-not-release-proof",
  });
});
test("same-count signed value substitution fails", async () => {
  const input = rows();
  input[0] = { ...input[0]!, value_str: "blocked" };
  input[2] = { ...input[2]!, value_str: "reachable" };
  await expect(compare(input)).rejects.toThrow("VALUE_MISMATCH");
});
test("missing and duplicate projections fail", async () => {
  await expect(compare(rows().slice(1))).rejects.toThrow("INCOMPLETE");
  await expect(compare([...rows(), rows()[0]!])).rejects.toThrow("DUPLICATE");
});
test("valid signatures cannot authorize another source or quarter", async () => {
  const input = rows();
  input[0] = { ...input[0]!, source_hash: "c".repeat(64) };
  await expect(compare(input)).rejects.toThrow("SOURCE_MISMATCH");
  input[0] = { ...rows()[0]!, observed_at: "2026-10-01T00:00:00.000Z" };
  await expect(compare(input)).rejects.toThrow("SCOPE_INVALID");
});
test("unsigned values and post-signing mutation fail", async () => {
  await expect(compareAvailabilityObservations(scope, expected, rows(), keys)).rejects.toThrow(
    "SIGNATURE_INVALID",
  );
  const input = rows().map((row) => signObservation(row, signer));
  input[0] = { ...input[0]!, value_str: "blocked" };
  await expect(compareAvailabilityObservations(scope, expected, input, keys)).rejects.toThrow(
    "SIGNATURE_INVALID",
  );
});
test("a late stream-integrity failure remains fatal after all availability values matched", async () => {
  async function* stream() {
    for (const row of rows()) yield signObservation(row, signer);
    throw new Error("partition-integrity-failed");
  }
  await expect(compareAvailabilityObservations(scope, expected, stream(), keys)).rejects.toThrow(
    "partition-integrity-failed",
  );
});
