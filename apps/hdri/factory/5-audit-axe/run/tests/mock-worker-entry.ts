/*
 * Mock worker entry for AC-5 lifecycle integration tests.
 * Behavior controlled by MOCK_WORKER_MODE env var:
 * - "normal": responds with valid evidence
 * - "large-stdout": writes large stdout before responding
 * - "hung": never responds, ignores messages
 * - "crash-before-message": exits immediately with code 1
 * - "crash-after-message": sends response then exits with code 1
 * - "exit-zero-no-response": exits with code 0 without sending any message
 */
import { createHash } from "node:crypto";

const mode = process.env.MOCK_WORKER_MODE ?? "normal";

const sendEvidence = (workKey: string) => {
  const evidence = {
    schema: "hdri-browser-evidence@1" as const,
    workKey,
    measuredAt: new Date().toISOString(),
    endpoint: "https://example.com",
    mainStatus: 200,
    effectiveUrl: "https://example.com",
    outcome: "measured" as const,
    environmentSha256: createHash("sha256").update("test").digest("hex"),
    renderedDomSha256: createHash("sha256").update("dom").digest("hex"),
    reportSha256: createHash("sha256").update("report").digest("hex"),
    deadlineMs: 30000,
    policySha256: createHash("sha256").update("policy").digest("hex"),
  };
  process.send?.({ evidence });
};

process.on("message", (msg: { workKey: string }) => {
  switch (mode) {
    case "normal":
      sendEvidence(msg.workKey);
      break;
    case "large-stdout": {
      // Write 1MB of stdout before responding
      const big = "x".repeat(1024 * 1024);
      process.stdout.write(big);
      sendEvidence(msg.workKey);
      break;
    }
    case "hung":
      // Never respond
      break;
    case "crash-after-message":
      sendEvidence(msg.workKey);
      setTimeout(() => process.exit(1), 10);
      break;
    default:
      sendEvidence(msg.workKey);
      break;
  }
});

if (mode === "crash-before-message") {
  process.exit(1);
}

if (mode === "exit-zero-no-response") {
  process.exit(0);
}

process.on("uncaughtException", () => {
  process.exit(1);
});
