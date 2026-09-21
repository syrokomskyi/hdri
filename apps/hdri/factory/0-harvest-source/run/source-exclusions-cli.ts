/*
<MODULE_CONTRACT><purpose>Materialize an operator-authorized source-exclusion artifact from a pinned audit inventory.</purpose>
<non-goals><item>Does not decide exclusions — it binds an existing operator authorization to exact bytes.</item></non-goals></MODULE_CONTRACT>
<CHANGE_SUMMARY><item>B2: app-owned CLI that writes hdri-source-exclusions@1 artifacts.</item></CHANGE_SUMMARY>
*/
import path from "node:path";
import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import { buildSourceExclusions } from "./source-exclusions.js";

const { values } = parseArgs({
  options: {
    "batch-root": { type: "string" },
    "batch-name": { type: "string" },
    inventory: { type: "string" },
    summary: { type: "string" },
    authorization: { type: "string" },
    out: { type: "string" },
  },
  strict: true,
  allowPositionals: false,
});
for (const flag of [
  "batch-root",
  "batch-name",
  "inventory",
  "summary",
  "authorization",
  "out",
] as const)
  if (!values[flag])
    throw new Error(
      "Required: --batch-root <dir> --batch-name <name> --inventory <files.ndjson> " +
        "--summary <summary.json> --authorization <review-ref> --out <path>",
    );

const artifact = await buildSourceExclusions({
  batchRoot: path.resolve(values["batch-root"]!),
  batchName: values["batch-name"]!,
  inventoryPath: path.resolve(values.inventory!),
  summaryPath: path.resolve(values.summary!),
  authorization: values.authorization!,
});

const outPath = path.resolve(values.out!);
await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf-8");
console.log(
  JSON.stringify(
    {
      schema: artifact.schema,
      batch: artifact.batch,
      exclusions: artifact.exclusions.length,
      exclusionsSha256: artifact.exclusionsSha256,
      sourceSha256: artifact.sourceSha256,
      out: outPath,
    },
    null,
    2,
  ),
);
