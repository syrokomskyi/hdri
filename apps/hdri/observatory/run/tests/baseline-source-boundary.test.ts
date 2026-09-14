import { createHash, createPrivateKey, sign } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalize, generateSigningKey } from "@syrokomskyi/observatory-crypto";
import { inventorySources } from "../../tools/preservation/inventory.js";
import {
  prepareBaselineSource,
  preserveQ2,
  verifyReplicas,
  type ContentManifest,
  type PrepareBaselineSourceOptions,
} from "../../tools/preservation/preserve.js";

// Actual filesystem/signature/WAL boundary; temporary replicas are NOT custody proof.
describe("baseline input prepared from externally pinned preserved bytes", () => {
  let root: string;
  let source: string;
  let db: Database.Database;
  let opts: PrepareBaselineSourceOptions;
  const key = { ...generateSigningKey(), signingKeyId: "baseline-fixture", collectorId: "test" };
  const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
  const tree = async (directory: string) => {
    const files: Record<string, string> = {};
    for (const name of (await fs.readdir(directory, { recursive: true })).sort()) {
      const file = path.join(directory, name);
      if ((await fs.lstat(file)).isFile()) files[name] = hash(await fs.readFile(file));
    }
    return files;
  };
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-baseline-source-"));
    source = path.join(root, "source");
    await fs.mkdir(path.join(source, "nested"), { recursive: true });
    await fs.writeFile(path.join(source, "nested/page.html"), "<p>retained</p>");
    db = new Database(path.join(source, "nested/data.db"));
    db.pragma("journal_mode=WAL");
    db.pragma("wal_autocheckpoint=0");
    db.exec(
      "CREATE TABLE measured (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO measured VALUES (7, 'from WAL');",
    );
    const destinations = [0, 1, 2].map((index) => ({
      path: path.join(root, `replica-${index}`),
      failureDomain: `fixture-host-${index}`,
      medium: `fixture-medium-${index}`,
      credentialBoundary: `fixture-key-${index}`,
    }));
    const retained = await preserveQ2({
      inventory: await inventorySources({ roots: [source] }),
      sourceRoots: [source],
      destinations,
      dryRun: false,
      signingKey: key,
    });
    expect(retained.status).toBe("pass");
    opts = {
      destinations,
      manifestSha256: retained.inputFingerprint,
      verificationKeys: new Map([
        [key.signingKeyId, { signingKeyId: key.signingKeyId, publicKeyPem: key.publicKeyPem }],
      ]),
      sourceDestinationPath: destinations[1].path,
      workRoot: path.join(root, "working"),
    };
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    db?.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  // Generate genuinely signed malformed archives, not mocks of the verifier.
  const resign = async (edit: (manifest: ContentManifest) => void) => {
    const manifest: ContentManifest = JSON.parse(
      await fs.readFile(path.join(opts.destinations[0].path, "content-manifest.json"), "utf8"),
    );
    edit(manifest);
    const bytes = canonicalize(manifest);
    opts.manifestSha256 = hash(bytes);
    const signature = canonicalize({
      schema: "hdri-content-signature@1",
      signingKeyId: key.signingKeyId,
      payloadSha256: hash(bytes),
      signature: sign(
        null,
        Buffer.from(hash(bytes), "hex"),
        createPrivateKey(key.privateKeyPem),
      ).toString("base64url"),
    });
    for (const destination of opts.destinations) {
      await fs.writeFile(path.join(destination.path, "content-manifest.json"), bytes);
      await fs.writeFile(path.join(destination.path, "content-manifest.sig"), signature);
      await fs.writeFile(
        path.join(destination.path, "destination-receipt.json"),
        canonicalize({
          schema: "hdri-destination-receipt@2",
          period: "2026-q2",
          destination,
          totalObjects: manifest.artifacts.length,
          totalBytes: manifest.artifacts.reduce((n, a) => n + a.bytes, 0),
          contentManifestSha256: opts.manifestSha256,
          signatureSha256: hash(signature),
          verificationKeySha256: hash(key.publicKeyPem),
        }),
      );
    }
  };

  it("copies the complete closure, reads WAL-only values from private snapshots and leaves all retained bytes unchanged", async () => {
    const before = await tree(root);
    const prepared = await prepareBaselineSource(opts);
    expect(prepared.manifestSha256).toBe(opts.manifestSha256);
    expect(prepared.manifest.artifacts).toHaveLength(5); // DB, WAL, SHM, HTML and snapshot
    const snapshot = prepared.manifest.artifacts.find(
      (a) => a.representation === "sqlite-snapshot",
    )!;
    const reader = new Database(path.join(prepared.root, snapshot.uri), {
      readonly: true,
      fileMustExist: true,
    });
    try {
      expect(reader.prepare("SELECT id, value FROM measured").all()).toEqual([
        { id: 7, value: "from WAL" },
      ]);
    } finally {
      reader.close();
    }
    const after = await tree(root);
    expect(
      Object.fromEntries(Object.entries(after).filter(([name]) => !name.startsWith("working/"))),
    ).toEqual(before);
    expect(Object.keys(await tree(prepared.root)).sort()).toEqual(
      prepared.manifest.artifacts.map((a) => a.uri).sort(),
    );
    expect((await verifyReplicas(opts)).status).toBe("pass");
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.manifest)).toBe(true);
    expect(Object.isFrozen(prepared.manifest.artifacts)).toBe(true);
    expect(Object.isFrozen(prepared.manifest.sourceInventory)).toBe(true);
    expect(prepared.manifest.artifacts.every(Object.isFrozen)).toBe(true);
    expect(prepared.manifest.sourceInventory.every(Object.isFrozen)).toBe(true);
    // Reading a working snapshot must not create an authority or a conversion receipt.
    expect(await fs.readdir(prepared.root)).toEqual(["originals", "snapshots"]);
  });

  it.each([
    "wrong digest",
    "untrusted key",
    "bad signature",
    "extra object",
    "missing object",
    "changed object",
    "bad receipt",
    "symlink object",
  ])("rejects %s in an unselected replica before creating working output", async (fault) => {
    const replica = opts.destinations[2].path;
    const file = path.join(replica, "originals/source-0000/nested/page.html");
    if (fault === "wrong digest") opts.manifestSha256 = "0".repeat(64);
    if (fault === "untrusted key") opts.verificationKeys = new Map();
    if (fault === "bad signature")
      await fs.writeFile(path.join(replica, "content-manifest.sig"), "{}");
    if (fault === "extra object") await fs.writeFile(path.join(replica, "extra"), "unexpected");
    if (fault === "missing object" || fault === "symlink object") await fs.unlink(file);
    if (fault === "changed object") await fs.writeFile(file, "<p>modified</p>");
    if (fault === "bad receipt")
      await fs.writeFile(path.join(replica, "destination-receipt.json"), "{}");
    if (fault === "symlink object") await fs.symlink(path.join(source, "nested/page.html"), file);
    await expect(prepareBaselineSource(opts)).rejects.toThrow();
    await expect(fs.stat(opts.workRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    "undeclared selection",
    "existing root",
    "replica child",
    "original sibling",
    "symlink parent",
    "relative root",
  ])("rejects unsafe destination: %s", async (fault) => {
    if (fault === "undeclared selection") opts.sourceDestinationPath = source;
    if (fault === "existing root") await fs.mkdir(opts.workRoot);
    if (fault === "replica child") opts.workRoot = path.join(opts.destinations[0].path, "working");
    // Source files only exist under nested/: protecting their immediate parents is insufficient.
    if (fault === "original sibling") opts.workRoot = path.join(source, "working");
    if (fault === "symlink parent") {
      await fs.symlink(source, path.join(root, "alias"));
      opts.workRoot = path.join(root, "alias/working");
    }
    if (fault === "relative root") opts.workRoot = "relative/working";
    const before = await tree(root);
    await expect(prepareBaselineSource(opts)).rejects.toThrow();
    expect(await tree(root)).toEqual(before);
    if (fault !== "existing root")
      await expect(fs.stat(opts.workRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("detaches destination, key and selection metadata before yielding", async () => {
    const expectedRoot = opts.workRoot;
    const mutableKey = { ...opts.verificationKeys.get(key.signingKeyId)! };
    opts.verificationKeys = new Map([[key.signingKeyId, mutableKey]]);
    const pending = prepareBaselineSource(opts);
    opts.destinations[1].path = source;
    opts.sourceDestinationPath = source;
    opts.workRoot = path.join(source, "injected");
    opts.manifestSha256 = "0".repeat(64);
    mutableKey.publicKeyPem = "invalid";
    const prepared = await pending;
    expect(prepared.root).toBe(expectedRoot);
    await expect(fs.stat(path.join(source, "injected"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["wrong relative path", "conflicting root"])(
    "rejects a signed inventory with %s before creating work files",
    async (fault) => {
      await resign((manifest) => {
        manifest.sourceInventory[0] = {
          ...manifest.sourceInventory[0],
          absolutePath: path.join(
            root,
            "different-source/nested",
            fault === "wrong relative path" ? "wrong.db" : "data.db",
          ),
        };
      });
      expect((await verifyReplicas(opts)).status).toBe("pass");
      await expect(prepareBaselineSource(opts)).rejects.toThrow(/BASELINE_SOURCE_ROOT/);
      await expect(fs.stat(opts.workRoot)).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it("allows only one concurrent preparation to own a fresh work root", async () => {
    const outcomes = await Promise.allSettled([
      prepareBaselineSource(opts),
      prepareBaselineSource(opts),
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await verifyReplicas(opts)).status).toBe("pass");
  });

  it("rejects source tampering after replica verification while retaining partial work for diagnosis", async () => {
    const mkdir = fs.mkdir.bind(fs);
    vi.spyOn(fs, "mkdir").mockImplementation(async (...args: Parameters<typeof fs.mkdir>) => {
      if (args[0] === opts.workRoot)
        await fs.writeFile(
          path.join(opts.sourceDestinationPath, "originals/source-0000/nested/page.html"),
          "<p>modified</p>",
        );
      return mkdir(...args);
    });
    await expect(prepareBaselineSource(opts)).rejects.toThrow(/CHANGED_SOURCE_BYTES/);
    expect((await fs.stat(opts.workRoot)).isDirectory()).toBe(true);
    await expect(
      fs.stat(path.join(opts.workRoot, "baseline-import-receipt.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(prepareBaselineSource(opts)).rejects.toThrow(/FRESH_ROOT_REQUIRED/);
  });

  it("rejects work-file tampering after all copies finish, not just source tampering", async () => {
    const readdir = fs.readdir.bind(fs);
    vi.spyOn(fs, "readdir").mockImplementation(async (...args: Parameters<typeof fs.readdir>) => {
      if (args[0] === opts.workRoot)
        await fs.writeFile(
          path.join(opts.workRoot, "originals/source-0000/nested/page.html"),
          "<p>modified</p>",
        );
      return readdir(...args);
    });
    await expect(prepareBaselineSource(opts)).rejects.toThrow(/BASELINE_SOURCE_OBJECT_MISMATCH/);
  });

  it("rejects unexpected work files before returning a prepared source", async () => {
    const mkdir = fs.mkdir.bind(fs);
    vi.spyOn(fs, "mkdir").mockImplementation(async (...args: Parameters<typeof fs.mkdir>) => {
      const result = await mkdir(...args);
      if (args[0] === opts.workRoot)
        await fs.writeFile(path.join(opts.workRoot, "unexpected"), "injected");
      return result;
    });
    await expect(prepareBaselineSource(opts)).rejects.toThrow(/BASELINE_SOURCE_CLOSURE_MISMATCH/);
  });

  it.each(["copy ENOSPC", "final directory sync"])(
    "does not return success after %s fails",
    async (fault) => {
      const before = await tree(source);
      const open = fs.open.bind(fs);
      vi.spyOn(fs, "open").mockImplementation(async (...args: Parameters<typeof fs.open>) => {
        if (
          fault === "copy ENOSPC" &&
          typeof args[0] === "string" &&
          args[0].startsWith(`${opts.workRoot}/originals/`)
        )
          throw Object.assign(new Error("fixture ENOSPC"), { code: "ENOSPC" });
        const handle = await open(...args);
        if (fault === "final directory sync" && args[0] === opts.workRoot)
          vi.spyOn(handle, "sync").mockRejectedValue(new Error("fixture fsync failure"));
        return handle;
      });
      await expect(prepareBaselineSource(opts)).rejects.toThrow(/fixture/);
      expect(await tree(source)).toEqual(before);
      expect((await verifyReplicas(opts)).status).toBe("pass");
      await expect(
        fs.stat(path.join(opts.workRoot, "baseline-import-receipt.json")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it("rejects a signed closure missing its SQLite snapshot even when ordinary replica verification passes", async () => {
    for (const destination of opts.destinations)
      await fs.unlink(path.join(destination.path, "snapshots/source-0000/nested/data.db"));
    await resign((manifest) => {
      manifest.artifacts = manifest.artifacts.filter((a) => a.representation !== "sqlite-snapshot");
    });
    expect((await verifyReplicas(opts)).status).toBe("pass");
    await expect(prepareBaselineSource(opts)).rejects.toThrow(
      /BASELINE_SNAPSHOT_COVERAGE_MISMATCH/,
    );
  });

  it.each(["WAL main file", "non-SQLite bytes"])(
    "rejects signed %s mislabeled as a standalone snapshot",
    async (kind) => {
      const bytes =
        kind === "WAL main file"
          ? await fs.readFile(path.join(source, "nested/data.db"))
          : Buffer.alloc(4096);
      for (const destination of opts.destinations)
        await fs.writeFile(
          path.join(destination.path, "snapshots/source-0000/nested/data.db"),
          bytes,
        );
      await resign((manifest) => {
        const snapshot = manifest.artifacts.find((a) => a.representation === "sqlite-snapshot")!;
        snapshot.bytes = bytes.length;
        snapshot.sha256 = hash(bytes);
      });
      expect((await verifyReplicas(opts)).status).toBe("pass");
      await expect(prepareBaselineSource(opts)).rejects.toThrow(
        /STANDALONE_BASELINE_SNAPSHOT_REQUIRED/,
      );
    },
  );
});
