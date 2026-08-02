import fs from "node:fs/promises";
import path from "node:path";
import {
  importDestatisPopulationFrame,
  type DestatisFrameSource,
} from "./population-frame-import-core";

const sourcePath = process.argv[2];
const outputPath = process.argv[3];
if (!sourcePath || !outputPath) throw new Error("source and output paths are required");
const source = JSON.parse(await fs.readFile(path.resolve(sourcePath), "utf8")) as DestatisFrameSource;
const frame = importDestatisPopulationFrame(source);
await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
await fs.writeFile(path.resolve(outputPath), `${JSON.stringify(frame, null, 2)}\n`, "utf8");
/*
<MODULE_CONTRACT>
<purpose>Imports a provenance-locked Destatis source JSON into population-frame.json.</purpose>
<non-goals><item>Does not download or reinterpret official statistics.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0029 adds the population-frame import CLI.</item></CHANGE_SUMMARY>
*/
