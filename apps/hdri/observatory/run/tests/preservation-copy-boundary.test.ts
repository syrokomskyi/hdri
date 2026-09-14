import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateSigningKey } from "@syrokomskyi/observatory-crypto";
import { inventorySources } from "../../tools/preservation/inventory.js";
import { preserveQ2, verifyReplicas } from "../../tools/preservation/preserve.js";

// These three temporary destinations prove copy mechanics, not physical independence.
describe("Q2 preservation through actual signed copy and read-back boundaries", () => {
  let root: string;
  let source: string;
  const key = { ...generateSigningKey(), signingKeyId: "fixture-key", collectorId: "fixture" };
  const keys = new Map([
    [key.signingKeyId, { signingKeyId: key.signingKeyId, publicKeyPem: key.publicKeyPem }],
  ]);
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-preservation-boundary-"));
    source = path.join(root, "source");
    await fs.mkdir(source);
    await fs.writeFile(path.join(source, "page.html"), "<title>Retained Q2</title>");
    await fs.writeFile(
      path.join(source, "observations.ndjson"),
      '{"value":true,"measuredAt":"2026-04-01T00:00:00Z"}\n',
    );
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });
  const destinations = () =>
    [0, 1, 2].map((i) => ({
      path: path.join(root, `copy-${i}`),
      failureDomain: `fixture-host-${i}`,
      medium: `fixture-medium-${i}`,
      credentialBoundary: `fixture-key-${i}`,
    }));
  const options = async () => ({
    inventory: await inventorySources({ roots: [source] }),
    sourceRoots: [source],
    destinations: destinations(),
    dryRun: false,
    signingKey: key,
  });
  const files = async (dir: string) => {
    const names = (await fs.readdir(dir, { recursive: true })).sort();
    const result: Record<string, string> = {};
    for (const name of names) {
      const file = path.join(dir, name);
      if ((await fs.lstat(file)).isFile())
        result[name] = createHash("sha256")
          .update(await fs.readFile(file))
          .digest("hex");
    }
    return result;
  };

  it("retains every original byte and verifies complete destinations, not individual files", async () => {
    const before = await files(source);
    const opts = await options();
    const result = await preserveQ2(opts);
    expect(result.status).toBe("pass");
    expect(await files(source)).toEqual(before);
    const verified = await verifyReplicas({
      destinations: opts.destinations,
      manifestSha256: result.inputFingerprint,
      verificationKeys: keys,
    });
    expect(verified.status, JSON.stringify(verified.violations)).toBe("pass");
    for (const dest of opts.destinations) {
      const manifest = JSON.parse(
        await fs.readFile(path.join(dest.path, "content-manifest.json"), "utf8"),
      );
      expect(manifest.artifacts).toHaveLength(2);
      const receipt = JSON.parse(
        await fs.readFile(path.join(dest.path, "destination-receipt.json"), "utf8"),
      );
      expect(receipt.totalObjects).toBe(2);
      expect(
        await fs.readFile(path.join(dest.path, "originals/source-0000/page.html"), "utf8"),
      ).toBe("<title>Retained Q2</title>");
    }
  });

  it("dry-run validates the inventory but creates no output, lock or signing artifacts", async () => {
    const before = await files(root);
    const opts = await options();
    await preserveQ2({ ...opts, dryRun: true, signingKey: undefined });
    expect(await files(root)).toEqual(before);
    expect((await fs.readdir(root)).sort()).toEqual(["source"]);
  });

  it("preserves WAL-dependent originals separately from queryable SQLite snapshots", async () => {
    await fs.mkdir(path.join(source, "other"));
    const db = new Database(path.join(source, "data.db"));
    const second = new Database(path.join(source, "other/data.db"));
    try {
      db.pragma("journal_mode=WAL");
      db.pragma("wal_autocheckpoint=0");
      db.exec("CREATE TABLE measured(value TEXT); INSERT INTO measured VALUES ('from WAL');");
      second.exec(
        "CREATE TABLE measured(value TEXT); INSERT INTO measured VALUES ('second database');",
      );
      const before = await files(source);
      const opts = await options();
      const result = await preserveQ2(opts);
      expect(result.status).toBe("pass");
      expect(
        await files(source),
        "Preservation must never open original SQLite databases or alter WAL/SHM bytes",
      ).toEqual(before);
      for (const [relative, expected] of [
        ["data.db", "from WAL"],
        ["other/data.db", "second database"],
      ]) {
        const snapshot = new Database(
          path.join(opts.destinations[0].path, "snapshots/source-0000", relative),
          { readonly: true },
        );
        try {
          expect(snapshot.prepare("SELECT value FROM measured").pluck().get()).toBe(expected);
        } finally {
          snapshot.close();
        }
      }
      expect(
        (
          await verifyReplicas({
            destinations: opts.destinations,
            manifestSha256: result.inputFingerprint,
            verificationKeys: keys,
          })
        ).status,
      ).toBe("pass");
    } finally {
      db.close();
      second.close();
    }
  });

  it.each(["../escaped", "/absolute", "a/../b", "a\\b", "a//b"])(
    "rejects unsafe object identity %s before effects",
    async (role) => {
      const opts = await options();
      opts.inventory[0] = { ...opts.inventory[0], role };
      await expect(preserveQ2(opts)).rejects.toThrow();
      expect(await fs.readdir(root)).toEqual(["source"]);
    },
  );

  it("rejects changed source bytes against the supplied inventory before creating destinations", async () => {
    const opts = await options();
    await fs.writeFile(opts.inventory[0].absolutePath, "changed");
    await expect(preserveQ2(opts)).rejects.toThrow(/CHANGED_SOURCE_BYTES/);
    expect(await fs.readdir(root)).toEqual(["source"]);
  });

  it("rejects duplicate object identities instead of overwriting one source with another", async () => {
    const opts = await options();
    opts.inventory[1] = { ...opts.inventory[1], role: opts.inventory[0].role };
    await expect(preserveQ2(opts)).rejects.toThrow();
    expect(await fs.readdir(root)).toEqual(["source"]);
  });

  it("rejects file/directory role collisions during preflight", async () => {
    const opts = await options();
    opts.inventory[0] = { ...opts.inventory[0], role: "same" };
    opts.inventory[1] = { ...opts.inventory[1], role: "same/child" };
    await expect(preserveQ2(opts)).rejects.toThrow("OVERLAPPING_SOURCE_ROLES");
    expect(await fs.readdir(root)).toEqual(["source"]);
  });

  it("admits only one concurrent creator without overwriting the winner", async () => {
    const opts = await options();
    const results = await Promise.allSettled([preserveQ2(opts), preserveQ2(opts)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const winner = results.find((r) => r.status === "fulfilled");
    if (winner?.status !== "fulfilled") throw new Error("Expected exactly one preservation winner");
    expect(
      (
        await verifyReplicas({
          destinations: opts.destinations,
          manifestSha256: winner.value.inputFingerprint,
          verificationKeys: keys,
        })
      ).status,
    ).toBe("pass");
  });

  it.each(["source", "destination", "symlink"])(
    "rejects %s overlap before writing",
    async (variant) => {
      const opts = await options();
      if (variant === "source") opts.destinations[0].path = path.join(source, "copy");
      if (variant === "destination")
        opts.destinations[1].path = path.join(opts.destinations[0].path, "nested");
      if (variant === "symlink") {
        await fs.symlink(source, path.join(root, "alias"));
        opts.destinations[0].path = path.join(root, "alias", "copy");
      }
      const before = await files(source);
      await expect(preserveQ2(opts)).rejects.toThrow();
      expect(await files(source)).toEqual(before);
    },
  );

  it("never overwrites an existing destination, including on retry", async () => {
    const opts = await options();
    await preserveQ2(opts);
    const before = await files(opts.destinations[0].path);
    await expect(preserveQ2(opts)).rejects.toThrow(/FRESH_ROOT_REQUIRED/);
    expect(await files(opts.destinations[0].path)).toEqual(before);
  });

  it.each([
    "data",
    "missing",
    "unexpected",
    "signature",
    "receipt",
    "symlink",
    "key",
    "no-key",
    "manifest-pin",
    "custody",
  ])("independent read-back rejects %s tampering", async (mutation) => {
    const opts = await options();
    const result = await preserveQ2(opts);
    const dest = opts.destinations[1].path;
    const object = path.join(dest, "originals/source-0000/page.html");
    if (mutation === "data") await fs.writeFile(object, "<title>Replaced Q2</title>");
    if (mutation === "missing") await fs.unlink(object);
    if (mutation === "unexpected")
      await fs.writeFile(path.join(dest, "not-in-inventory"), "unknown");
    if (mutation === "signature")
      await fs.writeFile(path.join(dest, "content-manifest.sig"), "invalid");
    if (mutation === "receipt") {
      const file = path.join(dest, "destination-receipt.json");
      const receipt = JSON.parse(await fs.readFile(file, "utf8"));
      receipt.totalObjects += 1;
      await fs.writeFile(file, JSON.stringify(receipt));
    }
    if (mutation === "symlink") {
      await fs.unlink(object);
      await fs.symlink(path.join(source, "page.html"), object);
    }
    if (mutation === "custody") opts.destinations[1].credentialBoundary = "unattested-key";
    const verificationKeys =
      mutation === "no-key"
        ? new Map()
        : mutation === "key"
          ? new Map([
              [
                key.signingKeyId,
                { signingKeyId: key.signingKeyId, publicKeyPem: generateSigningKey().publicKeyPem },
              ],
            ])
          : keys;
    expect(
      (
        await verifyReplicas({
          destinations: opts.destinations,
          manifestSha256: mutation === "manifest-pin" ? "0".repeat(64) : result.inputFingerprint,
          verificationKeys,
        })
      ).status,
    ).toBe("incomplete");
  });

  it("refuses absent source roots instead of silently certifying an empty inventory", async () => {
    await expect(inventorySources({ roots: [path.join(root, "absent")] })).rejects.toThrow();
  });

  it("detects secret markers past the old 4KB window and across read chunks", async () => {
    await fs.writeFile(
      path.join(source, "late-secret.txt"),
      `${"x".repeat(65530)}-----BEGIN PRIVATE KEY-----`,
    );
    await expect(inventorySources({ roots: [source] })).rejects.toThrow(/Detected secret/);
  });

  it("keeps equal basenames in different source roots distinct", async () => {
    const other = path.join(root, "other-source");
    await fs.mkdir(other);
    await fs.writeFile(path.join(other, "page.html"), "another producer");
    const inventory = await inventorySources({ roots: [source, other] });
    expect(new Set(inventory.map((e) => e.role)).size).toBe(3);
    expect(inventory.filter((e) => e.role.endsWith("/page.html"))).toHaveLength(2);
    expect(new Set(inventory.map((e) => e.absolutePath)).size).toBe(3);
  });
});
