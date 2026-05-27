import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { signalOntologySchema } from '../ontology/schema.js';

const FIXTURE_PATH = resolve(
  import.meta.dirname,
  '../fixtures/signal-ontology-v1.json',
);

describe('signalOntologySchema', () => {
  it('parses the v1 fixture ontology file without errors', () => {
    const raw = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));
    const result = signalOntologySchema.safeParse(raw);
    if (!result.success) {
      console.error(result.error.issues);
    }
    expect(result.success).toBe(true);
  });

  it('rejects invalid ontology (missing version)', () => {
    const result = signalOntologySchema.safeParse({ signals: {} });
    expect(result.success).toBe(false);
  });

  it('rejects invalid signal definition (bad value_type)', () => {
    const result = signalOntologySchema.safeParse({
      version: '1.0.0',
      signals: {
        'test.signal': {
          label: 'Test',
          value_type: 'invalid_type',
          introduced_in: '1.0.0',
          deprecated_in: null,
          supersedes: [],
          stability: 'high',
        },
      },
    });
    expect(result.success).toBe(false);
  });
});
