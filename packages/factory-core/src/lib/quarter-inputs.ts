/*
<MODULE_CONTRACT>
<purpose>Validates quarter-scoped upstream database paths and stable asset target identity before Factory stages consume evidence or contact sites.</purpose>
<non-goals>
  <item>Does not open databases or inspect their schemas.</item>
  <item>Does not silently deduplicate conflicting work targets.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Add forward-only guards for verified quarterly database paths and one-to-one domain/provisional-asset target identity.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: a Factory consumer must read the exact period-scoped database path selected by the upstream evidence contract

import path from "node:path";
import { PipelinePauseError } from "@warpgogol/pipeline-core";
import { getUpstreamOutputRoot } from "./factory-utils.js";

export type QuarterScopedUpstreamDbInput = {
  configuredPath: string;
  appRootDir: string;
  factoryRootDir: string;
  upstreamAppId: string;
  deviceId: string;
  dbPrefix: string;
  period: string;
};

export type AssetIdentityTarget = {
  domain: string;
  provisionalAssetId: string;
};

/**
 * Resolve a configured upstream DB path and fence it to the single path that
 * the period, upstream app, and device are allowed to produce and verify.
 */
export const resolveQuarterScopedUpstreamDbPath = (
  input: QuarterScopedUpstreamDbInput,
): string => {
  const configuredPath = path.resolve(input.appRootDir, input.configuredPath);
  const expectedPath = path.join(
    getUpstreamOutputRoot(input.factoryRootDir, input.upstreamAppId),
    input.deviceId,
    "data",
    "db",
    `${input.dbPrefix}-${input.period}.db`,
  );

  if (path.normalize(configuredPath) !== path.normalize(expectedPath)) {
    throw new PipelinePauseError(
      [
        "Pipeline paused.",
        `Configured ${input.dbPrefix} DB does not match the verified quarterly artifact.`,
        `Configured: ${configuredPath}`,
        `Expected:   ${expectedPath}`,
        `Update the app brief to use ${input.dbPrefix}-${input.period}.db.`,
      ].join("\n"),
    );
  }

  return expectedPath;
};

/** Reject duplicate or conflicting identity targets instead of choosing a row. */
export const assertUniqueAssetTargets = (
  targets: readonly AssetIdentityTarget[],
  stageId: string,
): void => {
  const assetToDomain = new Map<string, string>();
  const domainToAsset = new Map<string, string>();

  for (const target of targets) {
    const assetDomain = assetToDomain.get(target.provisionalAssetId);
    const domainAsset = domainToAsset.get(target.domain);
    if (assetDomain !== undefined || domainAsset !== undefined) {
      throw new PipelinePauseError(
        [
          "Pipeline paused.",
          `[${stageId}] duplicate or conflicting asset target detected.`,
          `Domain: ${target.domain}`,
          `Provisional asset ID: ${target.provisionalAssetId}`,
          assetDomain !== undefined
            ? `Asset ID was already assigned to domain: ${assetDomain}`
            : `Domain was already assigned to asset ID: ${domainAsset}`,
          "Repair the registry or upstream quarterly evidence; targets were not silently deduplicated.",
        ].join("\n"),
      );
    }
    assetToDomain.set(target.provisionalAssetId, target.domain);
    domainToAsset.set(target.domain, target.provisionalAssetId);
  }
};
