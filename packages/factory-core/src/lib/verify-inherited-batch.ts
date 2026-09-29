/*
<MODULE_CONTRACT>
<purpose>Proves that existing catalog seed rows for a prior-quarter source batch correspond exactly to the sealed occurrence projection, so the batch can be inherited without reopening raw inputs or resealing its segment.</purpose>
<non-goals>
  <item>Does not parse raw source files or mutate any database.</item>
  <item>Does not select or approve predecessors — callers bind prior capsules through discovery.</item>
  <item>Does not import or fabricate rows; it only verifies supplied seed rows against sealed evidence.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation: sealed-closure re-verification plus exact occurrence/seed correspondence for inherited batches.</item>
</CHANGE_SUMMARY>
*/

import { createReadStream } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { sourceOccurrenceId, type HdriPeriod, type SourceBatchId } from "./quarter-contracts.js";
import type { SourceOccurrence } from "./source-ledger.js";
import { verifySourceClosure, type VerificationKeySource } from "./source-ledger-store.js";

export type InheritedSeedRow = Readonly<{
  domain: string;
  /** Batch-scoped source path ("<batchId>/<relativePath>") as stored in site_source_seeds.source_path. */
  sourcePath: string;
  sourceItemKey: string;
}>;

export type InheritedBatchVerification = Readonly<{
  batchId: SourceBatchId;
  period: HdriPeriod;
  occurrenceCount: number;
  ledgerHead: string;
}>;

/**
 * Verifies an inherited prior batch against the sealed source closure:
 * the signed frame manifest, every included segment signature, the ledger
 * head and the occurrence projection hash are re-verified through
 * verifySourceClosure; then each supplied seed row is recomputed into its
 * deterministic occurrence identity and compared against the sealed
 * projection in both directions (no missing, no extra, no conflicting
 * domain or asset identity). Fails closed on any mismatch and never
 * writes, reseals or erases historical evidence.
 */
export const verifyInheritedSourceBatch = async (options: {
  ledgerDir: string;
  batchId: SourceBatchId;
  period: HdriPeriod;
  verificationKeys: VerificationKeySource;
  seeds: Iterable<InheritedSeedRow>;
  deriveAssetId: (domain: string) => string;
}): Promise<InheritedBatchVerification> => {
  const { ledgerDir, batchId, period, verificationKeys, seeds, deriveAssetId } = options;

  const { frame, manifests } = await verifySourceClosure(ledgerDir, period, verificationKeys);
  if (!frame.includedBatchIds.includes(batchId)) {
    throw new Error(`Inherited batch ${batchId} is not covered by sealed frame ${period}`);
  }
  const manifest = manifests.find((entry) => entry.batchId === batchId);
  if (!manifest) {
    throw new Error(`Sealed segment missing for inherited batch ${batchId}`);
  }

  const fileSha256 = new Map<string, string>();
  for (const file of manifest.files) {
    fileSha256.set(`${batchId}/${file.relativePath}`, file.sha256);
  }

  const expected = new Map<string, { assetId: string; domain: string }>();
  let expectedLines = 0;
  const occurrencePath = path.join(ledgerDir, "projections", `source-occurrences-${period}.ndjson`);
  const lines = readline.createInterface({
    input: createReadStream(occurrencePath),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (!line) continue;
    const occurrence = JSON.parse(line) as SourceOccurrence;
    if (occurrence.batchId !== batchId) continue;
    expectedLines += 1;
    expected.set(occurrence.sourceOccurrenceId, {
      assetId: occurrence.provisionalAssetId,
      domain: occurrence.normalisedDomain,
    });
  }
  if (expected.size === 0) {
    throw new Error(`Sealed projection ${occurrencePath} has no occurrences for batch ${batchId}`);
  }

  const seen = new Set<string>();
  let seedCount = 0;
  for (const seed of seeds) {
    seedCount += 1;
    const fileHash = fileSha256.get(seed.sourcePath);
    if (!fileHash) {
      throw new Error(
        `Inherited seed ${seed.sourcePath} is not covered by sealed segment ${batchId}`,
      );
    }
    const id = sourceOccurrenceId(manifest.batchHash, fileHash, seed.sourceItemKey);
    const occurrence = expected.get(id);
    if (!occurrence) {
      throw new Error(
        `Inherited seed ${seed.sourcePath}#${seed.sourceItemKey} has no sealed occurrence`,
      );
    }
    if (occurrence.domain !== seed.domain) {
      throw new Error(
        `Inherited seed ${seed.sourcePath}#${seed.sourceItemKey} domain mismatch: ${seed.domain} != ${occurrence.domain}`,
      );
    }
    if (occurrence.assetId !== deriveAssetId(seed.domain)) {
      throw new Error(
        `Inherited seed ${seed.sourcePath}#${seed.sourceItemKey} asset id mismatch for ${seed.domain}`,
      );
    }
    seen.add(id);
  }
  if (seen.size !== expected.size || seedCount !== expectedLines) {
    throw new Error(
      `Inherited batch ${batchId} correspondence mismatch: ${seedCount} seeds cover ${seen.size} of ${expected.size} sealed occurrences (${expectedLines} projection rows)`,
    );
  }

  return { batchId, period, occurrenceCount: expected.size, ledgerHead: frame.ledgerHead };
};
