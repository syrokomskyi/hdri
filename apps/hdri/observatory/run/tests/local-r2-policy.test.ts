import { expect, test } from "vitest";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { validateLocalR2Config } from "../release/local-r2-policy";

const policy = await fs.readFile(new URL("../../.input/preservation-scope.yaml", import.meta.url));
const config = () => ({ schema: "hdri-local-r2-config@1", period: "2026-q3", localArchiveRoot: "/durable/archive",
  rcloneBinary: "/usr/local/bin/rclone", remotePrefix: "r2:hdri-preservation/releases", policyPath: "/retained/policy.yaml",
  policySha256: createHash("sha256").update(policy).digest("hex") });

test("operator local plus R2 decision retains all integrity and recovery requirements", () => {
  expect(validateLocalR2Config(config(), policy, "2026-q3")).toEqual(config());
});
test.each([{ period: "2026-q2" }, { schema: "other" }, { localArchiveRoot: "cache" },
  { remotePrefix: "r2:dater-evidence/releases" }, { policySha256: "0".repeat(64) }, { allowUnverified: true }])(
  "rejects scope, path, policy or override mismatch: %j", change => {
    expect(() => validateLocalR2Config({ ...config(), ...change }, policy, "2026-q3")).toThrow();
  },
);
test("matching digest cannot authorize removing the remote readback requirement", () => {
  const weakened = Buffer.from(policy.toString().replace("full-remote-readback-verification", "metadata-only"));
  expect(() => validateLocalR2Config({ ...config(), policySha256: createHash("sha256").update(weakened).digest("hex") }, weakened, "2026-q3"))
    .toThrow("POLICY_SCOPE_MISMATCH");
});
