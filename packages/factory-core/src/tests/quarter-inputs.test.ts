import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertUniqueAssetTargets,
  resolveQuarterScopedUpstreamDbPath,
} from "../lib/quarter-inputs.js";

const factoryRootDir = path.resolve("/workspace/apps/hdri/factory");
const appRootDir = path.join(factoryRootDir, "3-extract-profile");

describe("resolveQuarterScopedUpstreamDbPath", () => {
  it("returns the exact verified Q3 liveness path", () => {
    const configuredPath =
      "../2-check-liveness/.output/device-a/data/db/liveness-2026-q3.db";
    expect(
      resolveQuarterScopedUpstreamDbPath({
        configuredPath,
        appRootDir,
        factoryRootDir,
        upstreamAppId: "2-check-liveness",
        deviceId: "device-a",
        dbPrefix: "liveness",
        period: "2026-q3",
      }),
    ).toBe(
      path.join(
        factoryRootDir,
        "2-check-liveness/.output/device-a/data/db/liveness-2026-q3.db",
      ),
    );
  });

  it("rejects the legacy annual liveness filename", () => {
    expect(() =>
      resolveQuarterScopedUpstreamDbPath({
        configuredPath: "../2-check-liveness/.output/device-a/data/db/liveness_2026.db",
        appRootDir,
        factoryRootDir,
        upstreamAppId: "2-check-liveness",
        deviceId: "device-a",
        dbPrefix: "liveness",
        period: "2026-q3",
      }),
    ).toThrow(/liveness-2026-q3\.db/);
  });

  it("rejects a same-named DB outside the verified upstream output", () => {
    expect(() =>
      resolveQuarterScopedUpstreamDbPath({
        configuredPath: "/tmp/liveness-2026-q3.db",
        appRootDir,
        factoryRootDir,
        upstreamAppId: "2-check-liveness",
        deviceId: "device-a",
        dbPrefix: "liveness",
        period: "2026-q3",
      }),
    ).toThrow(/does not match the verified quarterly artifact/);
  });
});

describe("assertUniqueAssetTargets", () => {
  it("accepts a one-to-one domain and provisional asset set", () => {
    expect(() =>
      assertUniqueAssetTargets(
        [
          { domain: "a.de", provisionalAssetId: "da-a" },
          { domain: "b.de", provisionalAssetId: "da-b" },
        ],
        "liveness",
      ),
    ).not.toThrow();
  });

  it("rejects an exact duplicate target", () => {
    expect(() =>
      assertUniqueAssetTargets(
        [
          { domain: "a.de", provisionalAssetId: "da-a" },
          { domain: "a.de", provisionalAssetId: "da-a" },
        ],
        "liveness",
      ),
    ).toThrow(/duplicate or conflicting asset target/);
  });

  it("rejects one domain mapped to two provisional asset IDs", () => {
    expect(() =>
      assertUniqueAssetTargets(
        [
          { domain: "a.de", provisionalAssetId: "da-a" },
          { domain: "a.de", provisionalAssetId: "da-b" },
        ],
        "profile",
      ),
    ).toThrow(/Domain was already assigned/);
  });

  it("rejects one provisional asset ID mapped to two domains", () => {
    expect(() =>
      assertUniqueAssetTargets(
        [
          { domain: "a.de", provisionalAssetId: "da-a" },
          { domain: "b.de", provisionalAssetId: "da-a" },
        ],
        "axe",
      ),
    ).toThrow(/Asset ID was already assigned/);
  });
});
