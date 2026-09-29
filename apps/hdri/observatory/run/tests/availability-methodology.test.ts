/*
<MODULE_CONTRACT>
<purpose>Test availability-methodology file verification using isolated, explicitly synthetic runtime inventories.</purpose>
<non-goals><item>Fixture bytes are not executable runtimes or real reconstruction evidence.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0115: reject changed bytes, wrong scope, missing components and escaping or symbolic paths.</item></CHANGE_SUMMARY>
*/
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { verifyAvailabilityMethodology } from "../release/availability-methodology";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
const digest = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-methodology-")); roots.push(root);
  const names = ["policies/k-anon-policy-v1.yaml", "runtime/build-metafile.json", "runtime/node24-alpine-image.tar",
    "runtime/prepare-availability.mjs", "runtime/reconcile-availability.mjs", "runtime/prepare-availability-preview.mjs",
    "runtime/review-availability-preview.mjs", "source/apps/hdri/observatory/run/release/availability-candidate.ts",
    "source/apps/hdri/observatory/run/release/availability-reconciliation.ts", "source/apps/hdri/observatory/run/release/availability-preview.ts",
    "source/apps/hdri/observatory/run/release/availability-disclosure.ts", "source/packages/observatory/observatory-core/src/availability.ts",
    "source/extra-dependency.txt"];
  const files = [];
  for (const name of names) {
    const content = `synthetic-not-executable:${name}`;
    const file = path.join(root, name); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, content);
    files.push({ path: name, bytes: Buffer.byteLength(content), sha256: digest(content) });
  }
  const manifest = { schema: "hdri-offline-runtime-kit@1", period: "2026-q3", capsuleId: "fixture",
    image: `sha256:${"a".repeat(64)}`, files };
  const manifestPath = path.join(root, "runtime-kit-manifest.json");
  const options = { manifestPath, expectedManifestSha256: "", period: manifest.period, capsuleId: manifest.capsuleId,
    policySha256: files[0]!.sha256 };
  const save = async () => { const bytes = JSON.stringify(manifest); await fs.writeFile(manifestPath, bytes); options.expectedManifestSha256 = digest(bytes); };
  await save(); return { root, manifest, options, save };
}
test("verifies every declared file including dependencies outside the mandatory component list", async () => {
  const f = await fixture();
  const result = await verifyAvailabilityMethodology(f.options);
  expect(result.filesVerified).toBe(13);
  expect(result.components).toHaveLength(12);
  expect(result.applicability).toEqual(["availability"]);
  expect(result.runtimeManifestSha256).toBe(f.options.expectedManifestSha256);
  await fs.writeFile(path.join(f.root, "source/extra-dependency.txt"), "changed");
  await expect(verifyAvailabilityMethodology(f.options)).rejects.toThrow("COMPONENT_SIZE_MISMATCH");
});
test("rejects same-length byte substitution", async () => {
  const f = await fixture(); const file = path.join(f.root, f.manifest.files[1]!.path);
  const bytes = await fs.readFile(file); bytes[0] = 0; await fs.writeFile(file, bytes);
  await expect(verifyAvailabilityMethodology(f.options)).rejects.toThrow("COMPONENT_DIGEST_MISMATCH");
});
test("rejects unpinned or other-quarter methodology and policy substitution", async () => {
  const f = await fixture();
  await expect(verifyAvailabilityMethodology({ ...f.options, expectedManifestSha256: "b".repeat(64) })).rejects.toThrow("MANIFEST_DIGEST_MISMATCH");
  await expect(verifyAvailabilityMethodology({ ...f.options, period: "2026-q4" })).rejects.toThrow("RUNTIME_SCOPE_INVALID");
  await expect(verifyAvailabilityMethodology({ ...f.options, capsuleId: "another" })).rejects.toThrow("RUNTIME_SCOPE_INVALID");
  await expect(verifyAvailabilityMethodology({ ...f.options, policySha256: "b".repeat(64) })).rejects.toThrow("POLICY_MISMATCH");
});
test("rejects missing and duplicated components", async () => {
  const f = await fixture();
  const removed = f.manifest.files.shift()!; await f.save();
  await expect(verifyAvailabilityMethodology(f.options)).rejects.toThrow("COMPONENT_MISSING");
  f.manifest.files.push(removed, removed); await f.save();
  await expect(verifyAvailabilityMethodology(f.options)).rejects.toThrow("INVENTORY_INVALID");
});
test.each(["../escape", "/absolute", "source/../escape", "source\\escape", "source//double"])("rejects nonportable inventory path %s", async value => {
  const f = await fixture(); f.manifest.files[12]!.path = value; await f.save();
  await expect(verifyAvailabilityMethodology(f.options)).rejects.toThrow("INVENTORY_INVALID");
});
test("rejects symlink substitution even when target bytes match", async () => {
  const f = await fixture(); const file = path.join(f.root, f.manifest.files[12]!.path);
  await fs.rename(file, `${file}.original`); await fs.symlink(`${file}.original`, file);
  await expect(verifyAvailabilityMethodology(f.options)).rejects.toThrow("INVENTORY_SYMLINK");
});

test("the scientific CLI retains a byte-stable availability-only report without executing fixture code", async () => {
  const f = await fixture();
  const run = () => promisify(execFile)(process.execPath, ["--conditions=@syrokomskyi/source", "--import", import.meta.resolve("tsx"),
    fileURLToPath(new URL("../../tools/scientific-reports/availability-methodology.ts", import.meta.url)),
    "--period", f.options.period, "--capsule-id", f.options.capsuleId, "--evidence-dir", path.join(f.root, "qc"),
    "--runtime-manifest", f.options.manifestPath, "--runtime-manifest-sha256", f.options.expectedManifestSha256,
    "--policy", path.join(f.root, "policies/k-anon-policy-v1.yaml")], { cwd: f.root });
  const first = JSON.parse((await run()).stdout);
  expect(first.status).toBe("pass");
  expect(first.filesVerified).toBe(13);
  expect(first.applicability).toEqual(["availability"]);
  expect(first.warnings).toContain("runtime_bytes_verified_not_reexecution_or_image_inspection");
  const output = path.join(f.root, "qc/methodology-snapshot.json");
  const retained = await fs.readFile(output, "utf8");
  expect(JSON.parse((await run()).stdout)).toEqual(first);
  expect(await fs.readFile(output, "utf8")).toBe(retained);
});
