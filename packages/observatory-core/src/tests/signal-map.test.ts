import { describe, expect, it } from 'vitest';
import { AXE_SIGNAL_MAP, EXT_SIGNAL_MAP, axeSignalByPath, extSignalsByTable, extSignalByPath } from '../signal-map';
import ontologyFixture from '../fixtures/signal-ontology-v1.json';
import type { SignalOntology } from '../ontology/types';

const ontology = ontologyFixture as unknown as SignalOntology;

describe('EXT_SIGNAL_MAP', () => {
  it('has no duplicate (table, column) pairs', () => {
    const keys = EXT_SIGNAL_MAP.map((m) => `${m.table}|${m.column}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has no duplicate signal paths', () => {
    const paths = EXT_SIGNAL_MAP.map((m) => m.signalPath);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('every signal path exists in the ontology fixture', () => {
    const missing: string[] = [];
    for (const mapping of EXT_SIGNAL_MAP) {
      if (!(mapping.signalPath in ontology.signals)) {
        missing.push(mapping.signalPath);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every signal path value_type matches the ontology', () => {
    const mismatched: string[] = [];
    for (const mapping of EXT_SIGNAL_MAP) {
      const signal = ontology.signals[mapping.signalPath];
      if (signal && signal.value_type !== mapping.valueType) {
        mismatched.push(
          `${mapping.signalPath}: map=${mapping.valueType}, ontology=${signal.value_type}`,
        );
      }
    }
    expect(mismatched).toEqual([]);
  });

  it('all table names start with ext_', () => {
    for (const mapping of EXT_SIGNAL_MAP) {
      expect(mapping.table).toMatch(/^ext_/);
    }
  });
});

describe('extSignalsByTable', () => {
  it('covers every distinct table in EXT_SIGNAL_MAP', () => {
    const distinctTables = new Set(EXT_SIGNAL_MAP.map((m) => m.table));
    expect(extSignalsByTable.size).toBe(distinctTables.size);
  });

  it('returns the list of mappings for a known table', () => {
    const mappings = extSignalsByTable.get('ext_impressum');
    expect(mappings).toBeDefined();
    expect(mappings!.length).toBeGreaterThanOrEqual(1);
    expect(mappings![0]!.signalPath).toBe('legal.impressum.present');
  });

  it('returns multiple mappings for ext_cookie_banner (legacy + quality)', () => {
    const mappings = extSignalsByTable.get('ext_cookie_banner');
    expect(mappings).toBeDefined();
    const paths = mappings!.map((m) => m.signalPath).sort();
    expect(paths).toEqual(['privacy.consent.banner.present', 'privacy.consent.quality']);
  });

  it('returns undefined for unknown tables', () => {
    expect(extSignalsByTable.get('nonexistent')).toBeUndefined();
  });
});

describe('extSignalByPath', () => {
  it('has one entry per signal_path (no duplicates)', () => {
    expect(extSignalByPath.size).toBe(EXT_SIGNAL_MAP.length);
  });

  it('returns the mapping for a known signal_path', () => {
    const mapping = extSignalByPath.get('privacy.consent.quality');
    expect(mapping).toBeDefined();
    expect(mapping!.column).toBe('quality');
  });
});

describe('AXE_SIGNAL_MAP', () => {
  it('has no duplicate source columns', () => {
    const columns = AXE_SIGNAL_MAP.map((m) => m.column);
    expect(new Set(columns).size).toBe(columns.length);
  });

  it('every signal path exists in the ontology fixture', () => {
    const missing: string[] = [];
    for (const mapping of AXE_SIGNAL_MAP) {
      if (!(mapping.signalPath in ontology.signals)) {
        missing.push(mapping.signalPath);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every signal path value_type matches the ontology', () => {
    const mismatched: string[] = [];
    for (const mapping of AXE_SIGNAL_MAP) {
      const signal = ontology.signals[mapping.signalPath];
      if (signal && signal.value_type !== mapping.valueType) {
        mismatched.push(
          `${mapping.signalPath}: map=${mapping.valueType}, ontology=${signal.value_type}`,
        );
      }
    }
    expect(mismatched).toEqual([]);
  });
});

describe('axeSignalByPath', () => {
  it('has one entry per AXE signal path', () => {
    expect(axeSignalByPath.size).toBe(AXE_SIGNAL_MAP.length);
  });

  it('returns the mapping for a known AXE signal path', () => {
    const mapping = axeSignalByPath.get('audit.axe.violations.total.count');
    expect(mapping).toBeDefined();
    expect(mapping!.column).toBe('violations_total');
  });
});
