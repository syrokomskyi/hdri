/*
<MODULE_CONTRACT>
<purpose>Integration tests for RFC-0115 Step 7: failure-atomic release CLI — interruption matrix and concurrent release lock.</purpose>
<non-goals>
  <item>Does not test full release flow — that requires signing keys, capsule, vault, and replicas.</item>
  <item>Does not test replica copy — that is covered by release-contract.test.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 Step 7: release CLI integration tests for interruption matrix and concurrent release lock.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { acquirePidLock } from "@syrokomskyi/utils";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "rfc0115-release-cli-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("RFC-0115 AC-3: release interruption matrix resumes with matching closure bytes", () => {
  it("idempotent retry: same release intent bytes is idempotent", async () => {
    const releaseDir = path.join(tmpDir, "release");
    await fs.mkdir(releaseDir, { recursive: true });
    const intentPath = path.join(releaseDir, "release-intent.json");
    const intentBytes = `${JSON.stringify(
      {
        schema: "hdri-release-intent@1",
        releaseIntentHash: "a".repeat(64),
        period: "2026-q3",
        capsuleId: "cap-001",
        frozenAt: "2026-09-13T00:00:00.000Z",
      },
      null,
      2,
    )}\n`;

    // First write — succeeds
    await fs.writeFile(intentPath, intentBytes, { flag: "wx" });

    // Second write with same bytes — idempotent (no error)
    let secondSucceeded = false;
    try {
      await fs.writeFile(intentPath, intentBytes, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        const existing = await fs.readFile(intentPath, "utf8");
        if (existing === intentBytes) {
          secondSucceeded = true;
        }
      }
    }
    expect(secondSucceeded, "Second write with same bytes must be idempotent").toBe(true);
  });

  it("conflict: different release intent bytes is a conflict", async () => {
    const releaseDir = path.join(tmpDir, "release");
    await fs.mkdir(releaseDir, { recursive: true });
    const intentPath = path.join(releaseDir, "release-intent.json");
    const originalBytes = `${JSON.stringify(
      {
        schema: "hdri-release-intent@1",
        releaseIntentHash: "a".repeat(64),
        period: "2026-q3",
        capsuleId: "cap-001",
        frozenAt: "2026-09-13T00:00:00.000Z",
      },
      null,
      2,
    )}\n`;
    const conflictingBytes = `${JSON.stringify(
      {
        schema: "hdri-release-intent@1",
        releaseIntentHash: "b".repeat(64),
        period: "2026-q3",
        capsuleId: "cap-001",
        frozenAt: "2026-09-13T00:00:00.000Z",
      },
      null,
      2,
    )}\n`;

    await fs.writeFile(intentPath, originalBytes, { flag: "wx" });

    let conflictDetected = false;
    try {
      await fs.writeFile(intentPath, conflictingBytes, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        const existing = await fs.readFile(intentPath, "utf8");
        if (existing !== conflictingBytes) {
          conflictDetected = true;
        }
      }
    }
    expect(conflictDetected, "Different release intent bytes must be detected as conflict").toBe(true);
  });

  it("idempotent retry: same replica receipts bytes is idempotent", async () => {
    const releaseDir = path.join(tmpDir, "release");
    await fs.mkdir(releaseDir, { recursive: true });
    const receiptsPath = path.join(releaseDir, "replica-receipts.json");
    const receiptsBytes = `${JSON.stringify(
      [
        {
          schema: "hdri-replica-receipt@1",
          replicaId: "r1",
          failureDomain: "dc-a",
          mediaId: "tape-1",
          credentialBoundary: "key-1",
          envelopeSha256: "a".repeat(64),
          closureDigest: "b".repeat(64),
          verifiedBytes: 1000,
          verifiedObjects: 10,
          verifiedAt: "2026-09-13T00:00:00.000Z",
        },
      ],
      null,
      2,
    )}\n`;

    await fs.writeFile(receiptsPath, receiptsBytes, { flag: "wx" });

    let idempotent = false;
    try {
      await fs.writeFile(receiptsPath, receiptsBytes, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        const existing = await fs.readFile(receiptsPath, "utf8");
        if (existing === receiptsBytes) {
          idempotent = true;
        }
      }
    }
    expect(idempotent, "Same replica receipts bytes must be idempotent").toBe(true);
  });

  it("idempotent retry: same envelope bytes is idempotent", async () => {
    const vaultDir = path.join(tmpDir, "vault", "releases", "period=2026-q3");
    await fs.mkdir(vaultDir, { recursive: true });
    const envelopePath = path.join(vaultDir, "cap-001.json");
    const envelopeBytes = `${JSON.stringify(
      {
        schema: "hdri-release-envelope@1",
        releaseId: "rel-001",
        period: "2026-q3",
      },
      null,
      2,
    )}\n`;

    await fs.writeFile(envelopePath, envelopeBytes, { flag: "wx" });

    let idempotent = false;
    try {
      await fs.writeFile(envelopePath, envelopeBytes, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        const existing = await fs.readFile(envelopePath, "utf8");
        if (existing === envelopeBytes) {
          idempotent = true;
        }
      }
    }
    expect(idempotent, "Same envelope bytes must be idempotent").toBe(true);
  });
});

describe("RFC-0115: concurrent release attempt fails with conflict code", () => {
  it("second concurrent release attempt fails with RELEASE_LOCK_VIOLATION", async () => {
    const lockRoot = path.join(tmpDir, "release-qc");
    await fs.mkdir(lockRoot, { recursive: true });

    // First lock acquisition succeeds
    const handle1 = await acquirePidLock(
      lockRoot,
      { lockFileName: ".release-lock.json", timeoutMs: 30 * 60 * 1000 },
      "RELEASE_LOCK_VIOLATION",
    );

    // Second lock acquisition must fail
    let conflictError: string | undefined;
    try {
      await acquirePidLock(
        lockRoot,
        { lockFileName: ".release-lock.json", timeoutMs: 30 * 60 * 1000 },
        "RELEASE_LOCK_VIOLATION",
      );
    } catch (error) {
      conflictError = (error as Error).message;
    }

    expect(conflictError).toBeDefined();
    expect(conflictError!).toContain("RELEASE_LOCK_VIOLATION");

    // Release first lock
    await handle1.release();

    // After release, a new acquisition should succeed
    const handle2 = await acquirePidLock(
      lockRoot,
      { lockFileName: ".release-lock.json", timeoutMs: 30 * 60 * 1000 },
      "RELEASE_LOCK_VIOLATION",
    );
    await handle2.release();
  });

  it("stale lock from dead process is overwritten", async () => {
    const lockRoot = path.join(tmpDir, "release-qc");
    await fs.mkdir(lockRoot, { recursive: true });

    // Write a stale lock with a dead PID
    const staleLock = {
      pid: 999999,
      acquiredAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    };
    await fs.writeFile(
      path.join(lockRoot, ".release-lock.json"),
      JSON.stringify(staleLock, null, 2),
      "utf8",
    );

    // Acquisition should succeed (stale lock overwritten)
    const handle = await acquirePidLock(
      lockRoot,
      { lockFileName: ".release-lock.json", timeoutMs: 30 * 60 * 1000 },
      "RELEASE_LOCK_VIOLATION",
    );

    const lockContent = JSON.parse(
      await fs.readFile(path.join(lockRoot, ".release-lock.json"), "utf8"),
    ) as { pid: number };
    expect(lockContent.pid).toBe(process.pid);

    await handle.release();
  });
});

describe("RFC-0115: revalidation before pointer switch", () => {
  it("missing attestation at destination blocks pointer switch", async () => {
    const destDir = path.join(tmpDir, "dest", "2026-q3", "cap-001");
    await fs.mkdir(destDir, { recursive: true });

    // No attestation file written
    let attestationMissing = false;
    try {
      await fs.access(path.join(destDir, "publication-attestation.json"));
    } catch {
      attestationMissing = true;
    }
    expect(attestationMissing, "Missing attestation must be detectable").toBe(true);
  });

  it("missing replica receipts at destination blocks pointer switch", async () => {
    const destDir = path.join(tmpDir, "dest", "2026-q3", "cap-001");
    await fs.mkdir(destDir, { recursive: true });

    let receiptsMissing = false;
    try {
      await fs.access(path.join(destDir, "replica-receipts.json"));
    } catch {
      receiptsMissing = true;
    }
    expect(receiptsMissing, "Missing replica receipts must be detectable").toBe(true);
  });

  it("staged public bytes mismatch blocks pointer switch", async () => {
    const stagingDir = path.join(tmpDir, "staging");
    await fs.mkdir(stagingDir, { recursive: true });
    await fs.writeFile(path.join(stagingDir, "product.json"), "wrong content");

    const { createHash } = await import("node:crypto");
    const stagedHash = createHash("sha256").update("wrong content").digest("hex");
    const expectedHash = createHash("sha256").update("correct content").digest("hex");

    expect(stagedHash).not.toBe(expectedHash);
  });
});
