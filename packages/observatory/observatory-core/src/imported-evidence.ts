/*
<MODULE_CONTRACT>
  <purpose>Validate manifest-bound imported evidence with explicit source references and measurement quality.</purpose>
  <non-goals><item>Does not authenticate referenced bytes, decode source rows or grant collection/publication admission.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Add period-neutral converted-evidence descriptors for ordinary evidence partitions.</item></CHANGE_SUMMARY>
*/
// @ai-invariant: Unknown measurement time is never replaced by import time or admitted as a complete Observation.
import { z } from "zod";

const text = z
  .string()
  .min(1)
  .max(4096)
  .refine((value) => value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value));
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const timestamp = z.iso.datetime({ offset: true }).max(64);
const artifactRef = z
  .strictObject({
    // Relative to the explicitly authenticated closure root; never an executable locator.
    uri: text.refine(
      (value) =>
        !/[:\\]/.test(value) &&
        value.split("/").every((part) => part !== "" && part !== "." && part !== ".."),
    ),
    sha256: digest,
    bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .readonly();
const sourceRecord = z
  .strictObject({
    artifact: artifactRef,
    /** Opaque, exact source-record locator interpreted only by its audited decoder. */
    locator: text,
  })
  .readonly();
const measurement = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("observed"), measuredAt: timestamp }).readonly(),
  z
    .strictObject({ status: z.literal("time-unknown"), measuredAt: z.null(), reason: text })
    .readonly(),
  z
    .strictObject({ status: z.literal("not-observed"), measuredAt: z.null(), reason: text })
    .readonly(),
]);
const descriptor = z
  .strictObject({
    schema: z.literal("observatory-imported-evidence@1"),
    origin: z.literal("converted-evidence"),
    importedAt: timestamp,
    sourceManifest: artifactRef,
    sourceRecords: z.array(sourceRecord).min(1).max(64).readonly(),
    target: z
      .strictObject({
        kind: z.enum(["observation", "asset-state", "retained-record"]),
        assetId: z.uuid(),
        recordId: text,
        /** Digest of the exact retained target payload bytes, not a reconstructed object. */
        sha256: digest,
      })
      .readonly(),
    measurement,
  })
  .superRefine((value, ctx) => {
    const identities = new Set<string>();
    const artifacts = new Map<string, string>([
      [
        value.sourceManifest.uri,
        JSON.stringify([value.sourceManifest.sha256, value.sourceManifest.bytes]),
      ],
    ]);
    for (const [index, source] of value.sourceRecords.entries()) {
      const identity = JSON.stringify([source.artifact.uri, source.locator]);
      const bytesIdentity = JSON.stringify([source.artifact.sha256, source.artifact.bytes]);
      if (identities.has(identity))
        ctx.addIssue({
          code: "custom",
          path: ["sourceRecords", index],
          message: "Duplicate source record",
        });
      if (
        artifacts.has(source.artifact.uri) &&
        artifacts.get(source.artifact.uri) !== bytesIdentity
      )
        ctx.addIssue({
          code: "custom",
          path: ["sourceRecords", index, "artifact"],
          message: "Conflicting source artifact identity",
        });
      identities.add(identity);
      artifacts.set(source.artifact.uri, bytesIdentity);
    }
    // Current Observation requires a known observed_at. Preserve unknown/not-observed
    // rows as manifest-bound retained records; do not fabricate a complete observation.
    if (value.target.kind === "observation" && value.measurement.status !== "observed")
      ctx.addIssue({
        code: "custom",
        path: ["target", "kind"],
        message: "Incomplete measurement requires a retained-record target, not an Observation",
      });
  })
  .readonly();

export type ImportedEvidenceDescriptor = z.infer<typeof descriptor>;

/** Closed structural validation, detached/frozen output; references still require I/O verification. */
export function parseImportedEvidenceDescriptor(value: unknown): ImportedEvidenceDescriptor {
  return descriptor.parse(value);
}

/**
 * Validate claimed imports on the ordinary mixed evidence channel. Other evidence
 * kinds retain their own validators; this function does not certify them.
 */
export function parseImportedEvidenceIfClaimed(value: unknown): unknown {
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (
      record.origin === "converted-evidence" ||
      (typeof record.schema === "string" &&
        record.schema.startsWith("observatory-imported-evidence@"))
    )
      return parseImportedEvidenceDescriptor(value);
  }
  return value;
}
