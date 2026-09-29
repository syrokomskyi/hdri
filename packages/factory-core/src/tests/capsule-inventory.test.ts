import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { readCapsuleInventoryPart, writeCapsuleInventory } from "../lib/capsule-inventory.js";
import type { CapsuleArtifact } from "../lib/capsule.js";
import { createHash } from "node:crypto";
import {
  appendCapsuleInventoryParts,
  createQuarterCapsuleStaging,
  iterateCapsuleArtifacts,
  verifyQuarterCapsuleArtifacts,
  type QuarterCapsule,
} from "../lib/capsule.js";
import { DEFAULT_INSTRUMENT_PLAN } from "../lib/quarter-contracts.js";

const roots: string[] = [];
async function root(): Promise<string> {
  const value = await fs.mkdtemp(path.join(os.tmpdir(), "capsule-inventory-test-"));
  roots.push(value);
  return value;
}
afterEach(async () => {
  for (const value of roots.splice(0)) await fs.rm(value, { recursive: true, force: true });
});
const leaf = (i: number): CapsuleArtifact => ({
  stage: "qc",
  uri: `staging/execution/events/${i}.json`,
  sha256: "a".repeat(64),
  bytes: i,
});

test("inventory commit is retry-stable and does not replace prior references", async () => {
  const dir = await root();
  await createQuarterCapsuleStaging(dir, { period: "2026-q3", capsuleId: "0198f3a4-5b6c-7d8e-9f01-234567890abc", deviceId: "test-device" }, DEFAULT_INSTRUMENT_PLAN);
  const parts = await writeCapsuleInventory(dir, [leaf(1)]);
  await appendCapsuleInventoryParts(dir, parts);
  const committed = await fs.readFile(path.join(dir, "capsule-staging.json"));
  await appendCapsuleInventoryParts(dir, parts);
  expect(await fs.readFile(path.join(dir, "capsule-staging.json"))).toEqual(committed);
  const other = await writeCapsuleInventory(dir, [leaf(2)]);
  await expect(appendCapsuleInventoryParts(dir, other)).rejects.toThrow("changed its committed parts");
  await fs.writeFile(path.join(dir, parts[0]!.uri), "{}\n");
  await expect(appendCapsuleInventoryParts(dir, parts)).rejects.toThrow("authentication");
  expect(await fs.readFile(path.join(dir, "capsule-staging.json"))).toEqual(committed);
});

test("partitions a lazy inventory and preserves every entry across retry", async () => {
  const dir = await root();
  function* entries() {
    for (let i = 0; i < 20000; i++) yield leaf(i);
  }
  const parts = await writeCapsuleInventory(dir, entries());
  expect(parts).toHaveLength(3);
  expect(await writeCapsuleInventory(dir, entries())).toEqual(parts);
  let count = 0;
  for (const part of parts)
    for (const entry of await readCapsuleInventoryPart(dir, part)) {
      expect(entry).toEqual(leaf(count++));
    }
  expect(count).toBe(20000);
});

test("authenticates actual part bytes and rejects substitution", async () => {
  const dir = await root();
  const [part] = await writeCapsuleInventory(dir, [leaf(1)]);
  await fs.writeFile(path.join(dir, part!.uri), "{}\n");
  await expect(readCapsuleInventoryPart(dir, part!)).rejects.toThrow("authentication");
  await expect(writeCapsuleInventory(dir, [leaf(1)])).rejects.toThrow("conflicts");
});

test("rejects missing parts, changed counts, traversal and nested inventories", async () => {
  const dir = await root();
  const [part] = await writeCapsuleInventory(dir, [leaf(1)]);
  await expect(readCapsuleInventoryPart(dir, { ...part!, entryCount: 2 })).rejects.toThrow(
    "payload",
  );
  await expect(writeCapsuleInventory(dir, [{ ...leaf(1), uri: "../escape" }])).rejects.toThrow();
  await expect(writeCapsuleInventory(dir, [part!])).rejects.toThrow("leaf artifacts");
  await fs.unlink(path.join(dir, part!.uri));
  await expect(readCapsuleInventoryPart(dir, part!)).rejects.toThrow();
});

test("interrupted input leaves complete unreferenced parts reusable", async () => {
  const dir = await root();
  async function* interrupted() {
    for (let i = 0; i < 9000; i++) yield leaf(i);
    throw new Error("simulated interruption");
  }
  await expect(writeCapsuleInventory(dir, interrupted())).rejects.toThrow("simulated interruption");
  const existing = await fs.readdir(path.join(dir, "artifacts/inventory"));
  expect(existing).toHaveLength(1);
  function* complete() {
    for (let i = 0; i < 9000; i++) yield leaf(i);
  }
  const parts = await writeCapsuleInventory(dir, complete());
  expect(parts[0]!.uri).toBe(`artifacts/inventory/${existing[0]}`);
  expect(parts.reduce((n, part) => n + part.entryCount, 0)).toBe(9000);
});

test("capsule verification includes leaf bytes and rejects duplicate inventory ownership", async () => {
  const dir = await root();
  const bytes = Buffer.from("retained evidence");
  await fs.mkdir(path.join(dir, "staging"));
  await fs.writeFile(path.join(dir, "staging/evidence"), bytes);
  const entry: CapsuleArtifact = {
    stage: "qc",
    uri: "staging/evidence",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  };
  const parts = await writeCapsuleInventory(dir, [entry]);
  const capsule: QuarterCapsule = {
    period: "2026-q3",
    capsuleId: "0198f3a4-5b6c-7d8e-9f01-234567890abc",
    state: "staging",
    instrumentPlan: DEFAULT_INSTRUMENT_PLAN,
    artifacts: [],
    artifactInventories: parts,
  };
  await expect(verifyQuarterCapsuleArtifacts(dir, capsule)).resolves.toBeUndefined();
  const collected = [];
  for await (const item of iterateCapsuleArtifacts(dir, capsule)) collected.push(item);
  expect(collected).toEqual([parts[0], entry]);
  await expect(
    verifyQuarterCapsuleArtifacts(dir, { ...capsule, artifacts: [entry] }),
  ).rejects.toThrow("Duplicate");
  await fs.writeFile(path.join(dir, entry.uri), Buffer.from("retained tampered"));
  await expect(verifyQuarterCapsuleArtifacts(dir, capsule)).rejects.toThrow("closure verification");
});

test.runIf(process.env.HDRI_INVENTORY_SCALE === "1")(
  "four million inventory entries round-trip without a monolithic string",
  async () => {
    const dir = await root();
    const count = 4_000_000;
    function* entries() {
      for (let i = 0; i < count; i++)
        yield { ...leaf(i), uri: `staging/execution/events/${"a".repeat(64)}-${i}.json` };
    }
    const parts = await writeCapsuleInventory(dir, entries());
    expect(Buffer.byteLength(JSON.stringify(parts))).toBeLessThan(1024 * 1024);
    let recovered = 0;
    for (const part of parts) {
      for (const entry of await readCapsuleInventoryPart(dir, part)) {
        if (
          entry.bytes !== recovered ||
          entry.uri !== `staging/execution/events/${"a".repeat(64)}-${recovered}.json`
        )
          throw new Error(`Inventory round-trip mismatch at ${recovered}`);
        recovered++;
      }
    }
    expect(recovered).toBe(count);
  },
  180000,
);
