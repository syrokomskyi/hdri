import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  generateSigningKey,
  parseSourceSignatureManifest,
  verifySourceSignature,
} from "@syrokomskyi/observatory-crypto";
import { SignSourceStep, type SignSourceStepContext } from "../lib/sign-source-step.js";

const roots: string[] = [];
afterEach(async () => {
  delete process.env.DEVICE_ID;
  delete process.env.DEVICE_SIGNING_KEY;
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

class FixtureSignStep extends SignSourceStep<SignSourceStepContext & { state: { db: string } }> {
  override readonly id = "sign-source";
  override readonly guide = { title: "fixture", purpose: "fixture", decisionType: "auto" as const };
  protected override getAppId(): string {
    return "fixture-producer";
  }
  protected override getDbPath(ctx: SignSourceStepContext & { state: { db: string } }): string {
    return ctx.state.db;
  }
  protected override getSourceToken(): string {
    return "2026-q3-de-test";
  }
  protected override toRelativePath(value: string): string {
    return value;
  }
}

describe("SignSourceStep closed generation", () => {
  it("backs up committed WAL state and signs the standalone snapshot plus domain counts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-source-sign-"));
    roots.push(root);
    const dbPath = path.join(root, "live.sqlite");
    const db = new Database(dbPath);
    db.pragma("journal_mode=WAL");
    db.pragma("wal_autocheckpoint=0");
    db.exec(
      "CREATE TABLE sites(id INTEGER PRIMARY KEY, domain TEXT); INSERT INTO sites VALUES(1,'example.test')",
    );
    const generated = generateSigningKey();
    process.env.DEVICE_ID = "fixture-device";
    process.env.DEVICE_SIGNING_KEY = Buffer.from(generated.privateKeyPem).toString("base64");
    const output = path.join(root, "output");
    const context = {
      state: { db: dbPath },
      getGogolOutputDir: () => output,
      getGogolArtifactPath: (_id: string, artifact: string) => path.join(output, artifact),
    } as unknown as SignSourceStepContext & { state: { db: string } };
    try {
      await new FixtureSignStep().run(context);
    } finally {
      db.close();
    }
    const manifest = parseSourceSignatureManifest(
      await fs.readFile(path.join(output, "source-signature.json"), "utf8"),
    );
    expect(manifest.domain_counts).toEqual([{ domain: "sites", rows: 1 }]);
    expect(manifest.rows_signed).toBe(1);
    expect(verifySourceSignature(manifest, generated.publicKeyPem)).toBe(true);
    const snapshot = new Database(path.join(output, manifest.snapshot.uri), {
      readonly: true,
      fileMustExist: true,
    });
    try {
      expect(snapshot.pragma("journal_mode", { simple: true })).toBe("delete");
      expect(snapshot.prepare("SELECT domain FROM sites").pluck().get()).toBe("example.test");
    } finally {
      snapshot.close();
    }
    await expect(fs.lstat(path.join(output, `${manifest.snapshot.uri}-wal`))).rejects.toMatchObject(
      {
        code: "ENOENT",
      },
    );
  });

  it("does not create the gogol output directory when the source DB is invalid", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-source-sign-invalid-"));
    roots.push(root);
    const output = path.join(root, "output");
    const generated = generateSigningKey();
    process.env.DEVICE_ID = "fixture-device";
    process.env.DEVICE_SIGNING_KEY = Buffer.from(generated.privateKeyPem).toString("base64");
    const context = {
      state: { db: path.join(root, "missing.sqlite") },
      getGogolOutputDir: () => output,
      getGogolArtifactPath: (_id: string, artifact: string) => path.join(output, artifact),
    } as unknown as SignSourceStepContext & { state: { db: string } };

    await expect(new FixtureSignStep().run(context)).rejects.toThrow();
    await expect(fs.lstat(output)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.readdir(root)).resolves.toEqual([]);
  });
});
