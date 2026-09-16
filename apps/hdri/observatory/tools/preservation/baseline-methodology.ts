/*
<MODULE_CONTRACT>
<purpose>Parse exact retained ontology and codebook artifacts from a prepared baseline source and validate observation semantics against them.</purpose>
<non-goals>
  <item>Does not prove that the historical producer consumed these files or authenticate producer/device authority.</item>
  <item>Does not score observations, normalize methodology bytes or grant baseline admission.</item>
</non-goals>
<!-- risk: crypto, vault -->
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 A1: bind baseline conversion to exact prepared methodology bytes and their ordinary parsers.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: Parsed retained methodology bytes are not historical-use proof; keep the report non-admitting.

import path from "node:path";
import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";
import { parseCodebookOrThrow } from "@syrokomskyi/hdri-codebook";
import {
  parseOntology,
  validateObservation,
  type SignalOntology,
} from "@syrokomskyi/observatory-core";
import {
  assertRelativeObjectPath,
  inspectRetainedFile,
  readBoundedFile,
} from "@warpgogol/pipeline-node";
import { assertCurrentObservationSemantics } from "./baseline-observation-semantics.js";
import type { RetainedObservationSourceRow } from "./observation-source.js";
import {
  assertPreparedBaselineSource,
  type PreparedBaselineSource,
} from "./preserve.js";

const MAX_METHODOLOGY_BYTES = 16 * 1024 * 1024;
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const inspected = new WeakMap<BaselineMethodologyInspection, SignalOntology>();

export type BaselineMethodologyInspection = Readonly<{
  schema: "hdri-baseline-methodology@1";
  status: "parsed-source-bytes-not-producer-authenticated";
  manifestSha256: string;
  ontology: Readonly<{ uri: string; sha256: string; bytes: number; version: string }>;
  codebook: Readonly<{
    uri: string;
    sha256: string;
    bytes: number;
    id: string;
    version: string;
    ontologyRef: string;
  }>;
}>;

async function retainedText(
  prepared: PreparedBaselineSource,
  uri: string,
): Promise<{
  artifact: PreparedBaselineSource["manifest"]["artifacts"][number];
  source: string;
}> {
  assertRelativeObjectPath(uri);
  const matches = prepared.manifest.artifacts.filter((artifact) => artifact.uri === uri);
  if (matches.length !== 1 || matches[0].representation !== "original")
    throw new Error("BASELINE_METHODOLOGY_ARTIFACT_REQUIRED");
  const artifact = matches[0];
  if (artifact.bytes > MAX_METHODOLOGY_BYTES)
    throw new Error("BASELINE_METHODOLOGY_ARTIFACT_LIMIT");
  const file = path.join(prepared.root, uri);
  const bytes = await readBoundedFile(file, MAX_METHODOLOGY_BYTES);
  if (
    bytes.byteLength !== artifact.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== artifact.sha256
  )
    throw new Error("BASELINE_METHODOLOGY_ARTIFACT_CHANGED");
  return { artifact, source: utf8.decode(bytes) };
}

export async function inspectBaselineMethodology(options: Readonly<{
  prepared: PreparedBaselineSource;
  ontologyArtifactUri: string;
  codebookArtifactUri: string;
  ontologyVersion: string;
  codebookVersion: string;
}>): Promise<BaselineMethodologyInspection> {
  assertPreparedBaselineSource(options.prepared);
  if (options.ontologyArtifactUri === options.codebookArtifactUri)
    throw new Error("DISTINCT_BASELINE_METHODOLOGY_ARTIFACTS_REQUIRED");
  const ontologyFile = await retainedText(options.prepared, options.ontologyArtifactUri);
  const codebookFile = await retainedText(options.prepared, options.codebookArtifactUri);
  const ontology = parseOntology(ontologyFile.source, options.ontologyArtifactUri);
  const codebook = parseCodebookOrThrow(codebookFile.source, options.codebookArtifactUri);
  if (ontology.version !== options.ontologyVersion)
    throw new Error("BASELINE_ONTOLOGY_ARTIFACT_VERSION_MISMATCH");
  if (codebook.version !== options.codebookVersion)
    throw new Error("BASELINE_CODEBOOK_ARTIFACT_VERSION_MISMATCH");
  if (!codebook.ontologyRef) throw new Error("BASELINE_CODEBOOK_ONTOLOGY_REF_REQUIRED");
  assertRelativeObjectPath(codebook.ontologyRef);
  const resolvedOntology = path.posix.join(
    path.posix.dirname(options.codebookArtifactUri),
    codebook.ontologyRef,
  );
  if (resolvedOntology !== options.ontologyArtifactUri)
    throw new Error("BASELINE_CODEBOOK_ONTOLOGY_REF_MISMATCH");
  for (const dimension of codebook.dimensions)
    for (const indicator of dimension.indicators)
      if (!ontology.signals[indicator.inputKey])
        throw new Error(`BASELINE_CODEBOOK_UNKNOWN_ONTOLOGY_SIGNAL: ${indicator.inputKey}`);

  for (const { artifact, uri } of [
    { artifact: ontologyFile.artifact, uri: options.ontologyArtifactUri },
    { artifact: codebookFile.artifact, uri: options.codebookArtifactUri },
  ]) {
    const actual = await inspectRetainedFile(path.join(options.prepared.root, uri));
    if (actual.sha256 !== artifact.sha256 || actual.bytes !== artifact.bytes)
      throw new Error("BASELINE_METHODOLOGY_ARTIFACT_CHANGED");
  }
  const report = Object.freeze({
    schema: "hdri-baseline-methodology@1" as const,
    status: "parsed-source-bytes-not-producer-authenticated" as const,
    manifestSha256: options.prepared.manifestSha256,
    ontology: Object.freeze({
      uri: options.ontologyArtifactUri,
      sha256: ontologyFile.artifact.sha256,
      bytes: ontologyFile.artifact.bytes,
      version: ontology.version,
    }),
    codebook: Object.freeze({
      uri: options.codebookArtifactUri,
      sha256: codebookFile.artifact.sha256,
      bytes: codebookFile.artifact.bytes,
      id: codebook.id,
      version: codebook.version,
      ontologyRef: codebook.ontologyRef,
    }),
  });
  inspected.set(report, ontology);
  return report;
}

export function assertObservationMatchesBaselineMethodology(
  prepared: PreparedBaselineSource,
  methodology: BaselineMethodologyInspection,
  row: RetainedObservationSourceRow,
): void {
  assertPreparedBaselineSource(prepared);
  const ontology = inspected.get(methodology);
  if (!ontology || methodology.manifestSha256 !== prepared.manifestSha256)
    throw new Error("PROCESS_LOCAL_BASELINE_METHODOLOGY_REQUIRED");
  assertCurrentObservationSemantics(row);
  if (row.columns.ontology_version !== methodology.ontology.version)
    throw new Error("BASELINE_OBSERVATION_ONTOLOGY_VERSION_MISMATCH");
  const issues = validateObservation(
    {
      signal_path: row.payload.signal_path as string,
      value_type: row.payload.value_type as "bool" | "num" | "str" | "json",
      value_bool: row.payload.value_bool as boolean | null,
      value_num: row.payload.value_num as number | null,
      value_str: row.payload.value_str as string | null,
      value_json: row.payload.value_json as string | null,
    },
    ontology,
  );
  if (issues.length)
    throw new Error(`BASELINE_OBSERVATION_ONTOLOGY_INVALID: ${issues[0].code}`);
}
