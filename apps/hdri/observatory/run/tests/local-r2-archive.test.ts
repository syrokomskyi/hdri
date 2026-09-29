import { afterEach, expect, test } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { archiveReleaseToR2 } from "../release/local-r2-archive";
import type { ReleaseEnvelope } from "../release/release-contract";
import { writeCapsuleInventory } from "@syrokomskyi/factory-core";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-local-r2-")); roots.push(root);
  const capsuleDir = path.join(root, "capsule"); await fs.mkdir(capsuleDir);
  await fs.writeFile(path.join(capsuleDir, "included.txt"), "abc");
  await fs.writeFile(path.join(capsuleDir, "private-unlisted.txt"), "must not be transferred");
  const binary = path.join(root, "rclone-fixture");
  await fs.writeFile(binary, `#!/usr/bin/env node
const fs = require('node:fs'); const args = process.argv.slice(2);
const target = ${JSON.stringify(path.join(root, "remote.zst"))};
if(args[0] === 'copyto') fs.copyFileSync(args[1], target);
else if(args[0] === 'cat') fs.createReadStream(target).pipe(process.stdout);
else process.exit(3);
`, { mode: 0o700 });
  const envelope: ReleaseEnvelope = { schema: "hdri-release-envelope@1", releaseId: "fixture", period: "2026-q3",
    measurementCapsuleSha256: "a".repeat(64), scientificInputSha256: "b".repeat(64), publicManifestSha256: "c".repeat(64),
    rebuildReceiptSha256: "d".repeat(64), keyBundleSha256: "e".repeat(64),
    inventory: [{ uri: "included.txt", bytes: 3, sha256: createHash("sha256").update("abc").digest("hex"), access: "internal" }] };
  return { capsuleDir, workRoot: path.join(root, "archives"), envelope,
    remotePrefix: "r2:hdri-preservation/releases", rcloneBinary: binary };
}
test("real archive contains only verified inventory files and both copies share its digest", async () => {
  const f = await fixture(); const result = await archiveReleaseToR2(f);
  expect(result.status).toBe("archive-verified-not-release-admission");
  expect(result.verifiedObjects).toBe(1); expect(result.verifiedBytes).toBe(3);
  expect(result.local.sha256).toBe(result.remote.sha256);
  expect(execFileSync("tar", ["--zstd", "-tf", result.local.archivePath], { encoding: "utf8" })).toBe("included.txt\n");
  expect(result.remote.remoteObject).toContain(result.envelopeSha256);
  expect(await archiveReleaseToR2(f), "Identical source must retain identical archive/receipt identity on retry").toEqual(result);
});
test("changed source cannot become a new accepted measurement", async () => {
  const f = await fixture(); await fs.writeFile(path.join(f.capsuleDir, "included.txt"), "xyz");
  await expect(archiveReleaseToR2(f)).rejects.toThrow("CONTENT_MISMATCH");
});
test("duplicate inventory paths fail before remote transfer", async () => {
  const f = await fixture(); f.envelope.inventory.push(f.envelope.inventory[0]!);
  await expect(archiveReleaseToR2(f)).rejects.toThrow("DUPLICATE");
});
test("work directory inside capsule is rejected", async () => {
  const f = await fixture(); f.workRoot = path.join(f.capsuleDir, "archive");
  await expect(archiveReleaseToR2(f)).rejects.toThrow("OVERLAPS");
});
test("symlink source cannot introduce unlisted external content", async () => {
  const f = await fixture(); await fs.unlink(path.join(f.capsuleDir, "included.txt"));
  await fs.symlink("private-unlisted.txt", path.join(f.capsuleDir, "included.txt"));
  await expect(archiveReleaseToR2(f)).rejects.toThrow("CONTENT_MISMATCH");
});
test("inventory parts retain both the authenticated part and every referenced leaf", async () => {
  const f = await fixture();
  const leaf = f.envelope.inventory[0]!;
  const [part] = await writeCapsuleInventory(f.capsuleDir, [{ uri: leaf.uri, sha256: leaf.sha256, bytes: leaf.bytes, stage: "qc" }]);
  f.envelope.schema = "hdri-release-envelope@2";
  f.envelope.inventory = [{ uri: part!.uri, sha256: part!.sha256, bytes: part!.bytes,
    access: "internal", artifactInventory: part! }];
  const result = await archiveReleaseToR2(f);
  expect(result.verifiedObjects).toBe(2);
  const files = execFileSync("tar", ["--zstd", "-tf", result.local.archivePath], { encoding: "utf8" }).trim().split("\n");
  expect(files).toEqual(["included.txt", part!.uri]);
});
