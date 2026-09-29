/*
<MODULE_CONTRACT>
<purpose>Stores large capsule artifact inventories as bounded content-addressed JSON parts.</purpose>
<non-goals><item>Does not authenticate a capsule signature or silently exclude evidence.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Support inventories exceeding the JavaScript single-string limit.</item></CHANGE_SUMMARY>
*/
// @ai-invariant: inventory parts are authenticated before any contained path is consumed
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { readBoundedFile } from "@warpgogol/pipeline-node";
import { assertRelativeArtifactUri, KNOWN_INSTRUMENTS } from "./quarter-contracts.js";
import type { CapsuleArtifact } from "./capsule.js";

export const CAPSULE_INVENTORY_FORMAT = "hdri-artifact-inventory@1" as const;
export const MAX_INVENTORY_PART_BYTES = 4 * 1024 * 1024;
const MAX_PART_ENTRIES = 8192;

export type CapsuleInventoryPart = CapsuleArtifact &
  Readonly<{
    inventoryFormat: typeof CAPSULE_INVENTORY_FORMAT;
    entryCount: number;
  }>;

const hash = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

export function assertInventoryLeaf(entry: CapsuleArtifact): void {
  if (!entry || typeof entry !== "object" || "inventoryFormat" in entry)
    throw new Error("Inventory entries must be leaf artifacts");
  assertRelativeArtifactUri(entry.uri);
  if (!/^[0-9a-f]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0)
    throw new Error(`Invalid inventory artifact: ${entry.uri}`);
  if (
    ![
      "frame",
      "emit",
      "identity",
      "vault",
      "methodology",
      "publication",
      "qc",
      ...KNOWN_INSTRUMENTS,
    ].includes(entry.stage)
  )
    throw new Error(`Invalid inventory stage: ${entry.stage}`);
  if (Object.keys(entry).some((key) => !["stage", "uri", "sha256", "bytes"].includes(key)))
    throw new Error(`Unknown inventory artifact field: ${entry.uri}`);
}

/** Deterministic chunks; existing content-addressed bytes are checked, never overwritten. */
export async function writeCapsuleInventory(
  capsuleDir: string,
  entries: AsyncIterable<CapsuleArtifact> | Iterable<CapsuleArtifact>,
): Promise<CapsuleInventoryPart[]> {
  const writer = createCapsuleInventoryWriter(capsuleDir);
  for await (const entry of entries) await writer.append(entry);
  return writer.finish();
}

export function createCapsuleInventoryWriter(capsuleDir: string): {
  append(entry: CapsuleArtifact): Promise<void>;
  finish(): Promise<CapsuleInventoryPart[]>;
} {
  const parts: CapsuleInventoryPart[] = [];
  let chunk: CapsuleArtifact[] = [];
  let size = 128;
  const flush = async (): Promise<void> => {
    if (chunk.length === 0) return;
    const bytes = Buffer.from(
      `${JSON.stringify({ schema: CAPSULE_INVENTORY_FORMAT, artifacts: chunk })}\n`,
    );
    if (bytes.length > MAX_INVENTORY_PART_BYTES)
      throw new Error("Inventory part exceeds byte limit");
    const sha256 = hash(bytes);
    const uri = `artifacts/inventory/${sha256}.json`;
    const target = path.join(capsuleDir, uri);
    await fs.mkdir(path.dirname(target), { recursive: true });
    // Write an unreferenced temporary file; link publishes only completely synced bytes.
    const temporary = `${target}.${randomUUID()}.tmp`;
    const handle = await fs.open(temporary, "wx");
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await fs.link(temporary, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = await readBoundedFile(target, MAX_INVENTORY_PART_BYTES);
      if (!existing.equals(bytes)) throw new Error(`Inventory part conflicts: ${uri}`);
    } finally {
      await fs.unlink(temporary);
    }
    const directory = await fs.open(path.dirname(target), "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    parts.push({
      stage: "qc",
      uri,
      sha256,
      bytes: bytes.length,
      inventoryFormat: CAPSULE_INVENTORY_FORMAT,
      entryCount: chunk.length,
    });
    chunk = [];
    size = 128;
  };
  const append = async (entry: CapsuleArtifact): Promise<void> => {
    assertInventoryLeaf(entry);
    const length = Buffer.byteLength(JSON.stringify(entry)) + 1;
    if (length + 128 > MAX_INVENTORY_PART_BYTES)
      throw new Error("Inventory entry exceeds byte limit");
    if (chunk.length >= MAX_PART_ENTRIES || size + length > MAX_INVENTORY_PART_BYTES) await flush();
    chunk.push({ ...entry });
    size += length;
  };
  return {
    append,
    finish: async () => {
      await flush();
      return parts;
    },
  };
}

export async function readCapsuleInventoryPart(
  capsuleDir: string,
  part: CapsuleInventoryPart,
): Promise<readonly CapsuleArtifact[]> {
  assertRelativeArtifactUri(part.uri);
  if (
    part.inventoryFormat !== CAPSULE_INVENTORY_FORMAT ||
    part.stage !== "qc" ||
    !/^[0-9a-f]{64}$/.test(part.sha256) ||
    part.uri !== `artifacts/inventory/${part.sha256}.json` ||
    !Number.isSafeInteger(part.bytes) ||
    part.bytes <= 0 ||
    part.bytes > MAX_INVENTORY_PART_BYTES ||
    !Number.isSafeInteger(part.entryCount) ||
    part.entryCount <= 0 ||
    part.entryCount > MAX_PART_ENTRIES
  )
    throw new Error("Invalid capsule inventory reference");
  const bytes = await readBoundedFile(path.join(capsuleDir, part.uri), MAX_INVENTORY_PART_BYTES);
  if (bytes.length !== part.bytes || hash(bytes) !== part.sha256)
    throw new Error(`Capsule inventory failed authentication: ${part.uri}`);
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (
    value.schema !== CAPSULE_INVENTORY_FORMAT ||
    !Array.isArray(value.artifacts) ||
    value.artifacts.length !== part.entryCount ||
    Object.keys(value).some((k) => !["schema", "artifacts"].includes(k))
  )
    throw new Error(`Invalid capsule inventory payload: ${part.uri}`);
  for (const entry of value.artifacts) assertInventoryLeaf(entry);
  return value.artifacts;
}
