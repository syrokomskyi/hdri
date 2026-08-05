/*
<MODULE_CONTRACT>
<purpose>Validates partitioned emit manifests at the Factory-to-Observatory boundary.</purpose>
<non-goals><item>Does not read partition bytes.</item></non-goals>
</MODULE_CONTRACT>
*/

import { z } from "zod";
import type { EmitManifest } from "./types.js";

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const partition = (kind: "observations" | "asset-states" | "evidence") => z.object({
  uri: z.string().regex(new RegExp(`^${kind}/part-\\d{6}\\.ndjson$`)),
  row_count: z.number().int().positive(),
  sha256,
});

export const EmitManifestSchema = z.object({
  schema_version: z.literal("3"),
  format: z.literal("ndjson-partitioned-v1"),
  app_id: z.string().min(1),
  collector_version: z.string().min(1),
  ruleset_version: z.string().min(1),
  ontology_version: z.string().min(1),
  run_id: z.string().min(1),
  period: z.string().regex(/^\d{4}-q[1-4]$/),
  emitted_at: z.string().datetime(),
  partition_rows: z.number().int().min(1_000).max(1_000_000),
  observation_count: z.number().int().nonnegative(),
  observation_partitions: z.array(partition("observations")),
  evidence_count: z.number().int().nonnegative(),
  evidence_partitions: z.array(partition("evidence")),
  evidence_hash: sha256.nullable(),
  bundle_hash: sha256.nullable(),
  asset_state_count: z.number().int().nonnegative(),
  asset_state_partitions: z.array(partition("asset-states")),
  asset_states_hash: sha256.nullable(),
}).superRefine((manifest, ctx) => {
  const observationRows = manifest.observation_partitions.reduce((sum, part) => sum + part.row_count, 0);
  const stateRows = manifest.asset_state_partitions.reduce((sum, part) => sum + part.row_count, 0);
  const evidenceRows = manifest.evidence_partitions.reduce((sum, part) => sum + part.row_count, 0);
  if (observationRows !== manifest.observation_count) ctx.addIssue({ code: "custom", message: "observation partition counts do not reconcile" });
  if (stateRows !== manifest.asset_state_count) ctx.addIssue({ code: "custom", message: "asset-state partition counts do not reconcile" });
  if (evidenceRows !== manifest.evidence_count) ctx.addIssue({ code: "custom", message: "evidence partition counts do not reconcile" });
  if ((manifest.observation_count > 0) !== (manifest.bundle_hash !== null)) ctx.addIssue({ code: "custom", message: "bundle_hash presence does not reconcile" });
  if ((manifest.asset_state_count > 0) !== (manifest.asset_states_hash !== null)) ctx.addIssue({ code: "custom", message: "asset_states_hash presence does not reconcile" });
  if ((manifest.evidence_count > 0) !== (manifest.evidence_hash !== null)) ctx.addIssue({ code: "custom", message: "evidence_hash presence does not reconcile" });
});

export type EmitManifestFromSchema = z.infer<typeof EmitManifestSchema>;
const _schemaModelsType = (manifest: EmitManifest): EmitManifestFromSchema => manifest;
const _typeModelsSchema = (manifest: EmitManifestFromSchema): EmitManifest => manifest;
void _schemaModelsType;
void _typeModelsSchema;

export const parseEmitManifest = (raw: unknown): EmitManifest => EmitManifestSchema.parse(raw) as EmitManifest;
