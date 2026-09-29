import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, expect, test } from "vitest";
import { writeCapsuleInventory } from "@syrokomskyi/factory-core";
import {
  createReleaseEnvelope,
  resumeReplicaCopy,
  verifyReleaseEnvelope,
  type ReleaseEnvelope,
} from "../release/release-contract";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

test("versioned release copies and rereads inventory parts and all referenced evidence", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-inventory-"));
  roots.push(root);
  const source = path.join(root, "source"),
    destination = path.join(root, "replica");
  await fs.mkdir(path.join(source, "staging"), { recursive: true });
  const bytes = Buffer.from("authenticated evidence");
  await fs.writeFile(path.join(source, "staging/evidence"), bytes);
  const [part] = await writeCapsuleInventory(source, [
    {
      stage: "qc",
      uri: "staging/evidence",
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  ]);
  const inventory: ReleaseEnvelope["inventory"] = [
    {
      uri: part!.uri,
      sha256: part!.sha256,
      bytes: part!.bytes,
      access: "internal",
      artifactInventory: part,
    },
  ];
  const envelope = createReleaseEnvelope(
    "r",
    "2026-q3",
    "a".repeat(64),
    "b".repeat(64),
    inventory,
    "c".repeat(64),
    "d".repeat(64),
    "e".repeat(64),
  );
  expect(envelope.schema).toBe("hdri-release-envelope@2");
  expect(verifyReleaseEnvelope(envelope)).toEqual([]);
  expect(verifyReleaseEnvelope({ ...envelope, schema: "hdri-release-envelope@1" })).toContain(
    "inventory_reference_invalid:" + part!.uri,
  );
  const copied = await resumeReplicaCopy(source, destination, inventory);
  expect(copied.verifiedObjects).toBe(2);
  expect(copied.verifiedBytes).toBe(bytes.length + part!.bytes);
  expect(await fs.readFile(path.join(destination, "staging/evidence"))).toEqual(bytes);
  expect(await resumeReplicaCopy(source, destination, inventory)).toEqual(copied);
  await fs.unlink(path.join(destination, "staging/evidence"));
  await fs.unlink(path.join(source, "staging/evidence"));
  await expect(resumeReplicaCopy(source, destination, inventory)).rejects.toThrow();
});

test("release refuses substituted inventory metadata before traversing it", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-inventory-"));
  roots.push(root);
  const [part] = await writeCapsuleInventory(root, [
    { stage: "qc", uri: "evidence", sha256: "a".repeat(64), bytes: 1 },
  ]);
  await expect(
    resumeReplicaCopy(root, path.join(root, "destination"), [
      {
        uri: part!.uri,
        sha256: "b".repeat(64),
        bytes: part!.bytes,
        access: "internal",
        artifactInventory: part,
      },
    ]),
  ).rejects.toThrow("reference mismatch");
});
