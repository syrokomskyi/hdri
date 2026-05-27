import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCodebook, parseCodebookOrThrow } from '../parse.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(here, '../fixtures/engine-test-fixture.yaml');
const fixtureYaml = fs.readFileSync(fixturePath, 'utf-8');

describe('parseCodebook', () => {
  it('parses the minimal fixture', () => {
    const cb = parseCodebook(fixtureYaml);
    expect(cb.id).toBe('hdri-demo-v1');
    expect(cb.version).toBe('2.1.0');
    expect(cb.dimensions).toHaveLength(4);
    expect(cb.dimensions[0]?.id).toBe('compliance');
  });

  it('defaults missing policy to zero', () => {
    const yaml = `
id: test
version: "1.0.0"
dimensions:
  - id: d1
    weight: 1
    indicators:
      - id: i1
        inputKey: foo
        weight: 1
        rule: { type: bool, trueScore: 100, falseScore: 0 }
`;
    const cb = parseCodebook(yaml);
    expect(cb.dimensions[0]?.indicators[0]?.missing).toEqual({ kind: 'zero' });
  });

  it('rejects malformed version', () => {
    const yaml = `
id: test
version: "1.0"
dimensions:
  - id: d1
    weight: 1
    indicators:
      - id: i1
        inputKey: foo
        weight: 1
        rule: { type: bool, trueScore: 100, falseScore: 0 }
`;
    expect(() => parseCodebook(yaml)).toThrow();
  });

  it('rejects duplicate dimension ids (semantic)', () => {
    const yaml = `
id: test
version: "1.0.0"
dimensions:
  - id: d1
    weight: 1
    indicators:
      - { id: i1, inputKey: a, weight: 1, rule: { type: bool, trueScore: 100, falseScore: 0 } }
  - id: d1
    weight: 1
    indicators:
      - { id: i1, inputKey: b, weight: 1, rule: { type: bool, trueScore: 100, falseScore: 0 } }
`;
    expect(() => parseCodebook(yaml)).toThrow(/duplicate dimension/);
  });

  it('rejects countClamp with max <= min', () => {
    const yaml = `
id: test
version: "1.0.0"
dimensions:
  - id: d1
    weight: 1
    indicators:
      - id: i1
        inputKey: n
        weight: 1
        rule: { type: countClamp, min: 5, max: 5 }
`;
    expect(() => parseCodebook(yaml)).toThrow();
  });

  it('accepts countClampInverse', () => {
    const yaml = `
id: test
version: "1.0.0"
dimensions:
  - id: d1
    weight: 1
    indicators:
      - id: i1
        inputKey: n
        weight: 1
        rule: { type: countClampInverse, min: 0, max: 5 }
`;
    const cb = parseCodebook(yaml);
    expect(cb.dimensions[0]?.indicators[0]?.rule.type).toBe('countClampInverse');
  });

  it('rejects countClampInverse with max <= min', () => {
    const yaml = `
id: test
version: "1.0.0"
dimensions:
  - id: d1
    weight: 1
    indicators:
      - id: i1
        inputKey: n
        weight: 1
        rule: { type: countClampInverse, min: 3, max: 3 }
`;
    expect(() => parseCodebook(yaml)).toThrow();
  });

  it('parseCodebookOrThrow produces a readable summary on zod failure', () => {
    const yaml = `
id: ""
version: "1.0.0"
dimensions: []
`;
    expect(() => parseCodebookOrThrow(yaml, 'bad.yaml')).toThrow(/bad\.yaml.*Invalid codebook/s);
  });
});
