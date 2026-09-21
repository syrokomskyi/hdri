/*
<MODULE_CONTRACT>
<purpose>Abstract step that closes a source SQLite generation into a standalone snapshot and signs its complete manifest.</purpose>
<non-goals>
  <item>Do not perform per-observation signing (handled by @syrokomskyi/observatory-crypto sign module).</item>
  <item>Do not modify the database after signing.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation — extracted from 6 duplicated SignSourceGogol copies across factory apps 0–5.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: downstream authority is the immutable standalone snapshot beside the manifest, never the mutable source DB path

/**
 * SignSourceStep — abstract step that closes a source DB generation with the
 * device signing key and writes the three signature artifacts:
 *   1. source-signature.json (ed25519 signature manifest)
 *   2. sign-source-summary.json
 *   3. sign-source-summary.md
 *
 * Each factory app (0-harvest-source through 5-audit-axe) had a
 * SignSourceGogol copy that differed only in appId, dbPath resolution,
 * and guide metadata. This base class owns the entire workflow; subclasses
 * provide the app-specific config via abstract methods.
 *
 * Usage:
 *   class SignSourceGogol extends SignSourceStep<PipelineContext> {
 *     override readonly id = "sign-source";
 *     override readonly guide = { ... };
 *     protected override getAppId() { return "0-harvest-source"; }
 *     protected override getDbPath(ctx) { return getCoreDbPath(year); }
 *     protected override getSourceToken(ctx) { return ctx.state.brief.sourceToken; }
 *     protected override toRelativePath(p) { return toFactoryRelativePath(p); }
 *   }
 */

import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import {
  loadSigningKeyFromEnv,
  signSource,
  type SigningKeyConfig,
  type SourceSignatureManifest,
} from "@syrokomskyi/observatory-crypto";
import { hashDatabaseFile } from "@syrokomskyi/business-core/cross-db";
import { SignSourceReporter, type SignSummary } from "./signature-reporters.js";
import { SignatureStep, type SignatureStepContext } from "./signature-step-base.js";

export type { SignatureStepContext as SignSourceStepContext } from "./signature-step-base.js";

export abstract class SignSourceStep<
  TContext extends SignatureStepContext = SignatureStepContext,
> extends SignatureStep<TContext> {
  /** Absolute path to the DB file to sign. */
  protected abstract getDbPath(ctx: TContext): string;

  /** Source token for this run. */
  protected abstract getSourceToken(ctx: TContext): string;

  /** Convert an absolute path to a relative one for artifact output. */
  protected abstract override toRelativePath(p: string): string;

  /** App version string. Default: "0.1.0". */
  protected override getAppVersion(): string {
    return "0.1.0";
  }

  /** Device ID for the summary. Default: signingKey.collectorId. */
  protected getDeviceId(_ctx: TContext, signingKey: SigningKeyConfig): string {
    return signingKey.collectorId;
  }

  /** Extra rows for the Markdown summary table. Default: none. */
  protected getExtraMdRows(_ctx: TContext, _dbPath: string): Array<[string, string]> {
    return [];
  }

  /** Hook called after signing completes. Default: no-op. */
  protected onSigned(_ctx: TContext, _summary: SignSummary): void {}

  /** Log message prefix, e.g. "core.db". When undefined, no console.log. */
  protected getLogLabel(): string | undefined {
    return undefined;
  }

  /** The signing workflow — final, subclasses do not override. */
  override async run(ctx: TContext): Promise<void> {
    const appId = this.getAppId();
    const appVersion = this.getAppVersion();
    const dbPath = this.getDbPath(ctx);
    const sourceToken = this.getSourceToken(ctx);

    const signingKey = loadSigningKeyFromEnv();
    const outputDir = ctx.getGogolOutputDir(this.id);
    const temporaryDir = await fsp.mkdtemp(
      path.join(path.dirname(outputDir), `.${path.basename(outputDir)}-`),
    );
    const snapshotPath = path.join(outputDir, "source-snapshot.sqlite");
    try {
      const temporaryPath = path.join(temporaryDir, `source-snapshot-${randomUUID()}.tmp`);
      const source = new Database(dbPath, { readonly: true, fileMustExist: true });
      try {
        await source.backup(temporaryPath);
      } finally {
        source.close();
      }
      const snapshot = new Database(temporaryPath, { fileMustExist: true });
      let domainCounts!: Array<{ domain: string; rows: number }>;
      try {
        snapshot.pragma("journal_mode=DELETE");
        if (snapshot.pragma("quick_check", { simple: true }) !== "ok")
          throw new Error("SOURCE_SNAPSHOT_INTEGRITY_FAILED");
        const domains = snapshot
          .prepare(
            "SELECT name FROM pragma_table_list WHERE schema='main' AND type='table' AND substr(name,1,7)<>'sqlite_' ORDER BY CAST(name AS BLOB)",
          )
          .pluck()
          .all() as string[];
        if (!domains.length || domains.length > 1024)
          throw new Error("SOURCE_SNAPSHOT_DOMAIN_COUNT_INVALID");
        domainCounts = domains.map((domain) => {
          const escaped = domain.replaceAll('"', '""');
          const rows = snapshot
            .prepare(`SELECT count(*) FROM "${escaped}"`)
            .pluck()
            .safeIntegers()
            .get();
          if (typeof rows !== "bigint" || rows < 0n || rows > BigInt(Number.MAX_SAFE_INTEGER))
            throw new Error("SOURCE_SNAPSHOT_ROW_COUNT_INVALID");
          return { domain, rows: Number(rows) };
        });
      } finally {
        snapshot.close();
      }
      const contentHash = await hashDatabaseFile(temporaryPath);
      const snapshotStat = await fsp.stat(temporaryPath);
      const manifest: SourceSignatureManifest = signSource({
        signingKey,
        sourceToken,
        appId,
        appVersion,
        snapshot: { uri: "source-snapshot.sqlite", sha256: contentHash, bytes: snapshotStat.size },
        domainCounts,
      });

      try {
        await fsp.lstat(snapshotPath);
        throw new Error("SOURCE_SNAPSHOT_ALREADY_EXISTS");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await fsp.mkdir(outputDir, { recursive: true });
      await fsp.link(temporaryPath, snapshotPath);

      const reporter = new SignSourceReporter(outputDir, (p) => this.toRelativePath(p));
      const summary: SignSummary = {
        appId,
        appVersion,
        deviceId: this.getDeviceId(ctx, signingKey),
        sourceToken,
        dbPath: snapshotPath,
        contentHash,
        signingKeyId: manifest.signing_key_id,
        completedAt: manifest.signed_at,
        rowsSigned: manifest.rows_signed,
      };

      await reporter.writeManifest(manifest);
      await reporter.writeSummary(summary);
      await reporter.writeSummaryMd(summary, this.getExtraMdRows(ctx, dbPath));

      this.onSigned(ctx, summary);

      const label = this.getLogLabel();
      if (label) {
        console.log(
          `[${this.id}] ${label} signed. hash=${contentHash} key=${manifest.signing_key_id}`,
        );
      }
    } finally {
      await fsp.rm(temporaryDir, { recursive: true, force: true });
    }
  }
}
