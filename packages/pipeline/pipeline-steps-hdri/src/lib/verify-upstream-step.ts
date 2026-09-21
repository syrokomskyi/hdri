/*
<MODULE_CONTRACT>
<purpose>Abstract step that verifies upstream closed snapshot-generation signatures before consumption.</purpose>
<non-goals>
  <item>Do not modify upstream DB files.</item>
  <item>Do not mint new asset IDs.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation — extracted from 5 duplicated VerifyUpstreamGogol copies across factory apps 1–5.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: signature is detached ed25519 over SHA-256 of the target data; never reuse or expose the private key

/**
 * VerifyUpstreamStep — abstract step that verifies ed25519 signatures on
 * every upstream device's source DB before ingestion.
 *
 * Each factory app (1-register-businesses through 5-audit-axe) had a
 * VerifyUpstreamGogol copy that differed only in: expected upstream appId,
 * DB filename pattern(s), upstream output root, and guide metadata.
 * This base class owns the entire verification loop; subclasses provide
 * the app-specific config via abstract methods.
 *
 * Usage:
 *   class VerifyUpstreamGogol extends VerifyUpstreamStep<PipelineContext> {
 *     override readonly id = "verify-upstream";
 *     override readonly guide = { ... };
 *     protected override getAppId() { return "1-register-businesses"; }
 *     protected override getExpectedUpstreamAppId() { return "0-harvest-source"; }
 *     protected override getUpstreamRoot(ctx) { return ctx.state.upstreamHarvestOutputRoot; }
 *     protected override getDbFilenames(ctx) { return [`core_${ctx.state.year}.db`]; }
 *     protected override getYear(ctx) { return ctx.state.year; }
 *     protected override getDeviceId(ctx) { return ctx.state.deviceId; }
 *     protected override getSourceToken(ctx) { return ctx.state.sourceToken; }
 *     protected override toRelativePath(p) { return toFactoryRelativePath(p); }
 *   }
 */

import fsp from "node:fs/promises";
import path from "node:path";
import {
  getTransparencyKeysDir,
  listDeviceFolders,
  loadVerificationKeys,
  parseSourceSignatureManifest,
  verifyUpstreamManifest,
} from "@syrokomskyi/observatory-crypto";
import { hashDatabaseFile } from "@syrokomskyi/business-core/cross-db";
import {
  VerificationReporter,
  findManifestPath,
  type VerificationEntry,
  type VerificationSummary,
} from "./signature-reporters.js";
import { SignatureStep, type SignatureStepContext } from "./signature-step-base.js";

export type { SignatureStepContext as VerifyUpstreamStepContext } from "./signature-step-base.js";

export abstract class VerifyUpstreamStep<
  TContext extends SignatureStepContext = SignatureStepContext,
> extends SignatureStep<TContext> {
  /** The upstream app ID to look for in manifests, e.g. "0-harvest-source". */
  protected abstract getExpectedUpstreamAppId(): string;

  /** Root directory of the upstream app's .output/ (parent of all device folders). */
  protected abstract getUpstreamRoot(ctx: TContext): string;

  /** Year for the verification summary. */
  protected abstract getYear(ctx: TContext): number;

  /** This device's ID for the summary. */
  protected abstract getDeviceId(ctx: TContext): string;

  /** Source token for the summary. */
  protected abstract getSourceToken(ctx: TContext): string;

  /** Convert an absolute path to a relative one for artifact output. */
  protected abstract override toRelativePath(p: string): string;

  /** App version string. Default: "0.1.0". */
  protected override getAppVersion(): string {
    return "0.1.0";
  }

  /** The verification workflow — final, subclasses do not override. */
  override async run(ctx: TContext): Promise<void> {
    const appId = this.getAppId();
    const appVersion = this.getAppVersion();
    const expectedUpstreamAppId = this.getExpectedUpstreamAppId();
    const upstreamRoot = this.getUpstreamRoot(ctx);
    const year = this.getYear(ctx);
    const deviceId = this.getDeviceId(ctx);
    const sourceToken = this.getSourceToken(ctx);

    const transparencyDir = getTransparencyKeysDir();
    const keyMap = await loadVerificationKeys(transparencyDir);
    console.log(`[${this.id}] Loaded ${keyMap.size} verification key(s) from ${transparencyDir}`);

    const devices = await listDeviceFolders(upstreamRoot);
    const entries: VerificationEntry[] = [];
    let allOk = true;

    for (const dev of devices) {
      const manifestPath = await findManifestPath(dev.path, {
        expectedAppId: expectedUpstreamAppId,
      });
      if (!manifestPath) {
        allOk = false;
        entries.push({
          deviceId: dev.deviceId,
          dbPath: "",
          manifestPath: "",
          ok: false,
          reason: "Missing source-signature.json",
          contentHash: "",
        });
        continue;
      }
      try {
        const manifest = parseSourceSignatureManifest(await fsp.readFile(manifestPath, "utf8"));
        const dbPath = path.resolve(path.dirname(manifestPath), manifest.snapshot.uri);
        const key = keyMap.get(manifest.signing_key_id);
        if (
          manifest.app_id !== expectedUpstreamAppId ||
          manifest.source_token !== sourceToken ||
          manifest.device_id !== dev.deviceId ||
          key?.collectorId !== dev.deviceId
        )
          throw new Error("SOURCE_SIGNATURE_SCOPE_MISMATCH");
        const verifyResult = verifyUpstreamManifest(manifest, keyMap);
        if (!verifyResult.ok) throw new Error(verifyResult.reason);
        const stat = await fsp.lstat(dbPath);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== manifest.snapshot.bytes)
          throw new Error("SOURCE_SNAPSHOT_FILE_MISMATCH");
        const computedHash = await hashDatabaseFile(dbPath);
        if (computedHash !== manifest.snapshot.sha256)
          throw new Error("SOURCE_SNAPSHOT_HASH_MISMATCH");
        entries.push({
          deviceId: dev.deviceId,
          dbPath,
          manifestPath,
          ok: true,
          contentHash: manifest.snapshot.sha256,
          computedHash,
        });
      } catch (error) {
        allOk = false;
        entries.push({
          deviceId: dev.deviceId,
          dbPath: "",
          manifestPath,
          ok: false,
          reason: error instanceof Error ? error.message : "SOURCE_SIGNATURE_VERIFICATION_FAILED",
          contentHash: "",
        });
      }
    }
    if (!entries.length) allOk = false;

    const outputDir = ctx.getGogolOutputDir(this.id);
    await fsp.mkdir(outputDir, { recursive: true });

    const reporter = new VerificationReporter(outputDir, (p) => this.toRelativePath(p));
    const nowIso = new Date().toISOString();

    const summary: VerificationSummary = {
      appId,
      appVersion,
      deviceId,
      sourceToken,
      year,
      upstreamRoot,
      transparencyDir,
      allOk,
      entries,
      completedAt: nowIso,
    };

    await reporter.writeSummary(summary);
    await reporter.writeSummaryMd(summary);

    if (!allOk) {
      const failed = entries.filter((e) => !e.ok);
      throw new Error(
        `Upstream verification failed for ${failed.length} device(s): ` +
          failed.map((f) => `${f.deviceId} (${f.reason})`).join("; "),
      );
    }

    console.log(`[${this.id}] All ${entries.length} upstream signature(s) verified.`);
  }
}
