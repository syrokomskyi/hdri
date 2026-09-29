import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EmitBundleWriter } from "@syrokomskyi/observatory-emit";
import { bindEmissionDerivation, readVerifiedEmission } from "../pipeline/emission-resume.js";

let root: string;
let emitDir: string;
let derivation: string;
const identity = {
  app_id: "a-contract-ontology",
  collector_version: "test-v1",
  ruleset_version: "2.0.0",
  ontology_version: "2.0.0",
  run_id: "fixture-capsule",
  period: "2026-q3",
};

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-emission-resume-"));
  emitDir = path.join(root, "emit");
  derivation = path.join(root, "derivation.json");
  await fs.writeFile(derivation, '{"derivation":"one"}\n');
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function commit() {
  await bindEmissionDerivation(emitDir, derivation);
  const writer = new EmitBundleWriter(emitDir, identity);
  await writer.open();
  await writer.writeEvidence({ fixture: "retained evidence" });
  return writer.commit();
}

describe("emission derivation and retention recovery", () => {
  it("binds a new output once and admits identical retries before emission", async () => {
    await bindEmissionDerivation(emitDir, derivation);
    await bindEmissionDerivation(emitDir, derivation);
    expect(await readVerifiedEmission(emitDir, identity)).toBeNull();
    expect(await fs.readFile(path.join(emitDir, "derivation.json"), "utf8")).toBe(
      '{"derivation":"one"}\n',
    );
  });

  it("does not adopt unbound partial output", async () => {
    await fs.mkdir(emitDir);
    await fs.writeFile(path.join(emitDir, "checkpoint.json"), "old candidate");
    await expect(bindEmissionDerivation(emitDir, derivation)).rejects.toThrow(
      "no derivation binding",
    );
    expect(await fs.readFile(path.join(emitDir, "checkpoint.json"), "utf8")).toBe("old candidate");
  });

  it("rejects a different derivation without changing the existing binding", async () => {
    await bindEmissionDerivation(emitDir, derivation);
    await fs.writeFile(derivation, '{"derivation":"two"}\n');
    await expect(bindEmissionDerivation(emitDir, derivation)).rejects.toThrow();
    expect(await fs.readFile(path.join(emitDir, "derivation.json"), "utf8")).toBe(
      '{"derivation":"one"}\n',
    );
  });

  it("verifies an already committed bundle for retention-only retry without rewriting it", async () => {
    const manifest = await commit();
    const before = await fs.readFile(path.join(emitDir, "manifest.json"));
    expect(await readVerifiedEmission(emitDir, identity)).toEqual(manifest);
    expect(await fs.readFile(path.join(emitDir, "manifest.json"))).toEqual(before);
  });

  it("rejects a committed bundle with substituted identity", async () => {
    await commit();
    await expect(readVerifiedEmission(emitDir, { ...identity, period: "2026-q4" })).rejects.toThrow(
      "period differs",
    );
  });

  it.each(["changed", "missing"])(
    "rejects %s committed evidence instead of silently starting a new emission",
    async (mode) => {
      const manifest = await commit();
      const partition = path.join(emitDir, manifest.evidence_partitions[0]!.uri);
      if (mode === "missing") await fs.unlink(partition);
      else await fs.writeFile(partition, '{"fixture":"substituted data"}\n');
      await expect(readVerifiedEmission(emitDir, identity)).rejects.toThrow();
    },
  );
});
