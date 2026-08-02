/**
 * Finding 2: publication timestamping. Proves the pure record assembly + digest are
 * deterministic and content-addressed — a changed pinned file must change the digest,
 * and input ordering must NOT (so the anchored digest is stable across machines/runs).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildPublicationRecord,
  canonicalRecordBytes,
  recordDigest,
} from "../../tools/timestamp-core";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function write(name: string, content: string): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
}

const CREATED_AT = "2026-05-01T12:00:00.000Z";

describe("buildPublicationRecord / recordDigest", () => {
  it("pins each file's sha256 and produces a stable digest", async () => {
    const manifest = write("vault-manifest.json", '{"a":1}');
    const methodology = write("methodology-index.json", '{"b":2}');

    const rec = await buildPublicationRecord({
      period: "2026-Q2",
      publishedRunId: "run-1",
      createdAt: CREATED_AT,
      files: [
        { label: "vault-manifest", relPath: "vault/vault-manifest.json", absPath: manifest },
        {
          label: "methodology-index",
          relPath: "vault/methodology/methodology-index.json",
          absPath: methodology,
        },
      ],
    });

    expect(rec.files.map((f) => f.label)).toEqual(["methodology-index", "vault-manifest"]); // sorted
    expect(rec.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256))).toBe(true);
    expect(recordDigest(rec)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is order-independent (same digest regardless of input file order)", async () => {
    const m = write("m.json", "M");
    const o = write("o.json", "O");
    const a = await buildPublicationRecord({
      period: "2026-Q2",
      publishedRunId: "r",
      createdAt: CREATED_AT,
      files: [
        { label: "vault-manifest", relPath: "vault/m.json", absPath: m },
        { label: "methodology-index", relPath: "vault/o.json", absPath: o },
      ],
    });
    const b = await buildPublicationRecord({
      period: "2026-Q2",
      publishedRunId: "r",
      createdAt: CREATED_AT,
      files: [
        { label: "methodology-index", relPath: "vault/o.json", absPath: o },
        { label: "vault-manifest", relPath: "vault/m.json", absPath: m },
      ],
    });
    expect(recordDigest(a)).toBe(recordDigest(b));
  });

  it("changes the digest when a pinned file's bytes change", async () => {
    const p = write("vault-manifest.json", "original");
    const before = await buildPublicationRecord({
      period: "2026-Q2",
      publishedRunId: "r",
      createdAt: CREATED_AT,
      files: [{ label: "vault-manifest", relPath: "vault/vault-manifest.json", absPath: p }],
    });
    fs.writeFileSync(p, "tampered");
    const after = await buildPublicationRecord({
      period: "2026-Q2",
      publishedRunId: "r",
      createdAt: CREATED_AT,
      files: [{ label: "vault-manifest", relPath: "vault/vault-manifest.json", absPath: p }],
    });
    expect(recordDigest(after)).not.toBe(recordDigest(before));
  });

  it("canonical bytes are deterministic and end with a newline", async () => {
    const p = write("x.json", "x");
    const rec = await buildPublicationRecord({
      period: "2026-Q2",
      publishedRunId: "r",
      createdAt: CREATED_AT,
      files: [{ label: "x", relPath: "vault/x.json", absPath: p }],
    });
    const bytes = canonicalRecordBytes(rec);
    expect(bytes.toString("utf-8").endsWith("\n")).toBe(true);
    expect(canonicalRecordBytes(rec).equals(bytes)).toBe(true);
  });
});
