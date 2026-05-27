/**
 * Zod schemas for ontology validation.
 *
 * These schemas validate the signal-ontology JSON file at runtime and
 * provide typed parse results.
 */

import { z } from 'zod/v4';

const signalStabilitySchema = z.enum(['high', 'medium', 'low']);

const signalMigrationSchema = z.object({
  from_version: z.string(),
  mapping: z.enum(['exact_equivalent', 'approximate', 'split', 'merged']),
  notes: z.string().optional(),
});

const signalDefinitionSchema = z.object({
  label: z.string(),
  value_type: z.enum(['bool', 'num', 'str', 'json']),
  introduced_in: z.string(),
  deprecated_in: z.string().nullable(),
  // Optional in YAML form; default to [] when omitted.
  supersedes: z.array(z.string()).default([]),
  stability: signalStabilitySchema,
  extractor: z.string().optional(),
  notes: z.string().optional(),
  migration: signalMigrationSchema.optional(),
});

export const signalOntologySchema = z.object({
  version: z.string(),
  signals: z.record(z.string(), signalDefinitionSchema),
});

export type ParsedSignalOntology = z.infer<typeof signalOntologySchema>;
