/**
 * Ontology loader — parses YAML or JSON ontology source into a typed SignalOntology.
 *
 * Two ontology source formats are supported:
 *   - JSON (legacy fixtures, e.g. signal-ontology-v1.json)
 *   - YAML (authoring format, e.g. apps/digital-observatory/.input/ontology.yaml)
 *
 * Both share the same Zod schema; the loader auto-detects format by the leading
 * non-whitespace character ('{' / '[' = JSON, otherwise YAML).
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod/v4';
import { signalOntologySchema, type ParsedSignalOntology } from './schema.js';
import type { SignalOntology } from './types.js';

const isJsonSource = (source: string): boolean => {
  const trimmed = source.trimStart();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
};

/**
 * Parses an ontology document (JSON or YAML) into a typed SignalOntology.
 * Throws with a readable error summary on validation failure.
 */
export const parseOntology = (source: string, pathHint?: string): SignalOntology => {
  const raw = isJsonSource(source) ? JSON.parse(source) : parseYaml(source);
  try {
    const parsed = signalOntologySchema.parse(raw) as ParsedSignalOntology;
    return parsed as unknown as SignalOntology;
  } catch (err) {
    const prefix = pathHint ? `[${pathHint}] ` : '';
    if (err instanceof z.ZodError) {
      const summary = err.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`${prefix}Invalid ontology:\n${summary}`);
    }
    throw new Error(`${prefix}${err instanceof Error ? err.message : String(err)}`);
  }
};

/** Reads and parses an ontology file from disk by extension/content. */
export const readOntologyFile = async (filePath: string): Promise<SignalOntology> => {
  const source = await fsp.readFile(filePath, 'utf-8');
  return parseOntology(source, path.basename(filePath));
};
