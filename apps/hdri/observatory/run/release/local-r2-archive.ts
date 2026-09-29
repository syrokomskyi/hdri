/*
<MODULE_CONTRACT>
<purpose>Archive exactly an explicit release inventory and verify one retained local archive plus its private R2 copy.</purpose>
<non-goals><item>Does not grant release admission, sign attestations, publish, or certify fresh-machine restoration.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Implement inventory-bound local-plus-R2 archive preparation without copying unrelated capsule files.</item></CHANGE_SUMMARY>
*/
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { readCapsuleInventoryPart } from "@syrokomskyi/factory-core";
import { computeClosureDigest, sha256File, verifyReleaseEnvelope, type ReleaseEnvelope } from "./release-contract";
import { assertHdriR2Object, putVerifiedR2Object } from "./r2-transport";

async function tar(args: string[]) {
  const child = spawn("tar", args, { stdio: ["ignore", "ignore", "ignore"] });
  await new Promise<void>((resolve, reject) => {
    child.on("error", () => reject(new Error("CUSTODY_TAR_SPAWN_FAILED")));
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`CUSTODY_TAR_FAILED:${code}`)));
  });
}

async function* entries(root: string, envelope: ReleaseEnvelope) {
  for (const entry of envelope.inventory) {
    if (entry.artifactInventory)
      for (const leaf of await readCapsuleInventoryPart(root, entry.artifactInventory)) yield leaf;
    yield entry;
  }
}

async function inspectEntry(root: string, entry: { uri: string; bytes: number; sha256: string }) {
  if (!entry.uri || entry.uri.includes("\\") || entry.uri.includes("\0") || path.isAbsolute(entry.uri) ||
    entry.uri.split("/").some(part => !part || part === "." || part === "..") ||
    !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256))
    throw new Error("CUSTODY_INVENTORY_ENTRY_INVALID");
  const file = path.join(root, entry.uri);
  const stat = await fs.lstat(file);
  if (!stat.isFile() || await fs.realpath(file) !== file || stat.size !== entry.bytes ||
    await sha256File(file) !== entry.sha256) throw new Error("CUSTODY_SOURCE_CONTENT_MISMATCH");
}

/** Caller must exclude concurrent writers and retain workRoot on durable local storage. */
export async function archiveReleaseToR2(options: {
  capsuleDir: string; workRoot: string; envelope: ReleaseEnvelope; remotePrefix: string; rcloneBinary: string;
}) {
  // Freeze caller-owned metadata before asynchronous IO.
  const envelope = JSON.parse(JSON.stringify(options.envelope)) as ReleaseEnvelope;
  if (verifyReleaseEnvelope(envelope).length || !envelope.inventory.length)
    throw new Error("CUSTODY_ENVELOPE_INVALID");
  assertHdriR2Object(`${options.remotePrefix}/probe`);
  const root = await fs.realpath(options.capsuleDir);
  await fs.mkdir(options.workRoot, { recursive: true, mode: 0o700 });
  const workRoot = await fs.realpath(options.workRoot);
  if (workRoot === root || workRoot.startsWith(`${root}${path.sep}`))
    throw new Error("CUSTODY_WORK_ROOT_OVERLAPS_CAPSULE");
  const work = await fs.mkdtemp(path.join(workRoot, "archive-"));
  const listPath = path.join(work, "inventory-files.nul");
  const list = await fs.open(listPath, "wx", 0o600);
  let verifiedBytes = 0;
  let verifiedObjects = 0;
  const seen = new Set<string>();
  try {
    let batch = "";
    for await (const entry of entries(root, envelope)) {
      if (seen.has(entry.uri)) throw new Error("CUSTODY_DUPLICATE_INVENTORY_PATH");
      seen.add(entry.uri);
      await inspectEntry(root, entry);
      verifiedObjects++;
      verifiedBytes += entry.bytes;
      if (!Number.isSafeInteger(verifiedBytes)) throw new Error("CUSTODY_BYTE_COUNT_OVERFLOW");
      batch += `${entry.uri}\0`;
      if (Buffer.byteLength(batch) >= 65536) { await list.writeFile(batch); batch = ""; }
    }
    if (batch) await list.writeFile(batch);
    await list.sync();
  } finally { await list.close(); }
  const archivePath = path.join(work, "closure.tar.zst");
  await tar(["--format=pax", "--pax-option=delete=atime,delete=ctime", "-I", "zstd -T2 -3",
    "-cf", archivePath, "-C", root, "--no-recursion", "--null", "--verbatim-files-from", "-T", listPath]);
  await fs.chmod(archivePath, 0o600);
  const archiveHandle = await fs.open(archivePath, "r");
  try { await archiveHandle.sync(); } finally { await archiveHandle.close(); }
  const workHandle = await fs.open(work, "r");
  try { await workHandle.sync(); } finally { await workHandle.close(); }
  await tar(["--zstd", "--compare", "--file", archivePath, "-C", root]);
  // Content checks after packing prevent ordinary concurrent changes from being accepted as new evidence.
  for await (const entry of entries(root, envelope)) await inspectEntry(root, entry);
  const envelopeSha256 = createHash("sha256").update(JSON.stringify(envelope)).digest("hex");
  const archiveSha256 = await sha256File(archivePath);
  const retainedArchivePath = path.join(workRoot, `${archiveSha256}.tar.zst`);
  try { await fs.link(archivePath, retainedArchivePath); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (await sha256File(retainedArchivePath) !== archiveSha256) throw new Error("CUSTODY_RETAINED_ARCHIVE_CONFLICT");
  }
  // Remove only this attempt's redundant link; retained content-addressed bytes remain.
  await fs.unlink(archivePath);
  const retainedRoot = await fs.open(workRoot, "r");
  try { await retainedRoot.sync(); } finally { await retainedRoot.close(); }
  const remoteObject = `${options.remotePrefix}/${envelopeSha256}/${archiveSha256}.tar.zst`;
  const remote = await putVerifiedR2Object(retainedArchivePath, remoteObject, options.rcloneBinary);
  if (remote.sha256 !== archiveSha256) throw new Error("CUSTODY_ARCHIVE_CHANGED");
  return Object.freeze({
    schema: "hdri-local-r2-archive@1" as const,
    status: "archive-verified-not-release-admission" as const,
    envelopeSha256, closureDigest: computeClosureDigest(envelope.inventory), verifiedBytes, verifiedObjects,
    local: { archivePath: retainedArchivePath, sha256: archiveSha256, bytes: remote.bytes }, remote,
    limitations: ["Caller must establish durable local medium and trusted release scope.",
      "Shared workstation/cloud credential compromise remains possible.",
      "Archive readback is not fresh-machine restoration or publication approval."],
  });
}
