import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-readiness-boundary-"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
async function invoke(args: string[]) {
  try {
    const result = await promisify(execFile)(
      process.execPath,
      [
        "--import",
        "tsx",
        "--conditions=@syrokomskyi/source",
        fileURLToPath(new URL("../../tools/quarter-readiness.ts", import.meta.url)),
        ...args,
      ],
      { cwd: fileURLToPath(new URL("../../", import.meta.url)), timeout: 10_000 },
    );
    return { ...result, code: 0 };
  } catch (error) {
    return error as { code: number; stdout: string; stderr: string };
  }
}
describe("readiness CLI cannot issue authority from unchecked inputs", () => {
  it("rejects removed digest-directory flags without touching existing evidence", async () => {
    for (const name of ["preservation-gate", "qualification", "predecessor", "capacity-report"])
      await fs.writeFile(path.join(root, `${name}-sha256.txt`), "a".repeat(64));
    await fs.writeFile(path.join(root, "readiness-receipt.json"), "retained original");
    const result = await invoke(["--period", "2026-q4", "--input", root, "--json"]);
    expect(result.code).not.toBe(0);
    expect(await fs.readFile(path.join(root, "readiness-receipt.json"), "utf8")).toBe(
      "retained original",
    );
    expect(await fs.readdir(root)).toHaveLength(5);
  });
  it("does not grant readiness to a caller's complete-looking reference set", async () => {
    const file = path.join(root, "admission.json");
    const ref = { schema: "evidence@1", uri: "missing.json", bytes: 10, sha256: "b".repeat(64) };
    await fs.writeFile(
      file,
      JSON.stringify({
        schema: "hdri-admission-input@1",
        scope: {
          period: "2026-q4",
          capsuleId: "c",
          operation: "collect",
          implementationFingerprint: "a".repeat(64),
          policySha256: "a".repeat(64),
          evidenceClass: "operational",
        },
        preservation: ref,
        qualification: ref,
        predecessor: ref,
        capacity: ref,
        publication: null,
      }),
    );
    const before = await fs.readFile(file);
    const result = await invoke([
      "--period",
      "2026-q4",
      "--operation",
      "collect",
      "--evidence-input",
      file,
      "--json",
    ]);
    expect(result.code).not.toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "blocked",
      violations: [{ code: "ADMISSION_VERIFIER_UNAVAILABLE" }],
    });
    expect(await fs.readFile(file)).toEqual(before);
    expect(await fs.readdir(root)).toEqual(["admission.json"]);
  });
  it("rejects a request for a different quarter than the declared input", async () => {
    const file = path.join(root, "admission.json");
    await fs.writeFile(
      file,
      JSON.stringify({
        schema: "hdri-admission-input@1",
        scope: {
          period: "2026-q3",
          capsuleId: "c",
          operation: "collect",
          implementationFingerprint: "a".repeat(64),
          policySha256: "a".repeat(64),
          evidenceClass: "operational",
        },
        preservation: null,
        qualification: null,
        predecessor: null,
        capacity: null,
        publication: null,
      }),
    );
    const result = await invoke([
      "--period",
      "2026-q4",
      "--operation",
      "collect",
      "--evidence-input",
      file,
      "--json",
    ]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("ADMISSION_SCOPE_MISMATCH");
  });
});
