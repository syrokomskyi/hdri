/*
<MODULE_CONTRACT>
<purpose>Instrument preflight self-test: probes installed browser binary, engine version, and known fixture before work acquisition.</purpose>
<non-goals>
  <item>Does not run audit targets — only validates the instrument is ready.</item>
  <item>Does not modify any database or write persistent artifacts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0105: initial preflight self-test probing browser binary, axe-core version, and known fixture.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PreflightResult = {
  ok: boolean;
  browserDigest: string;
  engineVersion: string;
  violations: string[];
};

// ---------------------------------------------------------------------------
// Known fixture — minimal HTML with zero axe violations
// ---------------------------------------------------------------------------

const FIXTURE_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>OK</title></head><body><main><h1>OK</h1></main></body></html>`;

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------

export const preflight = async (): Promise<PreflightResult> => {
  const violations: string[] = [];

  let playwright: any;
  let AxeBuilder: any;
  try {
    playwright = await import("playwright" as string);
    const mod: any = await import("@axe-core/playwright" as string);
    AxeBuilder = mod.default ?? mod;
  } catch {
    return {
      ok: false,
      browserDigest: "",
      engineVersion: "",
      violations: ["playwright or @axe-core/playwright not installed"],
    };
  }

  // 1. Probe browser binary
  let browser: any;
  try {
    browser = await playwright.chromium.launch({ headless: true });
  } catch {
    return {
      ok: false,
      browserDigest: "",
      engineVersion: "",
      violations: ["Chromium binary not found or failed to launch"],
    };
  }

  // Compute browser binary digest
  let browserDigest = "";
  try {
    const execPath = playwright.chromium.executablePath?.() ?? "";
    if (execPath && existsSync(execPath)) {
      const buf = readFileSync(execPath);
      browserDigest = createHash("sha256").update(buf).digest("hex");
    } else {
      // Fallback: hash the executable path string
      browserDigest = createHash("sha256").update(execPath).digest("hex");
    }
  } catch {
    browserDigest = createHash("sha256").update("unknown").digest("hex");
  }

  // 2. Probe axe-core version via fixture
  let engineVersion = "";
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.setContent(FIXTURE_HTML);
    const results = await new AxeBuilder({ page }).analyze();
    engineVersion = (results as any)?.testEngine?.version ?? "unknown";

    // 3. Known-fixture self-test: verify zero violations on clean HTML
    const fixtureViolations = (results as any)?.violations ?? [];
    if (fixtureViolations.length > 0) {
      violations.push(`Known fixture returned ${fixtureViolations.length} violations (expected 0)`);
    }
    await ctx.close();
  } catch (err) {
    violations.push(
      `Fixture self-test failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    await browser.close();
  }

  return {
    ok: violations.length === 0 && browserDigest !== "",
    browserDigest,
    engineVersion,
    violations,
  };
};

// ---------------------------------------------------------------------------
// CLI entry (when run as `instrument:preflight`)
// ---------------------------------------------------------------------------

const main = async (): Promise<void> => {
  const result = await preflight();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    console.error("Preflight FAILED — stage will acquire zero target leases.");
    process.exit(1);
  }
  console.log("Preflight OK.");
};

// Run if invoked directly
if (import.meta.url === `file://${path.resolve(process.argv[1] ?? "")}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
