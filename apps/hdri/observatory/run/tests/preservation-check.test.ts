import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { checkPreservation } from "../../tools/preservation-check";

const digest = (text: string): string => createHash("sha256").update(text).digest("hex");
let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-integrity-")); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe("retained archive integrity", () => {
  it("verifies exact nested paths with different bytes under identical basenames", async () => {
    await fs.mkdir(path.join(root, "a"));
    await fs.mkdir(path.join(root, "b"));
    await fs.writeFile(path.join(root, "a", "object"), "alpha");
    await fs.writeFile(path.join(root, "b", "object"), "beta");
    expect(await checkPreservation(root, {
      "a/object": digest("alpha"), "b/object": digest("beta"),
    })).toMatchObject({ status: "ok", totalObjects: 2, verifiedObjects: 2, violations: [] });
  });

  it("reports deleted objects rather than treating an empty archive as healthy", async () => {
    expect(await checkPreservation(root, { "lost/object": digest("gone") })).toMatchObject({
      status: "degraded", verifiedObjects: 0, violations: ["MISSING_OBJECT: lost/object"],
    });
  });

  it("does not accept a basename match for a different inventory path", async () => {
    await fs.mkdir(path.join(root, "nested"));
    await fs.writeFile(path.join(root, "nested", "object"), "same");
    const report = await checkPreservation(root, { object: digest("same") });
    expect(report.verifiedObjects).toBe(0);
    expect(report.violations).toEqual(["UNEXPECTED_OBJECT: nested/object", "MISSING_OBJECT: object"]);
  });

  it("reports corruption without repairing or changing bytes", async () => {
    const target = path.join(root, "object");
    await fs.writeFile(target, "damaged");
    expect(await checkPreservation(root, { object: digest("original") })).toMatchObject({
      status: "degraded", violations: ["HASH_MISMATCH: object"],
    });
    expect(await fs.readFile(target, "utf8")).toBe("damaged");
  });

  it("rejects unlisted bytes", async () => {
    await fs.writeFile(path.join(root, "object"), "expected");
    await fs.writeFile(path.join(root, "unlisted"), "private");
    expect(await checkPreservation(root, { object: digest("expected") })).toMatchObject({
      status: "degraded", verifiedObjects: 1, violations: ["UNEXPECTED_OBJECT: unlisted"],
    });
  });

  it.each([undefined, null, {}, [], "manifest", { object: "not-a-hash" },
    { "../escape": digest("x") }, { "/absolute": digest("x") }, { "a//b": digest("x") },
    { "a/./b": digest("x") }, { "C:/escape": digest("x") }, { "a\\b": digest("x") },
  ])("rejects an absent or unsafe inventory: %j", async (inventory) => {
    expect(await checkPreservation(root, inventory)).toMatchObject({
      status: "degraded", verifiedObjects: 0,
    });
  });

  it("does not follow symlinks to otherwise hash-matching bytes", async () => {
    await fs.writeFile(path.join(root, "object"), "same");
    await fs.symlink("object", path.join(root, "link"));
    expect(await checkPreservation(root, { object: digest("same"), link: digest("same") }))
      .toMatchObject({ status: "degraded", verifiedObjects: 1, violations: ["UNSAFE_OBJECT: link"] });
  });

  it("rejects symlinked roots", async () => {
    await fs.mkdir(path.join(root, "real"));
    await fs.symlink("real", path.join(root, "alias"));
    const report = await checkPreservation(path.join(root, "alias"), { object: digest("x") });
    expect(report.status).toBe("degraded");
    expect(report.violations).toContain("UNSAFE_ARCHIVE_ROOT");
  });
});
