/*
<MODULE_CONTRACT>
<purpose>Shared utilities for signing and verification artifact emission.</purpose>
<keywords>sign, verify, signature, manifest, reporter</keywords>
<responsibilities>
  <item>Render key-value markdown tables for summary artifacts.</item>
  <item>Write source-signature.json and summary artifacts for signing operations.</item>
  <item>Write verification summary artifacts for upstream verification.</item>
  <item>Find manifest files in device output directories.</item>
</responsibilities>
<non-goals>
  <item>Do not perform actual signing or cryptographic verification (handled by @org/observatory-crypto).</item>
  <item>Do not manage database connections or business logic.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="renderKeyValueMd">Renders a key-value table as Markdown.</entry>
  <entry key="SignSourceReporter">Encapsulates writing of signing artifacts.</entry>
  <entry key="VerificationReporter">Encapsulates writing of verification artifacts.</entry>
  <entry key="ManifestFinder">Finds source-signature.json in device output directories.</entry>
  <entry key="SignSummary">Type for sign-source summary data.</entry>
  <entry key="VerificationEntry">Type for upstream verification entry.</entry>
  <entry key="VerificationSummary">Type for verification summary data.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial extraction from apps/hdri-factory SignSourceGogol and VerifyUpstreamGogol.</item>
</CHANGE_SUMMARY>
*/

import path from 'node:path';
import fsp from 'node:fs/promises';
import { markdownTable } from 'markdown-table';
import { writeJsonFile, writeTextFile } from '@org/pipeline-node';
import type { SourceSignatureManifest } from '@org/observatory-crypto';

/** Renders a key-value table as Markdown for summary artifacts. */
export function renderKeyValueMd(title: string, values: Array<[string, string]>): string {
  return [`# ${title}`, ``, markdownTable([['Metric', 'Value'], ...values], { align: ['l', 'l'] })].join('\n');
}

/** Summary data for a signing operation. */
export type SignSummary = {
  appId: string;
  appVersion: string;
  deviceId: string;
  sourceToken: string;
  dbPath: string;
  contentHash: string;
  signingKeyId: string;
  completedAt: string;
  rowsSigned?: number;
};

/** Helper class to write signing artifacts consistently. */
export class SignSourceReporter {
  private readonly outputDir: string;
  private readonly toRelativePath: (p: string) => string;

  constructor(outputDir: string, toRelativePath: (p: string) => string) {
    this.outputDir = outputDir;
    this.toRelativePath = toRelativePath;
  }

  /** Writes source-signature.json manifest. */
  async writeManifest(manifest: SourceSignatureManifest): Promise<void> {
    await writeJsonFile(path.join(this.outputDir, 'source-signature.json'), manifest);
  }

  /** Writes sign-source-summary.json with the provided data. */
  async writeSummary(summary: SignSummary): Promise<void> {
    await writeJsonFile(path.join(this.outputDir, 'sign-source-summary.json'), {
      ...summary,
      dbPath: this.toRelativePath(summary.dbPath),
    });
  }

  /** Writes sign-source-summary.md markdown report. */
  async writeSummaryMd(summary: SignSummary, extraRows: Array<[string, string]> = []): Promise<void> {
    const manifestPath = path.join(this.outputDir, 'source-signature.json');

    const rows: Array<[string, string]> = [
      ['Content hash', `\`${summary.contentHash}\``],
      ['Signing key ID', `\`${summary.signingKeyId}\``],
      ['Signature manifest', this.toRelativePath(manifestPath)],
      ...extraRows,
    ];

    if (summary.rowsSigned !== undefined) {
      rows.unshift(['Rows signed', String(summary.rowsSigned)]);
    }

    const md = renderKeyValueMd('Sign source', rows);
    await writeTextFile(path.join(this.outputDir, 'sign-source-summary.md'), md);
  }
}

/** Entry in verification results for a single upstream device. */
export type VerificationEntry = {
  deviceId: string;
  dbPath: string;
  manifestPath: string;
  ok: boolean;
  reason?: string;
  contentHash: string;
  computedHash?: string;
};

/** Summary data for upstream verification. */
export type VerificationSummary = {
  appId: string;
  appVersion: string;
  deviceId: string;
  sourceToken: string;
  year: number;
  upstreamRoot: string;
  transparencyDir: string;
  allOk: boolean;
  entries: VerificationEntry[];
  completedAt: string;
};

/** Helper class to write verification artifacts consistently. */
export class VerificationReporter {
  private readonly outputDir: string;
  private readonly toRelativePath: (p: string) => string;

  constructor(outputDir: string, toRelativePath: (p: string) => string) {
    this.outputDir = outputDir;
    this.toRelativePath = toRelativePath;
  }

  /** Writes verify-upstream-summary.json with normalized paths. */
  async writeSummary(summary: VerificationSummary): Promise<void> {
    await writeJsonFile(path.join(this.outputDir, 'verify-upstream-summary.json'), {
      appId: summary.appId,
      appVersion: summary.appVersion,
      deviceId: summary.deviceId,
      sourceToken: summary.sourceToken,
      year: summary.year,
      upstreamHarvestOutputRoot: this.toRelativePath(summary.upstreamRoot),
      transparencyDir: this.toRelativePath(summary.transparencyDir),
      allOk: summary.allOk,
      entries: summary.entries.map((e) => ({
        ...e,
        dbPath: this.toRelativePath(e.dbPath),
        manifestPath: e.manifestPath ? this.toRelativePath(e.manifestPath) : '',
      })),
      completedAt: summary.completedAt,
    });
  }

  /** Writes verify-upstream-summary.md markdown report. */
  async writeSummaryMd(summary: VerificationSummary): Promise<void> {

    const mdRows = summary.entries.map((e) => [
      e.deviceId,
      e.ok ? '✓' : '✗',
      e.reason ?? '',
      e.contentHash ? `\`${e.contentHash}\`` : '',
    ]);

    const md = [
      `# Verify upstream signatures`,
      ``,
      `**Result:** ${summary.allOk ? 'PASS ✓' : 'FAIL ✗'}`,
      ``,
      markdownTable([['Device', 'OK', 'Reason', 'Content hash'], ...mdRows], { align: ['l', 'c', 'l', 'l'] }),
    ].join('\n');

    await writeTextFile(path.join(this.outputDir, 'verify-upstream-summary.md'), md);
  }
}

/** Options for finding manifests. */
export type FindManifestOptions = {
  expectedAppId: string;
  filename?: string;
};

/**
 * Finds a manifest file (default: source-signature.json) in deviceOutputDir
 * written by expectedAppId. Scans all step subdirectories and checks
 * manifest.app_id instead of relying on a directory name convention.
 */
export async function findManifestPath(
  deviceOutputDir: string,
  options: FindManifestOptions,
): Promise<string | undefined> {
  const { expectedAppId, filename = 'source-signature.json' } = options;

  try {
    const entries = await fsp.readdir(deviceOutputDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const candidate = path.join(deviceOutputDir, e.name, filename);
      try {
        const raw = await fsp.readFile(candidate, 'utf-8');
        const m = JSON.parse(raw) as Partial<SourceSignatureManifest>;
        if (m.app_id === expectedAppId) {
          return candidate;
        }
      } catch {
        // not a readable manifest — skip
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}
