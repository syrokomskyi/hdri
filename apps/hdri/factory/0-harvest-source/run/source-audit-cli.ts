/*
<MODULE_CONTRACT><purpose>Run explicit offline HDRI source accounting from the owning application's command boundary.</purpose>
<non-goals><item>Does not open databases or allow implicit input and report roots.</item></non-goals></MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Add app-owned CLI for the shared offline source audit.</item></CHANGE_SUMMARY>
*/
import path from "node:path";
import { parseArgs } from "node:util";
import { writeSourceAudit } from "./source-audit-report.js";

const { values } = parseArgs({
  options: { "batch-root": { type: "string" }, "report-dir": { type: "string" } },
  strict: true,
  allowPositionals: false,
});
if (!values["batch-root"] || !values["report-dir"])
  throw new Error("Required: --batch-root <input> --report-dir <fresh-directory>");
const summary = await writeSourceAudit(
  path.resolve(values["batch-root"]),
  path.resolve(values["report-dir"]),
  (files) => console.error(`Audited ${files} files`),
);
console.log(JSON.stringify(summary, null, 2));
if (summary.status !== "parsed") process.exitCode = 1;
