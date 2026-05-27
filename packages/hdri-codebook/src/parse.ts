import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { Codebook } from './types.js';
import { parseSemVer } from './version.js';

// ---------------------------------------------------------------------------
// Zod schema (structural validation)
// ---------------------------------------------------------------------------

const conditionalMissingStateSchema = z.enum(['zero', 'exclude', 'skip']);

const missingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('zero') }),
  z.object({ kind: z.literal('skip') }),
  z.object({ kind: z.literal('impute'), imputedScore: z.number().min(0).max(100) }),
  z.object({
    kind: z.literal('conditional'),
    states: z.object({
      absent: conditionalMissingStateSchema.optional(),
      unreachable: conditionalMissingStateSchema.optional(),
      forbidden: conditionalMissingStateSchema.optional(),
      not_applicable: conditionalMissingStateSchema.optional(),
    }).default({}),
    default: conditionalMissingStateSchema,
  }),
]);

const ruleSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('bool'),
    trueScore: z.number().min(0).max(100),
    falseScore: z.number().min(0).max(100),
  }),
  z.object({
    type: z.literal('presence'),
    presentScore: z.number().min(0).max(100),
    absentScore: z.number().min(0).max(100),
  }),
  z.object({
    type: z.literal('countClamp'),
    min: z.number(),
    max: z.number(),
    scoreAtMin: z.number().min(0).max(100).optional(),
    scoreAtMax: z.number().min(0).max(100).optional(),
  }),
  z.object({
    type: z.literal('countClampInverse'),
    min: z.number(),
    max: z.number(),
    scoreAtMin: z.number().min(0).max(100).optional(),
    scoreAtMax: z.number().min(0).max(100).optional(),
  }),
  z.object({
    type: z.literal('enum'),
    cases: z.record(z.string(), z.number().min(0).max(100)),
    defaultScore: z.number().min(0).max(100),
  }),
]);

const sourceSchema = z.object({
  extractor: z.string().min(1),
});

const remediationSchema = z.object({
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  category: z.string().min(1),
  humanLabel: z.string().min(1),
  recommendation: z.string().min(1),
});

const indicatorSchema = z.object({
  id: z.string().min(1),
  inputKey: z.string().min(1),
  weight: z.number().positive(),
  rule: ruleSchema,
  missing: missingSchema.default({ kind: 'zero' }),
  description: z.string().optional(),
  source: sourceSchema.optional(),
  remediation: remediationSchema.optional(),
});

const dimensionSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  weight: z.number().positive(),
  indicators: z.array(indicatorSchema).min(1),
});

const codebookSchema = z.object({
  id: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'version must be MAJOR.MINOR.PATCH'),
  label: z.string().optional(),
  /** Path to the companion ontology file (informational — not loaded by the scorer). */
  ontologyRef: z.string().optional(),
  notes: z.string().optional(),
  dimensions: z.array(dimensionSchema).min(1),
});

// ---------------------------------------------------------------------------
// Semantic validation (things zod can't easily express)
// ---------------------------------------------------------------------------

const checkSemantics = (cb: Codebook): void => {
  // Dimension ids unique
  const dimIds = new Set<string>();
  for (const d of cb.dimensions) {
    if (dimIds.has(d.id)) throw new Error(`codebook: duplicate dimension id "${d.id}"`);
    dimIds.add(d.id);

    // Indicator ids unique within dimension
    const indIds = new Set<string>();
    for (const i of d.indicators) {
      const fq = `${d.id}/${i.id}`;
      if (indIds.has(i.id)) throw new Error(`codebook: duplicate indicator id "${fq}"`);
      indIds.add(i.id);

      if ((i.rule.type === 'countClamp' || i.rule.type === 'countClampInverse') && i.rule.max <= i.rule.min) {
        throw new Error(`codebook ${fq}: ${i.rule.type}.max must be > ${i.rule.type}.min`);
      }
    }
  }

  // version must parse
  parseSemVer(cb.version);
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const parseCodebook = (source: string): Codebook => {
  const raw = parseYaml(source);
  const parsed = codebookSchema.parse(raw) as Codebook;
  checkSemantics(parsed);
  return parsed;
};

/**
 * Throws a readable error if the codebook is invalid; otherwise returns it.
 * Convenience wrapper around parseCodebook that surfaces zod error summaries.
 */
export const parseCodebookOrThrow = (source: string, pathHint?: string): Codebook => {
  try {
    return parseCodebook(source);
  } catch (err) {
    const prefix = pathHint ? `[${pathHint}] ` : '';
    if (err instanceof z.ZodError) {
      const summary = err.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`${prefix}Invalid codebook:\n${summary}`);
    }
    throw new Error(`${prefix}${err instanceof Error ? err.message : String(err)}`);
  }
};
