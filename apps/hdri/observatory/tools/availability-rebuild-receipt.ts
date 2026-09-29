/*
<MODULE_CONTRACT><purpose>Retain an availability rebuild receipt derived from actual pinned replay evidence and current public bytes.</purpose><non-goals><item>Does not seal or publish; full capsule and operational admission remain separate.</item></non-goals></MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0115: bind completed offline replay without fabricating a fresh execution.</item></CHANGE_SUMMARY>
*/
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import type { QuarterCapsule } from "@syrokomskyi/factory-core";
import { deriveAvailabilityRebuildReceipt } from "../run/release/availability-rebuild";
const { values } = parseArgs({ options: { "capsule-manifest": { type: "string" } }, strict: true, allowPositionals: false });
if (!values["capsule-manifest"]) throw new Error("--capsule-manifest is required");
const file = path.resolve(values["capsule-manifest"]);
const root = path.dirname(file);
const capsule = JSON.parse(await fs.readFile(file, "utf8")) as QuarterCapsule;
const receipt = await deriveAvailabilityRebuildReceipt(root, capsule);
const target = path.join(root, "artifacts/qc/release/rebuild-receipt.json");
const bytes = `${JSON.stringify(receipt, null, 2)}\n`;
await fs.mkdir(path.dirname(target), { recursive: true });
try { await fs.writeFile(target, bytes, { flag: "wx", mode: 0o600 }); }
catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "EEXIST" || await fs.readFile(target, "utf8") !== bytes) throw error;
}
console.log(JSON.stringify({ status: "replay-bound-not-publication-admission", target, schema: receipt.schema }));
