import { afterEach, expect, test } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertHdriR2Object, putVerifiedR2Object } from "../release/r2-transport";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });

// Fake only the external rclone process boundary. Real files, pipes and hashing remain in use.
async function fixture(behavior = "normal") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-r2-transport-"));
  roots.push(root);
  const source = path.join(root, "archive.bin");
  await fs.writeFile(source, "abc");
  const binary = path.join(root, "rclone-fixture");
  await fs.writeFile(binary, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const remote = ${JSON.stringify(path.join(root, "remote.bin"))};
const behavior = ${JSON.stringify(behavior)};
if (args[0] === 'copyto') {
  if (!args.includes('--immutable') || !args.includes('private')) process.exit(11);
  fs.copyFileSync(args[1], remote);
  if (behavior === 'source-change') fs.writeFileSync(args[1], 'xyz');
  if (behavior === 'upload-fail') process.exit(12);
} else if (args[0] === 'cat') {
  process.stdout.write(behavior === 'corrupt' ? 'xyz' : behavior === 'truncated' ? 'ab' : fs.readFileSync(remote));
  if (behavior === 'late-failure') process.exitCode = 13;
} else process.exit(14);
`, { mode: 0o700 });
  return { source, binary, remote: "r2:hdri-preservation/releases/test/archive.bin", root };
}

test("successful remote stream binds exact digest and byte count without asserting release custody", async () => {
  const f = await fixture();
  expect(await putVerifiedR2Object(f.source, f.remote, f.binary)).toEqual({
    schema: "hdri-r2-object-readback@1", remoteObject: f.remote,
    sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    bytes: 3, verification: "full-remote-stream",
  });
});

test.each(["corrupt", "truncated", "late-failure", "upload-fail", "source-change"])(
  "no readback result is issued after %s", async behavior => {
    const f = await fixture(behavior);
    await expect(putVerifiedR2Object(f.source, f.remote, f.binary)).rejects.toThrow();
  },
);

test.each(["r2:dater-evidence/file", "r2:hdri-preservation/../file", "r2:hdri-preservation/a//b",
  "r2:hdri-preservation/a/./b", "r2:hdri-preservation/", "r2:hdri-preservation/a\nb", "/local/cache"])(
  "rejects out-of-scope object %s before external IO", remote => {
    expect(() => assertHdriR2Object(remote)).toThrow("R2_OBJECT_OUTSIDE_HDRI_SCOPE");
  },
);

test("source symlinks cannot stand in for retained archive bytes", async () => {
  const f = await fixture();
  const link = path.join(f.root, "link");
  await fs.symlink(f.source, link);
  await expect(putVerifiedR2Object(link, f.remote, f.binary)).rejects.toThrow("NOT_REGULAR");
});

test("missing external tool fails closed", async () => {
  const f = await fixture();
  await expect(putVerifiedR2Object(f.source, f.remote, path.join(f.root, "missing"))).rejects.toThrow("SPAWN_FAILED");
});
