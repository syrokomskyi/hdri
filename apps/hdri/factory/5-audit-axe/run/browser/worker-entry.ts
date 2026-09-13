/*
<MODULE_CONTRACT>
<purpose>Worker process entry point: receives a target via IPC, launches a fresh browser context, runs axe, and returns BrowserEvidence.</purpose>
<non-goals>
  <item>Does not own the worker pool or lifecycle management.</item>
  <item>Does not receive credentials, signing keys, or production database handles.</item>
  <item>Does not implement retry logic — the coordinator owns retries.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0105/ADR-0023: initial worker entry point with fresh non-persistent context per target.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import type { BrowserEvidence } from "@syrokomskyi/factory-core";
import { detectChallenge, type ChallengeOutcome } from "./challenge-detector.js";

// ---------------------------------------------------------------------------
// IPC protocol
// ---------------------------------------------------------------------------

export type WorkerRequest = {
  target: {
    siteId: number;
    provisionalAssetId: string;
    domain: string;
    url: string;
  };
  workKey: string;
  deadlineMs: number;
  policySha256: string;
  environmentSha256: string;
};

export type WorkerResponse = {
  evidence: BrowserEvidence;
  axeReport?: unknown;
};

export type WorkerError = {
  error: string;
  workKey: string;
};

// ---------------------------------------------------------------------------
// Axe report shape (minimal subset)
// ---------------------------------------------------------------------------

type AxeImpact = "critical" | "serious" | "moderate" | "minor";

type AxeReport = {
  testEngine?: { name?: string; version?: string };
  violations?: Array<{
    id: string;
    impact?: AxeImpact | null;
    nodes?: Array<unknown>;
  }>;
  nodesScanned?: number;
};

// ---------------------------------------------------------------------------
// Worker main
// ---------------------------------------------------------------------------

const runWorker = async (req: WorkerRequest): Promise<WorkerResponse> => {
  let playwright: any;
  let AxeBuilder: any;
  try {
    playwright = await import("playwright" as string);
    const mod: any = await import("@axe-core/playwright" as string);
    AxeBuilder = mod.default ?? mod;
  } catch {
    const evidence: BrowserEvidence = {
      schema: "hdri-browser-evidence@1",
      workKey: req.workKey,
      measuredAt: new Date().toISOString(),
      endpoint: req.target.url,
      mainStatus: null,
      effectiveUrl: req.target.url,
      outcome: "instrument-failed",
      environmentSha256: req.environmentSha256,
      renderedDomSha256: null,
      reportSha256: null,
      deadlineMs: req.deadlineMs,
      policySha256: req.policySha256,
    };
    return { evidence };
  }

  // RFC-0114 B4a: One browser per isolated worker, fresh context per target
  const browser = await playwright.chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    let mainStatus: number | null = null;
    page.on("response", (res: any) => {
      if (res.url() === req.target.url || res.request()?.resourceType() === "document") {
        const status = res.status();
        if (mainStatus === null) mainStatus = status;
      }
    });

    await page.goto(req.target.url, {
      waitUntil: "domcontentloaded",
      timeout: req.deadlineMs,
    });

    const effectiveUrl = page.url();
    const title = await page.title().catch(() => "");
    const bodyText = await page
      .evaluate("() => (document.body?.innerText ?? '').slice(0, 5000)")
      .catch(() => "");
    const pageContent = `${title}\n${bodyText}`;
    const renderedDomSha256 = createHash("sha256").update(pageContent).digest("hex");

    const outcome: ChallengeOutcome = detectChallenge(mainStatus, pageContent);

    if (outcome !== "measured") {
      await ctx.close();
      const evidence: BrowserEvidence = {
        schema: "hdri-browser-evidence@1",
        workKey: req.workKey,
        measuredAt: new Date().toISOString(),
        endpoint: req.target.url,
        mainStatus,
        effectiveUrl,
        outcome,
        environmentSha256: req.environmentSha256,
        renderedDomSha256,
        reportSha256: null,
        deadlineMs: req.deadlineMs,
        policySha256: req.policySha256,
      };
      return { evidence };
    }

    const results = (await new AxeBuilder({ page }).analyze()) as AxeReport;
    const reportJson = JSON.stringify(results);
    const reportSha256 = createHash("sha256").update(reportJson).digest("hex");

    await ctx.close();

    const evidence: BrowserEvidence = {
      schema: "hdri-browser-evidence@1",
      workKey: req.workKey,
      measuredAt: new Date().toISOString(),
      endpoint: req.target.url,
      mainStatus,
      effectiveUrl,
      outcome: "measured",
      environmentSha256: req.environmentSha256,
      renderedDomSha256,
      reportSha256,
      deadlineMs: req.deadlineMs,
      policySha256: req.policySha256,
    };

    return { evidence, axeReport: results };
  } finally {
    await browser.close();
  }
};

// ---------------------------------------------------------------------------
// IPC handler
// ---------------------------------------------------------------------------

process.on("message", async (msg: WorkerRequest) => {
  try {
    const response = await runWorker(msg);
    process.send?.(response);
  } catch (err) {
    const error: WorkerError = {
      error: err instanceof Error ? err.message : String(err),
      workKey: msg.workKey,
    };
    process.send?.(error);
  }
});

process.on("uncaughtException", (err) => {
  const error: WorkerError = {
    error: `uncaught: ${err.message}`,
    workKey: "",
  };
  process.send?.(error);
  process.exit(1);
});
