import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { generateSigningKey } from "@syrokomskyi/observatory-crypto";
import {
  sealQuarterCapsule,
  verifyQuarterCapsuleArtifacts,
  extractSourceLedgerHead,
  type CapsuleArtifact,
  type QuarterCapsule,
} from "../lib/capsule.js";
import {
  parsePriorCapsulesFile,
  readPriorCapsulesFile,
  discoverPriorCapsules,
  verifyPriorCapsule,
  type PriorCapsuleEntry,
} from "../lib/prior-capsules.js";
import { freezeFrame } from "../lib/source-ledger.js";
import {
  publishFrozenFrameProjection,
  rebuildLedgerHead,
  sealSourceBatch,
  verifySourceClosure,
} from "../lib/source-ledger-store.js";
import { DEFAULT_INSTRUMENT_PLAN } from "../lib/quarter-contracts.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
const key = { ...generateSigningKey(), signingKeyId: "test-prior", collectorId: "test-device" };
const keys = new Map([[key.signingKeyId, key]]);
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const prefix = "artifacts/frame/test-device/source-ledger";

async function fixture(
  transform: (capsule: QuarterCapsule) => QuarterCapsule = (capsule) => capsule,
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-prior-reader-"));
  roots.push(root);
  const capsuleDir = path.join(root, "q2");
  const ledgerDir = path.join(capsuleDir, prefix);
  const batchId = "2026-q2-de-01";
  await sealSourceBatch(
    ledgerDir,
    {
      schemaVersion: "1",
      batchId,
      periodAdded: "2026-q2",
      batchHash: hash("batch"),
      files: [
        {
          relativePath: "source.csv",
          sha256: hash("source"),
          bytes: 6,
          parserId: "csv",
          parserVersion: "1",
        },
      ],
    },
    key,
  );
  const occurrence = {
    sourceOccurrenceId: "so-test",
    batchId,
    periodAdded: "2026-q2" as const,
    provisionalAssetId: "da-test" as const,
    normalisedDomain: "company.example",
    disposition: "assertion" as const,
  };
  const occurrenceBytes = `${JSON.stringify(occurrence)}\n`;
  const occurrenceTemp = path.join(root, "occurrences.ndjson");
  await fs.writeFile(occurrenceTemp, occurrenceBytes);
  const frame = freezeFrame("2026-q2", [occurrence], {
    ledgerHead: await rebuildLedgerHead(ledgerDir),
    occurrenceProjectionSha256: hash(occurrenceBytes),
  });
  await publishFrozenFrameProjection(ledgerDir, frame, occurrenceTemp, key);
  const artifacts: CapsuleArtifact[] = [];
  for (const relative of [
    `segments/${batchId}.json`,
    "projections/frame-2026-q2.json",
    "projections/frame-2026-q2.manifest.json",
    "projections/source-occurrences-2026-q2.ndjson",
  ]) {
    const bytes = await fs.readFile(path.join(ledgerDir, relative));
    artifacts.push({
      stage: "frame",
      uri: `${prefix}/${relative}`,
      sha256: hash(bytes),
      bytes: bytes.length,
    });
  }
  // Opaque instrument artifacts satisfy the capsule storage contract, not scientific admission.
  const placeholders: Array<{ stage: CapsuleArtifact["stage"]; uri: string }> = (
    [
      "liveness",
      "profile",
      "axe",
      "emit",
      "identity",
      "vault",
      "methodology",
      "publication",
    ] as const
  ).map((stage) => ({ stage, uri: `${stage}/result` }));
  for (const instrument of ["liveness", "homepage-capture", "detected-page-capture", "axe"])
    for (const kind of ["targets", "stage-seals"])
      placeholders.push({ stage: "qc", uri: `staging/${kind}/${instrument}.json` });
  for (const item of placeholders) {
    const file = path.join(capsuleDir, item.uri);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "fixture");
    artifacts.push({ ...item, sha256: hash("fixture"), bytes: 7 });
  }
  const capsule: QuarterCapsule = transform({
    period: "2026-q2",
    capsuleId: "0198f000-0000-7000-8000-000000000000",
    state: "sealed",
    instrumentPlan: DEFAULT_INSTRUMENT_PLAN,
    artifacts,
  });
  const manifestPath = await sealQuarterCapsule(capsuleDir, capsule, key);
  const entry: PriorCapsuleEntry = {
    period: "2026-q2",
    capsuleId: capsule.capsuleId,
    manifestPath: path.relative(root, manifestPath),
    sourceLedgerHead: frame.ledgerHead,
    frameId: "frame-2026-q2.json",
    batchIds: [batchId],
  };
  return { root, capsuleDir, ledgerDir, capsule, entry, manifestPath };
}

test("actual capsule writer output is verifiable without prior raw folders and remains byte-identical", async () => {
  const f = await fixture();
  const paths = [
    f.manifestPath,
    path.join(f.capsuleDir, "capsule-signature.json"),
    ...f.capsule.artifacts.map((a) => path.join(f.capsuleDir, a.uri)),
  ];
  const before = await Promise.all(paths.map((file) => fs.readFile(file)));
  const verified = await verifyPriorCapsule(f.entry, f.root, keys);
  expect(verified.batchIds).toEqual(["2026-q2-de-01"]);
  expect(verified.predecessorManifestSha256).toBe(hash(before[0]!));
  expect(verified.segmentHashes).toEqual([
    hash(await fs.readFile(path.join(f.ledgerDir, "segments/2026-q2-de-01.json"))),
  ]);
  expect(await Promise.all(paths.map((file) => fs.readFile(file)))).toEqual(before);
  await expect(fs.access(path.join(f.root, ".input/batches"))).rejects.toThrow();
});

test.each([
  { period: "2026-q1" as const },
  { capsuleId: "0198f000-0000-7000-8000-000000000001" },
  { batchIds: ["2026-q2-de-02"] },
  { batchIds: [] },
  { batchIds: ["2026-q2-de-01", "2026-q2-de-01"] },
  { sourceLedgerHead: "wrong" },
  { frameId: "frame-2026-q1.json" },
])("caller metadata cannot relabel signed historical evidence: %j", async (change) => {
  const f = await fixture();
  await expect(verifyPriorCapsule({ ...f.entry, ...change }, f.root, keys)).rejects.toThrow(
    /mismatch/,
  );
});

test("unknown verification keys cannot authenticate a prior capsule", async () => {
  const f = await fixture();
  await expect(verifyPriorCapsule(f.entry, f.root, new Map())).rejects.toThrow(/untrusted/);
});

test.each([
  "capsule-manifest.json",
  "capsule-signature.json",
  `${prefix}/segments/2026-q2-de-01.json`,
  `${prefix}/projections/source-occurrences-2026-q2.ndjson`,
  "methodology/result",
])("changed retained bytes fail verification: %s", async (relative) => {
  const f = await fixture();
  await fs.writeFile(path.join(f.capsuleDir, relative), "tampered");
  await expect(verifyPriorCapsule(f.entry, f.root, keys)).rejects.toThrow();
});

test("matching bytes reached through a symlink are not accepted capsule artifacts", async () => {
  const f = await fixture();
  const file = path.join(f.capsuleDir, "methodology/result");
  const moved = path.join(f.root, "moved-result");
  await fs.rename(file, moved);
  await fs.symlink(moved, file);
  await expect(verifyPriorCapsule(f.entry, f.root, keys)).rejects.toThrow(/UNSAFE_OBJECT_PATH/);
});

test("manifest digest identifies actual retained serialization, not canonical payload alone", async () => {
  const f = await fixture();
  const first = await verifyPriorCapsule(f.entry, f.root, keys);
  const bytes = JSON.stringify(f.capsule);
  await fs.writeFile(f.manifestPath, bytes);
  const second = await verifyPriorCapsule(f.entry, f.root, keys);
  expect(second.predecessorManifestSha256).toBe(hash(bytes));
  expect(second.predecessorManifestSha256).not.toBe(first.predecessorManifestSha256);
});

test.each([
  "projections/frame-2026-q2.manifest.json",
  "projections/source-occurrences-2026-q2.ndjson",
])(
  "an on-disk source artifact absent from the signed inventory cannot supply inheritance: %s",
  async (relative) => {
    const f = await fixture((capsule) => ({
      ...capsule,
      artifacts: capsule.artifacts.filter((a) => a.uri !== `${prefix}/${relative}`),
    }));
    await expect(verifyPriorCapsule(f.entry, f.root, keys)).rejects.toThrow(
      /signed source frame|not bound to capsule/,
    );
  },
);

test("a legacy flag cannot bypass current prior-source verification", async () => {
  const f = await fixture((capsule) => ({ ...capsule, legacy: true }));
  await expect(verifyPriorCapsule(f.entry, f.root, keys)).rejects.toThrow(
    /preservation-verified conversion/,
  );
});

test.each([null, "batch", ["2026-q2-de-01", 123], [""]])(
  "reference parser rejects malformed batch lists rather than dropping evidence: %j",
  (batchIds) => {
    expect(() =>
      parsePriorCapsulesFile(
        JSON.stringify({
          schemaVersion: "1",
          currentPeriod: "2026-q3",
          priorCapsules: [
            {
              period: "2026-q2",
              capsuleId: "0198f000-0000-7000-8000-000000000000",
              manifestPath: "q2/capsule-manifest.json",
              sourceLedgerHead: "head",
              frameId: "frame",
              batchIds,
            },
          ],
        }),
      ),
    ).toThrow(/batchIds/);
  },
);

test.each([
  "../outside",
  "./methodology/result",
  "methodology//result",
  "C:/outside",
  "/outside",
  "methodology\\result",
])("the shared capsule verifier rejects unsafe artifact paths: %s", async (uri) => {
  const f = await fixture();
  await expect(
    verifyQuarterCapsuleArtifacts(f.capsuleDir, {
      ...f.capsule,
      artifacts: [
        ...f.capsule.artifacts,
        { stage: "methodology", uri, sha256: hash("fixture"), bytes: 7 },
      ],
    }),
  ).rejects.toThrow();
});

test("the shared capsule verifier rejects duplicate inventory paths", async () => {
  const f = await fixture();
  await expect(
    verifyQuarterCapsuleArtifacts(f.capsuleDir, {
      ...f.capsule,
      artifacts: [...f.capsule.artifacts, f.capsule.artifacts[0]!],
    }),
  ).rejects.toThrow(/duplicate/);
});

test("source closure refuses a linked segment even when called without the capsule reader", async () => {
  const f = await fixture();
  const file = path.join(f.ledgerDir, "segments/2026-q2-de-01.json");
  const moved = path.join(f.root, "segment.json");
  await fs.rename(file, moved);
  await fs.symlink(moved, file);
  await expect(verifySourceClosure(f.ledgerDir, "2026-q2", keys)).rejects.toThrow(
    /UNSAFE_OBJECT_PATH/,
  );
});

test("invalid source closure period fails before accessing any files", async () => {
  await expect(
    verifySourceClosure("/nonexistent-hdri-fixture", "../2026-q2", keys),
  ).rejects.toThrow(/period/);
});

test("quarter initialization selects the actual frame even when occurrences appear first", async () => {
  const f = await fixture();
  const reordered = { ...f.capsule, artifacts: [...f.capsule.artifacts].reverse() };
  expect(await extractSourceLedgerHead(f.capsuleDir, reordered)).toEqual({
    ledgerHead: f.entry.sourceLedgerHead,
    frameId: "frame-2026-q2.json",
  });
  await fs.appendFile(path.join(f.ledgerDir, "projections/frame-2026-q2.json"), " ");
  await expect(extractSourceLedgerHead(f.capsuleDir, reordered)).rejects.toThrow(/inventory/);
});

test("quarter initialization refuses ambiguous frame selection", async () => {
  const f = await fixture();
  const frame = f.capsule.artifacts.find((a) => a.uri.endsWith("/frame-2026-q2.json"))!;
  await expect(
    extractSourceLedgerHead(f.capsuleDir, {
      ...f.capsule,
      artifacts: [...f.capsule.artifacts, { ...frame, uri: "other-device/frame-2026-q2.json" }],
    }),
  ).rejects.toThrow(/exactly one/);
});

test("oversized capsule JSON is rejected before loading it into memory", async () => {
  const f = await fixture();
  await fs.truncate(f.manifestPath, 64 * 1024 * 1024 + 1);
  await expect(verifyPriorCapsule(f.entry, f.root, keys)).rejects.toThrow(/OVERSIZED_FILE/);
});

test("invalid UTF-8 is rejected rather than repaired before signature verification", async () => {
  const f = await fixture();
  await fs.writeFile(f.manifestPath, Buffer.from([0x7b, 0xff, 0x7d]));
  await expect(verifyPriorCapsule(f.entry, f.root, keys)).rejects.toThrow(/encoded data/);
});

test("discovery uses the already-read input and authenticates the requested quarter", async () => {
  const f = await fixture();
  const file = path.join(f.root, "prior-capsules.json");
  await fs.writeFile(
    file,
    JSON.stringify({ schemaVersion: "1", currentPeriod: "2026-q3", priorCapsules: [f.entry] }),
  );
  const input = await readPriorCapsulesFile(f.root);
  await fs.writeFile(file, "changed-after-read");
  const refs = await discoverPriorCapsules(input, f.root, keys, "2026-q3");
  expect(refs.map((ref) => ref.capsuleId)).toEqual([f.capsule.capsuleId]);
  await expect(discoverPriorCapsules(input, f.root, keys, "2026-q4")).rejects.toThrow(
    /requested operation/,
  );
});

test.each(["2026-q3", "2026-q4", "2027-q1"])(
  "discovery rejects nonhistorical period %s before reading a referenced archive",
  async (period) => {
    const input = {
      schemaVersion: "1",
      currentPeriod: "2026-q3",
      priorCapsules: [
        {
          period,
          capsuleId: "0198f000-0000-7000-8000-000000000000",
          manifestPath: "absent/capsule-manifest.json",
          sourceLedgerHead: "head",
          frameId: "frame",
          batchIds: [],
        },
      ],
    };
    expect(() => parsePriorCapsulesFile(JSON.stringify(input))).toThrow(/must precede/);
  },
);

test.each(["same", "same-period", "same-id"])(
  "discovery rejects conflicting references: %s",
  async (mode) => {
    const f = await fixture();
    const second = {
      ...f.entry,
      ...(mode === "same-period" ? { capsuleId: "0198f000-0000-7000-8000-000000000001" } : {}),
      ...(mode === "same-id" ? { period: "2026-q1" } : {}),
    };
    expect(() =>
      parsePriorCapsulesFile(
        JSON.stringify({
          schemaVersion: "1",
          currentPeriod: "2026-q3",
          priorCapsules: [f.entry, second],
        }),
      ),
    ).toThrow(/duplicate or conflicting/);
  },
);

test("an empty discovery file is still bound to its requested quarter", async () => {
  await expect(
    discoverPriorCapsules(
      { schemaVersion: "1", currentPeriod: "2026-q2", priorCapsules: [] },
      "/nonexistent-hdri-fixture",
      new Map(),
      "2026-q3",
    ),
  ).rejects.toThrow(/requested operation/);
});

test("discovery input is bounded and strictly decoded", async () => {
  const f = await fixture();
  const file = path.join(f.root, "prior-capsules.json");
  await fs.writeFile(file, Buffer.from([0xff]));
  await expect(readPriorCapsulesFile(f.root)).rejects.toThrow(/failed to parse/);
  await fs.truncate(file, 1024 * 1024 + 1);
  await expect(readPriorCapsulesFile(f.root)).rejects.toThrow(/OVERSIZED_FILE/);
});
