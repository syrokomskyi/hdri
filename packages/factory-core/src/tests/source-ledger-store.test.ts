import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateSigningKey } from "@syrokomskyi/observatory-crypto";
import { checkSourceBatch, copyVerifiedArtifact, publishFrozenFrameProjection, readSourceBatchManifests, rebuildLedgerHead, sealFrameManifest, sealSourceBatch, verifySignedLedgerManifest, verifySourceClosure, type SignedLedgerManifest } from "../lib/source-ledger-store.js";
import { freezeFrame, frozenFrameSha256, type FrozenFrame } from "../lib/source-ledger.js";
import type { SourceBatchManifest } from "../lib/quarter-contracts.js";

const dirs: string[] = [];
const generated = generateSigningKey();
const signingKey = { ...generated, signingKeyId: "device-a-test", collectorId: "device-a" };
const manifest = (hash: string): SourceBatchManifest => ({
  schemaVersion: "1",
  batchId: "2026-q3-de-01",
  periodAdded: "2026-q3",
  batchHash: hash,
  files: [{ relativePath: "source/a.csv", sha256: "a", bytes: 1, parserId: "csv", parserVersion: "1" }],
});

afterEach(async () => Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))));

describe("source ledger store", () => {
  it("is idempotent for identical bytes and rejects mutation", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-ledger-"));
    dirs.push(dir);
    expect(await checkSourceBatch(dir, manifest("one"), signingKey)).toBe("new");
    expect(await sealSourceBatch(dir, manifest("one"), signingKey)).toBe("sealed");
    expect(await checkSourceBatch(dir, manifest("one"), signingKey)).toBe("already-sealed");
    const head = await rebuildLedgerHead(dir);
    expect(await sealSourceBatch(dir, manifest("one"), signingKey)).toBe("already-sealed");
    expect(await rebuildLedgerHead(dir)).toBe(head);
    await expect(sealSourceBatch(dir, manifest("changed"), signingKey)).rejects.toThrow(/different bytes/);
    const envelope = JSON.parse(await fs.readFile(path.join(dir, "segments", "2026-q3-de-01.json"), "utf8")) as SignedLedgerManifest<SourceBatchManifest>;
    expect(verifySignedLedgerManifest(envelope, signingKey)).toBe(true);
    expect(verifySignedLedgerManifest({ ...envelope, collectorId: "forged-device" }, signingKey)).toBe(false);
    expect(verifySignedLedgerManifest({ ...envelope, signedAt: "2099-01-01T00:00:00.000Z" }, signingKey)).toBe(false);
    const trustedKeys = new Map([[signingKey.signingKeyId, signingKey]]);
    expect(await checkSourceBatch(dir, manifest("one"), trustedKeys)).toBe("already-sealed");
    expect((await readSourceBatchManifests(dir, trustedKeys))[0]?.batchId).toBe("2026-q3-de-01");
    const rotatedPair = generateSigningKey();
    const rotatedKey = { ...rotatedPair, signingKeyId: "device-a-rotated", collectorId: "device-a" };
    expect(await sealSourceBatch(dir, manifest("one"), rotatedKey, trustedKeys)).toBe("already-sealed");
    await fs.writeFile(
      path.join(dir, "segments", "2026-q3-de-01.json"),
      `${JSON.stringify({ ...envelope, signature: "tampered" })}\n`,
      "utf8",
    );
    await expect(checkSourceBatch(dir, manifest("one"), signingKey)).rejects.toThrow(/signature is invalid/);
  });

  it("verifies the complete ledger, occurrence and frame closure", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-closure-"));
    dirs.push(dir);
    await sealSourceBatch(dir, manifest("one"), signingKey);
    const ledgerHead = await rebuildLedgerHead(dir);
    const projectionDir = path.join(dir, "projections");
    await fs.mkdir(projectionDir, { recursive: true });
    const occurrenceBytes = '{"sourceOccurrenceId":"so-a"}\n';
    await fs.writeFile(path.join(projectionDir, "source-occurrences-2026-q3.ndjson"), occurrenceBytes);
    const occurrenceProjectionSha256 = (await import("node:crypto")).createHash("sha256").update(occurrenceBytes).digest("hex");
    const unsigned = {
      period: "2026-q3", candidateIds: ["da-a"], includedBatchIds: ["2026-q3-de-01"],
      ledgerHead, occurrenceProjectionSha256,
    } as const;
    const frame: FrozenFrame = { ...unsigned, frameSha256: frozenFrameSha256(unsigned) };
    await fs.writeFile(path.join(projectionDir, "frame-2026-q3.json"), `${JSON.stringify(frame)}\n`);
    await sealFrameManifest(dir, frame, signingKey);
    const keys = new Map([[signingKey.signingKeyId, signingKey]]);
    await expect(verifySourceClosure(dir, "2026-q3", keys)).resolves.toMatchObject({ frame });
    await fs.appendFile(path.join(projectionDir, "source-occurrences-2026-q3.ndjson"), "tampered\n");
    await expect(verifySourceClosure(dir, "2026-q3", keys)).rejects.toThrow(/occurrence projection mismatch/);
    await fs.writeFile(path.join(projectionDir, "source-occurrences-2026-q3.ndjson"), occurrenceBytes);
    const segmentPath = path.join(dir, "segments", "2026-q3-de-01.json");
    const segment = JSON.parse(await fs.readFile(segmentPath, "utf8")) as SignedLedgerManifest<SourceBatchManifest>;
    await fs.writeFile(segmentPath, `${JSON.stringify({ ...segment, collectorId: "forged-device" })}\n`);
    await expect(verifySourceClosure(dir, "2026-q3", keys)).rejects.toThrow(/signature is invalid/);
  });

  it("seals the ledger-bound frame manifest and rejects replacement", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-frame-"));
    dirs.push(dir);
    const frame = freezeFrame("2026-q3", [], {
      includedBatchIds: ["2026-q3-de-01"],
      ledgerHead: "ledger-a",
      occurrenceProjectionSha256: "occurrences-a",
    });
    const target = await sealFrameManifest(dir, frame, signingKey);
    const envelope = JSON.parse(await fs.readFile(target, "utf8")) as SignedLedgerManifest<FrozenFrame>;
    expect(verifySignedLedgerManifest(envelope, signingKey)).toBe(true);
    const changed = freezeFrame("2026-q3", [], { includedBatchIds: frame.includedBatchIds, ledgerHead: "changed", occurrenceProjectionSha256: frame.occurrenceProjectionSha256 });
    await expect(sealFrameManifest(dir, changed, signingKey)).rejects.toThrow(/different or invalid/);
  });

  it("rejects a repeated frame conflict before replacing frozen projection bytes", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-frame-projection-"));
    dirs.push(dir);
    const firstOccurrence = path.join(dir, "first.ndjson");
    await fs.writeFile(firstOccurrence, "first\n");
    const firstHash = (await import("node:crypto")).createHash("sha256").update("first\n").digest("hex");
    const frame = freezeFrame("2026-q3", [], { includedBatchIds: [], ledgerHead: "ledger-a", occurrenceProjectionSha256: firstHash });
    await publishFrozenFrameProjection(dir, frame, firstOccurrence, signingKey);
    const frozenOccurrence = path.join(dir, "projections", "source-occurrences-2026-q3.ndjson");
    const frozenFrame = path.join(dir, "projections", "frame-2026-q3.json");
    const occurrenceBefore = await fs.readFile(frozenOccurrence, "utf8");
    const frameBefore = await fs.readFile(frozenFrame, "utf8");
    const changedOccurrence = path.join(dir, "changed.ndjson");
    await fs.writeFile(changedOccurrence, "changed\n");
    const changedHash = (await import("node:crypto")).createHash("sha256").update("changed\n").digest("hex");
    const changedFrame = freezeFrame("2026-q3", [], { includedBatchIds: [], ledgerHead: "ledger-a", occurrenceProjectionSha256: changedHash });
    await expect(publishFrozenFrameProjection(dir, changedFrame, changedOccurrence, signingKey)).rejects.toThrow(/conflicts|already sealed/);
    expect(await fs.readFile(frozenOccurrence, "utf8")).toBe(occurrenceBefore);
    expect(await fs.readFile(frozenFrame, "utf8")).toBe(frameBefore);
  });

  it("keeps a historical quarter verifiable after later batch segments are appended", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-history-"));
    dirs.push(dir);
    const q3 = manifest("q3");
    await sealSourceBatch(dir, q3, signingKey);
    const q3Occurrence = path.join(dir, "q3.ndjson");
    await fs.writeFile(q3Occurrence, '{"sourceOccurrenceId":"q3"}\n');
    const q3OccurrenceHash = (await import("node:crypto")).createHash("sha256").update(await fs.readFile(q3Occurrence)).digest("hex");
    const q3Frame = freezeFrame("2026-q3", [], { includedBatchIds: [q3.batchId], ledgerHead: await rebuildLedgerHead(dir, [q3.batchId]), occurrenceProjectionSha256: q3OccurrenceHash });
    await publishFrozenFrameProjection(dir, q3Frame, q3Occurrence, signingKey);

    const q4 = { ...manifest("q4"), batchId: "2026-q4-de-01" as const, periodAdded: "2026-q4" as const };
    await sealSourceBatch(dir, q4, signingKey);
    const q4Occurrence = path.join(dir, "q4.ndjson");
    await fs.writeFile(q4Occurrence, '{"sourceOccurrenceId":"q4"}\n');
    const q4OccurrenceHash = (await import("node:crypto")).createHash("sha256").update(await fs.readFile(q4Occurrence)).digest("hex");
    const q4BatchIds = [q3.batchId, q4.batchId];
    const q4Frame = freezeFrame("2026-q4", [], { includedBatchIds: q4BatchIds, ledgerHead: await rebuildLedgerHead(dir, q4BatchIds), occurrenceProjectionSha256: q4OccurrenceHash });
    await publishFrozenFrameProjection(dir, q4Frame, q4Occurrence, signingKey);
    const keys = new Map([[signingKey.signingKeyId, signingKey]]);
    await expect(verifySourceClosure(dir, "2026-q3", keys)).resolves.toMatchObject({ frame: q3Frame });
    await expect(verifySourceClosure(dir, "2026-q4", keys)).resolves.toMatchObject({ frame: q4Frame });
  });

  it("recovers frame publication after crashes between its immutable commits", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-frame-crash-"));
    dirs.push(dir);
    const occurrence = path.join(dir, "occurrences.ndjson");
    await fs.writeFile(occurrence, "one\n");
    const occurrenceHash = (await import("node:crypto")).createHash("sha256").update("one\n").digest("hex");
    const frame = freezeFrame("2026-q3", [], { includedBatchIds: [], ledgerHead: await rebuildLedgerHead(dir, []), occurrenceProjectionSha256: occurrenceHash });
    await sealFrameManifest(dir, frame, signingKey);
    await publishFrozenFrameProjection(dir, frame, occurrence, signingKey);
    await expect(fs.readFile(path.join(dir, "projections", "frame-2026-q3.json"), "utf8")).resolves.toContain(frame.frameSha256);

    const secondDir = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-frame-crash-"));
    dirs.push(secondDir);
    await fs.mkdir(path.join(secondDir, "projections"), { recursive: true });
    await fs.writeFile(path.join(secondDir, "projections", "source-occurrences-2026-q3.ndjson"), "one\n");
    await sealFrameManifest(secondDir, frame, signingKey);
    await publishFrozenFrameProjection(secondDir, frame, occurrence, signingKey);
    await expect(fs.readFile(path.join(secondDir, "projections", "frame-2026-q3.json"), "utf8")).resolves.toContain(frame.frameSha256);
  });

  it("rejects source bytes changed after preflight instead of retaining them", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-copy-closure-"));
    dirs.push(dir);
    const source = path.join(dir, "source.csv");
    const destination = path.join(dir, "capsule", "source.csv");
    await fs.writeFile(source, "verified\n");
    const expected = (await import("node:crypto")).createHash("sha256").update("verified\n").digest("hex");
    await fs.writeFile(source, "changed-after-preflight\n");
    await expect(copyVerifiedArtifact(source, destination, expected)).rejects.toThrow(/closure hash mismatch/);
    await expect(fs.access(destination)).rejects.toThrow();
  });
});
