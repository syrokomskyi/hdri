/*
<MODULE_CONTRACT><purpose>Persist exclusive offline source audit evidence with reconciled file and domain counts.</purpose>
<non-goals><item>Does not write production artifacts, infer historical novelty or qualify operation.</item></non-goals></MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Reconcile parser outcomes with payload classifications and untrusted mirror date hints, never acquisition authority.</item></CHANGE_SUMMARY>
*/
import fs from "node:fs/promises";
import path from "node:path";
import {
  assertDisjointPaths,
  assertFreshDirectory,
  inspectRetainedFile,
  syncDirectory,
  writeExclusiveFile,
} from "@warpgogol/pipeline-node";
import { auditSourceBatch } from "./source-audit.js";

export async function writeSourceAudit(
  batchRoot: string,
  reportDir: string,
  progress: (files: number) => void = () => {},
) {
  assertDisjointPaths([batchRoot, reportDir]);
  await assertFreshDirectory(reportDir);
  await fs.mkdir(reportDir, { mode: 0o700 });
  await syncDirectory(path.dirname(reportDir));
  const outputPath = path.join(reportDir, "files.ndjson");
  const handle = await fs.open(outputPath, "wx", 0o600);
  const dispositions: Record<string, number> = {};
  const kinds: Record<string, number> = {};
  const documentKinds: Record<string, number> = {};
  const mirrorDateHints: Record<string, number> = {};
  const excluded: Record<string, number> = { no_url: 0, bad_url: 0, stop_domain: 0 };
  const domains = new Set<string>();
  let files = 0,
    occurrences = 0,
    accepted = 0,
    duplicates = 0;
  const iterator = auditSourceBatch(batchRoot);
  let closure: { files: number; sourceSha256: string } | undefined;
  try {
    for (;;) {
      const next = await iterator.next();
      if (next.done) {
        closure = next.value;
        break;
      }
      const row = next.value;
      await handle.writeFile(`${JSON.stringify(row)}\n`);
      files++;
      dispositions[row.disposition] = (dispositions[row.disposition] ?? 0) + 1;
      const kind = row.parserKind ?? "none";
      kinds[kind] = (kinds[kind] ?? 0) + 1;
      const documentKind = row.inspection?.kind ?? "inspection-error";
      documentKinds[documentKind] = (documentKinds[documentKind] ?? 0) + 1;
      const dates = (row.inspection?.mirrorTimestampHints ?? [])
        .map((hint) => hint.match(/\b[0-9]{1,2} [A-Za-z]{3} [0-9]{4}\b/)?.[0])
        .filter((date): date is string => date !== undefined);
      for (const date of new Set(dates)) mirrorDateHints[date] = (mirrorDateHints[date] ?? 0) + 1;
      for (const occurrence of row.occurrences) {
        occurrences++;
        if (occurrence.reason) excluded[occurrence.reason] = (excluded[occurrence.reason] ?? 0) + 1;
        else if (occurrence.domain) {
          accepted++;
          if (domains.has(occurrence.domain)) duplicates++;
          domains.add(occurrence.domain);
          if (domains.size > 1_000_000) throw new Error("AUDIT_DOMAIN_LIMIT");
        } else throw new Error("INVALID_AUDIT_OCCURRENCE");
      }
      if (files % 1000 === 0) progress(files);
    }
  } finally {
    try {
      await iterator.return(closure!);
    } finally {
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    }
  }
  if (
    !closure ||
    files !== closure.files ||
    occurrences !== accepted + Object.values(excluded).reduce((a, b) => a + b, 0) ||
    accepted !== domains.size + duplicates
  )
    throw new Error("AUDIT_ACCOUNTING_MISMATCH");
  const summary = {
    schema: "hdri-source-audit@1",
    batchRoot,
    scanCompleted: true,
    operationallyQualified: false,
    sourceSha256: closure.sourceSha256,
    evidence: await inspectRetainedFile(outputPath),
    status:
      dispositions.error || dispositions.unrecognized || dispositions["unsupported-extension"]
        ? "needs-review"
        : "parsed",
    files,
    dispositions,
    kinds,
    documentKinds,
    mirrorDateHints,
    occurrences,
    excluded,
    acceptedOccurrences: accepted,
    uniqueDomains: domains.size,
    duplicateOccurrences: duplicates,
    newDomains: null,
    baseline: null,
  };
  await writeExclusiveFile(
    path.join(reportDir, "summary.json"),
    Buffer.from(`${JSON.stringify(summary, null, 2)}\n`),
  );
  await syncDirectory(reportDir);
  return summary;
}
