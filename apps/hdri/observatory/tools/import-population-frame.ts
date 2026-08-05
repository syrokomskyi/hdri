import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  importDestatisPopulationFrame,
  parseDestatisPopulationFrameCsv,
  type DestatisFrameMetadata,
} from "./population-frame-import-core";

const sourcePath = process.argv[2];
const outputDir = process.argv[3];
const originalPath = process.argv[4];
if (!sourcePath || !outputDir || !originalPath) {
  throw new Error("metadata JSON, output directory, and original official export paths are required");
}
const source = JSON.parse(
  await fs.readFile(path.resolve(sourcePath), "utf8"),
) as DestatisFrameMetadata & Record<string, unknown>;
if ("rows" in source || "nationalTotal" in source || "bundeslandTotals" in source || "groupTotals" in source) {
  throw new Error("Population-frame metadata must not contain hand-entered rows or totals");
}
const originalBytes = await fs.readFile(path.resolve(originalPath));
const sourceFileSha256 = createHash("sha256").update(originalBytes).digest("hex");
if (source.sourceFileSha256 !== sourceFileSha256) {
  throw new Error("Original official export does not match sourceFileSha256");
}
if (source.sourceFileName !== path.basename(originalPath)) {
  throw new Error("Original official export filename does not match sourceFileName");
}
let originalText: string;
try {
  originalText = new TextDecoder("utf-8", { fatal: true }).decode(originalBytes);
} catch {
  originalText = new TextDecoder("windows-1252").decode(originalBytes);
}
const parsedSource = parseDestatisPopulationFrameCsv(originalText, source);
const frame = importDestatisPopulationFrame(parsedSource);
const resolvedOutputDir = path.resolve(outputDir);
const commitImmutable = async (target: string, bytes: Buffer | string): Promise<void> => {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const expected = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  try {
    await fs.writeFile(target, expected, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (!(await fs.readFile(target)).equals(expected)) {
      throw new Error(`Population-frame artifact conflicts with immutable output: ${path.basename(target)}`);
    }
  }
};
await commitImmutable(
  path.join(resolvedOutputDir, "original", source.sourceFileName),
  originalBytes,
);
await commitImmutable(
  path.join(resolvedOutputDir, "population-frame.json"),
  `${JSON.stringify(frame, null, 2)}\n`,
);
await commitImmutable(
  path.join(resolvedOutputDir, "manifest.json"),
  `${JSON.stringify(frame.manifest, null, 2)}\n`,
);
await commitImmutable(
  path.join(resolvedOutputDir, "parse-report.json"),
  `${JSON.stringify({
    schemaVersion: "1",
    status: "pass",
    cells: parsedSource.rows.length,
    nationalTotal: frame.manifest.nationalTotal,
    weightsSha256: frame.manifest.weightsSha256,
  }, null, 2)}\n`,
);
/*
<MODULE_CONTRACT>
<purpose>Imports a provenance-locked Destatis source JSON into population-frame.json.</purpose>
<non-goals><item>Does not download or reinterpret official statistics.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0029 adds the population-frame import CLI.</item></CHANGE_SUMMARY>
*/
