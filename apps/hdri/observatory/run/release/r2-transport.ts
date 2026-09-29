/*
<MODULE_CONTRACT>
  <purpose>Transfer an immutable HDRI object to private R2 and verify every remote byte by streamed readback.</purpose>
  <non-goals><item>Does not certify archive contents, custody policy, recovery, scientific validity or publication admission.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Add direct R2 transport without treating a local mount cache as remote readback.</item></CHANGE_SUMMARY>
*/
// @ai-invariant: Upload success or matching metadata never substitutes for complete remote content verification.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export function assertHdriR2Object(remote: string): void {
  if (!/^r2:hdri-preservation\/[A-Za-z0-9_./-]+$/.test(remote) ||
    remote.endsWith("/") || remote.slice("r2:hdri-preservation/".length)
      .split("/").some(part => !part || part === "." || part === ".."))
    throw new Error("R2_OBJECT_OUTSIDE_HDRI_SCOPE");
}

async function hashLocal(file: string) {
  const stat = await fs.lstat(file);
  if (!stat.isFile()) throw new Error("R2_SOURCE_NOT_REGULAR_FILE");
  const hash = createHash("sha256");
  let bytes = 0;
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      hash.update(chunk);
      bytes += chunk.length;
    }
  } finally { await handle.close(); }
  if (!Number.isSafeInteger(bytes) || bytes !== stat.size)
    throw new Error("R2_SOURCE_CHANGED");
  return { sha256: hash.digest("hex"), bytes };
}

/** No shell interpolation; stdout is bounded-memory even for multi-gigabyte objects. */
async function runRclone(binary: string, args: string[], readback: boolean) {
  const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
  const hash = createHash("sha256");
  let bytes = 0;
  // Do not retain or echo credential-bearing external diagnostics.
  child.stderr.resume();
  return await new Promise<{ sha256: string; bytes: number }>((resolve, reject) => {
    child.stdout.on("data", (chunk: Buffer) => {
      if (readback) {
        hash.update(chunk);
        bytes += chunk.length;
      }
    });
    child.stdout.on("error", () => { child.kill(); reject(new Error("R2_READBACK_STREAM_FAILED")); });
    child.on("error", () => reject(new Error("R2_TRANSPORT_SPAWN_FAILED")));
    child.on("close", (code, signal) => {
      if (code !== 0 || signal || !Number.isSafeInteger(bytes))
        reject(new Error(`R2_TRANSPORT_FAILED:${code ?? "signal"}`));
      else resolve({ sha256: hash.digest("hex"), bytes });
    });
  });
}

/** Caller must bind this byte-level result to its actual sealed release closure. */
export async function putVerifiedR2Object(
  sourceFile: string,
  remoteObject: string,
  rcloneBinary: string,
) {
  assertHdriR2Object(remoteObject);
  if (!path.isAbsolute(rcloneBinary)) throw new Error("R2_BINARY_ABSOLUTE_PATH_REQUIRED");
  const source = path.resolve(sourceFile);
  const expected = await hashLocal(source);
  await runRclone(rcloneBinary, [
    "copyto", source, remoteObject, "--immutable", "--s3-acl", "private",
    "--transfers", "1", "--checkers", "2", "--stats", "20m", "--log-level", "ERROR",
  ], false);
  const actual = await runRclone(rcloneBinary, ["cat", remoteObject, "--log-level", "ERROR"], true);
  if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes)
    throw new Error("R2_REMOTE_READBACK_MISMATCH");
  const after = await hashLocal(source);
  if (after.sha256 !== expected.sha256 || after.bytes !== expected.bytes)
    throw new Error("R2_SOURCE_CHANGED");
  return Object.freeze({
    schema: "hdri-r2-object-readback@1" as const,
    remoteObject,
    sha256: actual.sha256,
    bytes: actual.bytes,
    verification: "full-remote-stream" as const,
  });
}
