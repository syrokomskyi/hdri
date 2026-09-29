/*
<MODULE_CONTRACT>
<purpose>Validate an explicit local-plus-R2 release configuration against retained operator policy bytes.</purpose>
<non-goals><item>Does not authenticate operator authority, verify stored data or replace publication admission.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Bind the new custody mode to exact policy bytes and quarter scope instead of lowering historical replica requirements.</item></CHANGE_SUMMARY>
*/
import { createHash } from "node:crypto";
import path from "node:path";
import { parse } from "yaml";
import { assertHdriR2Object } from "./r2-transport";

export type LocalR2Config = Readonly<{
  schema: "hdri-local-r2-config@1";
  period: string;
  localArchiveRoot: string;
  rcloneBinary: string;
  remotePrefix: string;
  policyPath: string;
  policySha256: string;
}>;

export function validateLocalR2Config(input: unknown, policyBytes: Buffer, period: string): LocalR2Config {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("LOCAL_R2_CONFIG_INVALID");
  const value = input as Record<string, unknown>;
  const fields = ["schema", "period", "localArchiveRoot", "rcloneBinary", "remotePrefix", "policyPath", "policySha256"];
  if (Object.keys(value).length !== fields.length || fields.some(key => typeof value[key] !== "string" || !value[key]) ||
    value.schema !== "hdri-local-r2-config@1" || value.period !== period || !/^\d{4}-q[1-4]$/.test(period))
    throw new Error("LOCAL_R2_CONFIG_INVALID");
  const config = value as unknown as LocalR2Config;
  if (![config.localArchiveRoot, config.rcloneBinary, config.policyPath].every(item => path.isAbsolute(item)))
    throw new Error("LOCAL_R2_EXPLICIT_PATHS_REQUIRED");
  if (createHash("sha256").update(policyBytes).digest("hex") !== config.policySha256)
    throw new Error("LOCAL_R2_POLICY_DIGEST_MISMATCH");
  assertHdriR2Object(`${config.remotePrefix}/probe`);
  const policy = parse(policyBytes.toString("utf8"));
  if (!policy || policy.schema !== "hdri-preservation-intent@1" || policy.period !== period ||
    policy.authority !== "explicit-operator-instruction" || policy.secondOffsiteRequired !== false ||
    !Array.isArray(policy.requiredCopies) || policy.requiredCopies.length !== 2 ||
    policy.requiredCopies.filter((copy: { role?: string; medium?: string }) =>
      copy?.role === "local" && copy.medium === "persistent-workstation-storage").length !== 1 ||
    policy.requiredCopies.filter((copy: { role?: string; provider?: string; bucket?: string }) =>
      copy?.role === "remote" && copy.provider === "cloudflare-r2" && copy.bucket === "hdri-preservation").length !== 1 ||
    !Array.isArray(policy.requiredEvidence) ||
    ["complete-release-closure", "local-content-verification", "full-remote-readback-verification", "recovery-and-reconstruction"]
      .some(requirement => !policy.requiredEvidence.includes(requirement)))
    throw new Error("LOCAL_R2_POLICY_SCOPE_MISMATCH");
  return Object.freeze({ ...config });
}
