/**
 * Smoke test: verifies the pipeline definition loads correctly,
 * all 4 phases resolve, and gogol ordering matches expectations.
 */

import { describe, it, expect } from 'vitest';
import { createPipeline } from '../pipeline';
import { parseBriefMarkdown } from '../brief';

describe('Pipeline assembly', () => {
  it('creates a pipeline with all phases and gogols', () => {
    const pipeline = createPipeline();

    expect(pipeline.title).toBeTruthy();
    expect(pipeline.steps.length).toBeGreaterThan(0);
  });

  it('has correct gogol order across phases', () => {
    const pipeline = createPipeline();
    const ids = pipeline.steps.map((s) => s.id);

    // harvest phase
    expect(ids).toContain('setup-observatory-run');

    // observe phase
    expect(ids).toContain('sync-from-factory');
    expect(ids).toContain('sign-observations');
    expect(ids).toContain('mint-asset-ids');

    // interpret phase
    expect(ids).toContain('score-hdri');
    expect(ids).toContain('build-cohorts');

    // publish phase
    expect(ids).toContain('write-vault');
    expect(ids).toContain('export-mart');

    // Order: harvest → observe → interpret → publish
    expect(ids.indexOf('setup-observatory-run')).toBeLessThan(ids.indexOf('sync-from-factory'));
    expect(ids.indexOf('sync-from-factory')).toBeLessThan(ids.indexOf('sign-observations'));
    expect(ids.indexOf('sign-observations')).toBeLessThan(ids.indexOf('score-hdri'));
    expect(ids.indexOf('score-hdri')).toBeLessThan(ids.indexOf('build-cohorts'));
    expect(ids.indexOf('build-cohorts')).toBeLessThan(ids.indexOf('write-vault'));
    expect(ids.indexOf('write-vault')).toBeLessThan(ids.indexOf('export-mart'));
  });

  it('has exactly 8 gogols', () => {
    const pipeline = createPipeline();
    expect(pipeline.steps.length).toBe(8);
  });
});

describe('Brief parsing', () => {
  it('parses a valid brief', () => {
    const brief = parseBriefMarkdown(`---
outputLanguage: de
period: "2025-Q2"
ontologyVersion: "1.0.0"
codebookVersion: "observatory-v1.0.0"
sourceDbDir: "../hdri-factory/0-harvest-source/.output"
publicMode: false
skipGogols: []
---

Digital Observatory run brief.
`);

    expect(brief.outputLanguage).toBe('de');
    expect(brief.period).toBe('2025-q2');
    expect(brief.ontologyVersion).toBe('1.0.0');
    expect(brief.codebookVersion).toBe('observatory-v1.0.0');
    expect(brief.publicMode).toBe(false);
    expect(brief.skipGogols).toEqual([]);
  });

  it('throws on missing outputLanguage', () => {
    expect(() =>
      parseBriefMarkdown(`---
period: "2025-Q2"
---
`),
    ).toThrow('outputLanguage');
  });

  it('throws on missing period', () => {
    expect(() =>
      parseBriefMarkdown(`---
outputLanguage: de
---
`),
    ).toThrow('period');
  });

  it('uses defaults for optional fields', () => {
    const brief = parseBriefMarkdown(`---
outputLanguage: de
period: "2025-Q2"
---
`);
    expect(brief.ontologyVersion).toBe('1.0.0');
    expect(brief.codebookVersion).toBe('hdri-v1.0.0');
    expect(brief.sourceDbDir).toBe('');
    expect(brief.publicMode).toBe(false);
  });
});
