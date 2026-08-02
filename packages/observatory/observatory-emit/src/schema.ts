/*
<MODULE_CONTRACT>
<purpose>Defines and enforces runtime validation for the emit-bundle manifest to ensure data integrity between factory and observatory components.</purpose>
<non-goals>
  <item>Does not handle compile-time type checking beyond schema alignment.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of the EmitManifestSchema for runtime validation.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import type { EmitManifest } from "./types.js";

/**
 * Runtime contract for the emit-bundle manifest — the formal factory↔observatory
 * handoff. `types.ts` gives compile-time shape; this gives *runtime* enforcement so a
 * malformed or drifted bundle (a factory app that renamed a field, dropped a hash, or
 * shipped a wrong-typed count) is rejected at the boundary instead of corrupting the
 * observatory downstream. The reader validates every manifest through this schema.
 *
 * Kept deliberately in lockstep with {@link EmitManifest}: the `satisfies` check at the
 * bottom fails to compile if the two ever diverge, so the contract cannot silently rot.
 */
export const EmitManifestSchema = z
  .object({
    schema_version: z.enum(["1", "2"]),
    format: z.literal("ndjson-v1"),

    app_id: z.string().min(1),
    collector_version: z.string().min(1),
    ruleset_version: z.string().min(1),
    ontology_version: z.string().min(1),

    run_id: z.string().min(1),
    period: z.string().min(1),
    emitted_at: z.string().min(1),

    observation_count: z.number().int().nonnegative(),
    evidence_count: z.number().int().nonnegative(),
    bundle_hash: z.string().nullable(),

    asset_state_count: z.number().int().nonnegative().optional(),
    asset_states_hash: z.string().nullable().optional(),

    emit_dir: z.string().optional(),
  })
  // A non-empty observations file must carry a hash, and vice-versa: the count and the
  // integrity anchor cannot disagree, or streamObservations' verification is meaningless.
  .refine((m) => m.observation_count > 0 === (m.bundle_hash !== null), {
    message: "bundle_hash must be present iff observation_count > 0",
    path: ["bundle_hash"],
  });

// Compile-time guard: the schema output must exactly model the hand-written type.
// If EmitManifest and the schema drift, one of these assignments stops compiling.
export type EmitManifestFromSchema = z.infer<typeof EmitManifestSchema>;
const _schemaModelsType = (m: EmitManifest): EmitManifestFromSchema => m;
const _typeModelsSchema = (m: EmitManifestFromSchema): EmitManifest => m;
void _schemaModelsType;
void _typeModelsSchema;

/**
 * Parses and validates a raw manifest object, throwing a descriptive error if it does
 * not satisfy the contract. Returns the typed manifest on success.
 */
export function parseEmitManifest(raw: unknown): EmitManifest {
  return EmitManifestSchema.parse(raw) as EmitManifest;
}
