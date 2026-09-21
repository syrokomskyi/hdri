import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Architecture regression: checks real command wiring, not runtime collection readiness.
const entries = [
  ["factory/0-harvest-source", "collect"],
  ["factory/1-register-businesses", "collect"],
  ["factory/2-check-liveness", "collect"],
  ["factory/3-extract-profile", "collect"],
  ["factory/4-audit-lighthouse", "collect"],
  ["factory/5-audit-axe", "collect"],
  ["factory/a-contract-ontology", "collect"],
  ["observatory", "publish"],
] as const;

describe("mutating entrypoints cannot masquerade as diagnostics", () => {
  it.each(entries)("%s fixes its operation to %s before output creation", (app, operation) => {
    const source = readFileSync(fileURLToPath(new URL(
      `../../../../apps/hdri/${app}/run/app/run-app.ts`, import.meta.url,
    )), "utf8");
    expect(source).not.toContain("process.env.HDRI_OPERATION");
    expect(source).not.toContain("createBootstrapAdmission");
    expect(source).toContain("loadAdmissionInputFromFiles");
    expect(source).toContain('requiredEvidenceClass: "operational"');
    expect(source).toContain(`operation: "${operation}"`);
    expect(source.indexOf('gate.status === "blocked"')).toBeGreaterThan(0);
    expect(source.indexOf("await ensureOutputDir(outputRootDir)")).toBeGreaterThan(
      source.indexOf('gate.status === "blocked"'),
    );
  });
});
