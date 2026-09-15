/*
<MODULE_CONTRACT>
  <purpose>Audit every retained source file offline using the harvest parser and acceptance contract.</purpose>
  <non-goals><item>Does not access databases, establish Q2 novelty or authorize quarterly admission.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Q3 audit: retain per-file outcomes and verify the complete input closure twice.</item></CHANGE_SUMMARY>
*/
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { assertCanonicalFilePath, inspectRetainedFile } from "@warpgogol/pipeline-node";
import { decodeSourceBytes, MAX_SOURCE_FILE_BYTES } from "./gogols/parse-sources-report.js";
import {
  classifySeedWebsite,
  isSupportedSourceExtension,
  parseSourceDocument,
} from "./parsers/source-document.js";

export interface SourceFileOutcome {
  path: string;
  sha256: string;
  bytes: number;
  disposition: "parsed" | "ignored" | "unrecognized" | "unsupported-extension" | "error";
  parserId: string | null;
  parserKind: string | null;
  reasons: string[];
  occurrences: Array<{
    key: string;
    seedSha256: string;
    role: string | null;
    domain: string | null;
    reason: string | null;
  }>;
}

async function* files(root: string, depth = 0): AsyncGenerator<string> {
  if (depth > 64) throw new Error("SOURCE_DEPTH_LIMIT");
  await assertCanonicalFilePath(root);
  const entries = await fs.readdir(root, { withFileTypes: true });
  if (entries.length > 100_000) throw new Error("SOURCE_DIRECTORY_LIMIT");
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) yield* files(file, depth + 1);
    else if (entry.isFile()) yield file;
    else throw new Error("SOURCE_SPECIAL_FILE");
  }
}

// Caller must exclude concurrent writers and keep ancestor directories stable.
// Two complete byte walks detect drift; they are not a filesystem snapshot or admission.
export async function* auditSourceBatch(
  batchRoot: string,
): AsyncGenerator<SourceFileOutcome, { files: number; sourceSha256: string }> {
  const closure = createHash("sha256");
  let count = 0;
  for await (const file of files(batchRoot)) {
    if (++count > 1_000_000) throw new Error("SOURCE_FILE_COUNT_LIMIT");
    const logicalPath = path.relative(batchRoot, file).split(path.sep).join("/");
    const ext = path.extname(file).toLowerCase();
    const chunks: Buffer[] = [];
    let size = 0;
    const digest = await inspectRetainedFile(file, (chunk) => {
      size += chunk.length;
      if (isSupportedSourceExtension(ext) && size <= MAX_SOURCE_FILE_BYTES)
        chunks.push(Buffer.from(chunk));
    });
    closure.update(JSON.stringify([logicalPath, digest.sha256, digest.bytes]));
    const outcome: SourceFileOutcome = {
      path: logicalPath,
      ...digest,
      disposition: "unsupported-extension",
      parserId: null,
      parserKind: null,
      reasons: ["unsupported-extension"],
      occurrences: [],
    };
    if (isSupportedSourceExtension(ext)) {
      try {
        if (size > MAX_SOURCE_FILE_BYTES) throw new Error("SOURCE_FILE_TOO_LARGE");
        const document = parseSourceDocument(
          logicalPath,
          decodeSourceBytes(Buffer.concat(chunks), ext),
        );
        outcome.disposition = document.disposition;
        outcome.parserId = document.parserId;
        outcome.parserKind = document.result.parserKind;
        outcome.reasons = document.result.warnings;
        outcome.occurrences = document.result.items.map((item) => ({
          key: item.sourceItemKey,
          seedSha256: createHash("sha256").update(JSON.stringify(item)).digest("hex"),
          role: typeof item.raw.sourceRole === "string" ? item.raw.sourceRole : null,
          ...classifySeedWebsite(item.websiteUrl),
        }));
      } catch (error) {
        outcome.disposition = "error";
        outcome.reasons = [String(error instanceof Error ? error.message : error).slice(0, 512)];
      }
    }
    yield outcome;
  }
  const first = closure.digest("hex");
  const verified = createHash("sha256");
  let verifiedCount = 0;
  for await (const file of files(batchRoot)) {
    if (++verifiedCount > 1_000_000) throw new Error("SOURCE_FILE_COUNT_LIMIT");
    const digest = await inspectRetainedFile(file);
    verified.update(
      JSON.stringify([
        path.relative(batchRoot, file).split(path.sep).join("/"),
        digest.sha256,
        digest.bytes,
      ]),
    );
  }
  if (verifiedCount !== count || verified.digest("hex") !== first)
    throw new Error("SOURCE_BATCH_CHANGED");
  return { files: count, sourceSha256: first };
}
