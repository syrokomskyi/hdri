import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { generateSigningKey, signAdmissionEvidence } from "@syrokomskyi/observatory-crypto";

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
  it("issues ready only through the real signed-evidence loader and gate", async () => {
    const key = generateSigningKey();
    const signingKey = { ...key, signingKeyId: "fixture-key", collectorId: "fixture" };
    const scope = {
      period: "2026-q3",
      capsuleId: "0198f000-0000-7000-8000-000000000000",
      operation: "collect" as const,
      implementationFingerprint: "implementation-q3",
      policySha256: "a".repeat(64),
      evidenceClass: "fixture" as const,
    };
    const refs: Record<string, { schema: string; uri: string; bytes: number; sha256: string }> = {};
    for (const role of ["preservation", "qualification", "predecessor", "capacity"]) {
      const file = `${role}.json`;
      const domainFile = `${role}-domain.json`;
      const domainBytes = Buffer.from(JSON.stringify({ schema: `fixture-${role}@1`, status: "pass" }));
      await fs.writeFile(path.join(root, domainFile), domainBytes);
      const bytes = Buffer.from(
        JSON.stringify(
          signAdmissionEvidence({
            signingKey,
            role,
            scope,
            evidence: {
              schema: `fixture-${role}@1`,
              uri: domainFile,
              bytes: domainBytes.length,
              sha256: (await import("node:crypto"))
                .createHash("sha256")
                .update(domainBytes)
                .digest("hex"),
            },
            signedAt: "2026-09-16T00:00:00.000Z",
          }),
        ),
      );
      await fs.writeFile(path.join(root, file), bytes);
      refs[role] = {
        schema: "hdri-admission-evidence@1",
        uri: file,
        bytes: bytes.length,
        sha256: (await import("node:crypto")).createHash("sha256").update(bytes).digest("hex"),
      };
    }
    const admission = path.join(root, "admission.json");
    await fs.writeFile(
      admission,
      JSON.stringify({
        schema: "hdri-admission-input@1",
        scope,
        preservation: refs.preservation,
        qualification: refs.qualification,
        predecessor: refs.predecessor,
        capacity: refs.capacity,
        publication: null,
      }),
    );
    const trustedKeys = path.join(root, "trusted-keys.json");
    await fs.writeFile(
      trustedKeys,
      JSON.stringify({
        schema: "hdri-admission-trust@1",
        keys: [{ signingKeyId: signingKey.signingKeyId, publicKeyPem: key.publicKeyPem, keyClass: "fixture" }],
      }),
    );
    const result = await invoke([
      "--period",
      "2026-q3",
      "--operation",
      "collect",
      "--evidence-input",
      admission,
      "--evidence-root",
      root,
      "--trusted-keys",
      trustedKeys,
      "--json",
    ]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "ready", operation: "collect" });
  });

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
    expect(result.stderr).toContain("EXPLICIT_PERIOD_OPERATION_EVIDENCE_ROOT_AND_TRUSTED_KEYS_REQUIRED");
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
      "--evidence-root",
      root,
      "--trusted-keys",
      path.join(root, "trusted-keys.json"),
      "--json",
    ]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("ADMISSION_SCOPE_MISMATCH");
  });
});
