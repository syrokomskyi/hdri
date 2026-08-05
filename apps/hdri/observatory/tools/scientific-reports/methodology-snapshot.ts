/*
<MODULE_CONTRACT>
<purpose>Freezes methodology snapshot: codebook, ontology, and policy versions with a canonical hash.</purpose>
<non-goals><item>Does not modify methodology files — reads and hashes only.</item></non-goals>
</MODULE_CONTRACT>
*/

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { arg, fileExists, requireCommonArgs, writeReport } from "./shared";

const { period, capsuleId, evidenceDir } = requireCommonArgs();
const codebookPath = arg("--codebook");
const ontologyPath = arg("--ontology");
const policiesDir = arg("--policies-dir");

const violations: string[] = [];
const warnings: string[] = [];

const hashFile = async (filePath: string): Promise<string> => {
  const content = await fs.readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
};

let codebookVersion: string | undefined;
let ontologyVersion: string | undefined;
let canonicalHash: string | undefined;

if (!codebookPath || !ontologyPath) {
  violations.push("methodology_inputs_missing");
} else {
  if (!(await fileExists(path.resolve(codebookPath)))) {
    violations.push("codebook_not_found");
  } else if (!(await fileExists(path.resolve(ontologyPath)))) {
    violations.push("ontology_not_found");
  } else {
    const codebookHash = await hashFile(path.resolve(codebookPath));
    const ontologyHash = await hashFile(path.resolve(ontologyPath));

    const codebook = await fs.readFile(path.resolve(codebookPath), "utf8");
    const codebookMatch = codebook.match(/version:\s*["']?([^"'\n#]+)/);
    codebookVersion = codebookMatch?.[1]?.trim();

    const ontology = await fs.readFile(path.resolve(ontologyPath), "utf8");
    const ontologyMatch = ontology.match(/version:\s*["']?([^"'\n#]+)/);
    ontologyVersion = ontologyMatch?.[1]?.trim();

    let policyHashes: string[] = [];
    if (policiesDir && (await fileExists(path.resolve(policiesDir)))) {
      const entries = await fs.readdir(path.resolve(policiesDir), { withFileTypes: true });
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.isFile() && entry.name.endsWith(".yaml")) {
          policyHashes.push(await hashFile(path.join(path.resolve(policiesDir), entry.name)));
        }
      }
    }

    canonicalHash = createHash("sha256")
      .update([codebookHash, ontologyHash, ...policyHashes].join("\n"))
      .digest("hex");

    if (!codebookVersion) warnings.push("codebook_version_not_found");
    if (!ontologyVersion) warnings.push("ontology_version_not_found");
  }
}

await writeReport(
  "methodology-snapshot",
  "methodology-snapshot.json",
  evidenceDir,
  period,
  capsuleId,
  violations.length === 0 ? "pass" : "fail",
  violations,
  warnings,
  [],
  { codebookVersion, ontologyVersion, canonicalHash },
);
