/**
 * Integration tests for ScoreHdriGogol core logic.
 *
 * Tests codebook validation, buildAssetBundles aggregation,
 * and computationHash with real observation IDs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { scoreSite, parseCodebookOrThrow, type SiteSignals, type Codebook } from '@org/hdri-codebook';
import { computationHash, deriveAssetId, readOntologyFile, type SignalOntology } from '@org/observatory-core';
import type { SignalCollectionStatus } from '@org/observatory-core';
import { createJsonLogger } from '@org/pipeline-core';

// ── Fixtures ────────────────────────────────────────────────────────────────

const CODEBOOK_PATH = path.resolve(__dirname, '..', '..', '.input', 'codebook.yaml');
const FACTORY_ONTOLOGY_PATH = path.resolve(
  __dirname, '..', '..', '..', 'hdri-factory', 'a-contract-ontology', '.input', 'ontology.yaml',
);

// ── Helpers ─────────────────────────────────────────────────────────────────

type ObsRow = {
  id: string;
  asset_id: string;
  signal_path: string;
  value_bool: number | null;
  value_num: number | null;
  value_str: string | null;
  value_json: string | null;
  value_type: string;
  collection_status: string | null;
  extractor_version: string | null;
};

type SignalValueType = number | boolean | string | null;

type AssetSignalBundle = {
  signals: Record<string, SignalValueType>;
  statuses: Record<string, SignalCollectionStatus>;
  observationIds: string[];
  actualExtractors: Record<string, string | null>;
};

const CONDITIONAL_STATUSES = new Set<SignalCollectionStatus>([
  'absent', 'unreachable', 'forbidden', 'not_applicable',
]);

/**
 * Replica of ScoreHdriGogol.buildAssetBundles — groups observation rows
 * into per-asset signal bundles.
 */
function buildAssetBundles(rows: ObsRow[]): Map<string, AssetSignalBundle> {
  const map = new Map<string, AssetSignalBundle>();

  for (const row of rows) {
    let bundle = map.get(row.asset_id);
    if (!bundle) {
      bundle = {
        signals: {} as Record<string, SignalValueType>,
        statuses: {} as Record<string, SignalCollectionStatus>,
        observationIds: [],
        actualExtractors: {},
      } as AssetSignalBundle;
      map.set(row.asset_id, bundle);
    }

    let value: SignalValueType = null;
    switch (row.value_type) {
      case 'bool':
        value = row.value_bool != null ? row.value_bool === 1 : null;
        break;
      case 'num':
        value = row.value_num;
        break;
      case 'str':
        value = row.value_str;
        break;
      case 'json':
        value = row.value_json;
        break;
    }

    (bundle.signals as Record<string, SignalValueType>)[row.signal_path] = value;
    bundle.observationIds.push(row.id);
    bundle.actualExtractors[row.signal_path] = row.extractor_version;

    if (row.collection_status && CONDITIONAL_STATUSES.has(row.collection_status as SignalCollectionStatus)) {
      (bundle.statuses as Record<string, SignalCollectionStatus>)[row.signal_path] = row.collection_status as SignalCollectionStatus;
    }
  }

  return map;
}

/**
 * Replica of ScoreHdriGogol.crossValidateCodebookAgainstOntology.
 */
function crossValidateCodebook(codebook: Codebook, ontology: SignalOntology): void {
  const unknown: string[] = [];
  const deprecated: string[] = [];

  for (const dim of codebook.dimensions) {
    for (const ind of dim.indicators) {
      const def = ontology.signals[ind.inputKey];
      if (!def) {
        unknown.push(`${dim.id}/${ind.id} → "${ind.inputKey}"`);
        continue;
      }
      if (def.deprecated_in != null) {
        deprecated.push(`${dim.id}/${ind.id} → "${ind.inputKey}" (deprecated_in v${def.deprecated_in})`);
      }
    }
  }

  if (unknown.length > 0) {
    throw new Error(
      `Codebook references signals not in ontology:\n  ` + unknown.join('\n  '),
    );
  }

  if (deprecated.length > 0) {
    const log = createJsonLogger({ app: 'digital-observatory', gogol: 'score-hdri-test' });
    log.warn('deprecated-signals', `${deprecated.length} deprecated signal(s) in codebook`, { deprecatedCount: deprecated.length, deprecatedSignals: deprecated });
  }
}

function buildIndicatorIndex(codebook: Codebook): Map<string, { remediation?: unknown; source?: { extractor?: string } }> {
  const idx = new Map<string, { remediation?: unknown; source?: { extractor?: string } }>();
  for (const dim of codebook.dimensions) {
    for (const ind of dim.indicators) {
      idx.set(`${dim.id}/${ind.id}`, { remediation: ind.remediation, source: ind.source });
    }
  }
  return idx;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ScoreHdri — buildAssetBundles', () => {
  it('groups observations by asset_id', () => {
    const assetA = deriveAssetId('alpha.de');
    const assetB = deriveAssetId('beta.de');
    const rows: ObsRow[] = [
      { id: 'obs-1', asset_id: assetA, signal_path: 'legal.impressum.present', value_bool: 1, value_num: null, value_str: null, value_json: null, value_type: 'bool', collection_status: null, extractor_version: 'v1' },
      { id: 'obs-2', asset_id: assetA, signal_path: 'legal.datenschutz.present', value_bool: 0, value_num: null, value_str: null, value_json: null, value_type: 'bool', collection_status: null, extractor_version: 'v1' },
      { id: 'obs-3', asset_id: assetB, signal_path: 'legal.impressum.present', value_bool: 1, value_num: null, value_str: null, value_json: null, value_type: 'bool', collection_status: null, extractor_version: 'v2' },
    ];

    const bundles = buildAssetBundles(rows);
    expect(bundles.size).toBe(2);

    const aBundle = bundles.get(assetA)!;
    expect(aBundle.signals['legal.impressum.present']).toBe(true);
    expect(aBundle.signals['legal.datenschutz.present']).toBe(false);
    expect(aBundle.observationIds).toEqual(['obs-1', 'obs-2']);
    expect(aBundle.actualExtractors['legal.impressum.present']).toBe('v1');

    const bBundle = bundles.get(assetB)!;
    expect(bBundle.signals['legal.impressum.present']).toBe(true);
    expect(bBundle.actualExtractors['legal.impressum.present']).toBe('v2');
  });

  it('handles all value types', () => {
    const assetId = deriveAssetId('gamma.de');
    const rows: ObsRow[] = [
      { id: 'o1', asset_id: assetId, signal_path: 'test.bool', value_bool: 1, value_num: null, value_str: null, value_json: null, value_type: 'bool', collection_status: null, extractor_version: null },
      { id: 'o2', asset_id: assetId, signal_path: 'test.num', value_bool: null, value_num: 42, value_str: null, value_json: null, value_type: 'num', collection_status: null, extractor_version: null },
      { id: 'o3', asset_id: assetId, signal_path: 'test.str', value_bool: null, value_num: null, value_str: 'hello', value_json: null, value_type: 'str', collection_status: null, extractor_version: null },
      { id: 'o4', asset_id: assetId, signal_path: 'test.json', value_bool: null, value_num: null, value_str: null, value_json: '{"a":1}', value_type: 'json', collection_status: null, extractor_version: null },
    ];

    const bundles = buildAssetBundles(rows);
    const bundle = bundles.get(assetId)!;
    expect(bundle.signals['test.bool']).toBe(true);
    expect(bundle.signals['test.num']).toBe(42);
    expect(bundle.signals['test.str']).toBe('hello');
    expect(bundle.signals['test.json']).toBe('{"a":1}');
  });

  it('populates collection statuses for conditional signals', () => {
    const assetId = deriveAssetId('delta.de');
    const rows: ObsRow[] = [
      { id: 'o1', asset_id: assetId, signal_path: 'content.opening_hours.present', value_bool: null, value_num: null, value_str: null, value_json: null, value_type: 'bool', collection_status: 'unreachable', extractor_version: null },
      { id: 'o2', asset_id: assetId, signal_path: 'legal.impressum.present', value_bool: 1, value_num: null, value_str: null, value_json: null, value_type: 'bool', collection_status: null, extractor_version: null },
    ];

    const bundles = buildAssetBundles(rows);
    const bundle = bundles.get(assetId)!;
    expect(bundle.statuses['content.opening_hours.present']).toBe('unreachable');
    expect(bundle.statuses['legal.impressum.present']).toBeUndefined();
  });

  it('records actualExtractors per signal_path', () => {
    const assetId = deriveAssetId('epsilon.de');
    const rows: ObsRow[] = [
      { id: 'o1', asset_id: assetId, signal_path: 'legal.impressum.present', value_bool: 1, value_num: null, value_str: null, value_json: null, value_type: 'bool', collection_status: null, extractor_version: 'extractor_v2' },
    ];

    const bundles = buildAssetBundles(rows);
    const bundle = bundles.get(assetId)!;
    expect(bundle.actualExtractors['legal.impressum.present']).toBe('extractor_v2');
  });
});

describe('ScoreHdri — codebook cross-validation', () => {
  // Skip ontology-dependent tests if no ontology file is available.
  let ontology: SignalOntology | null = null;

  beforeAll(async () => {
    for (const p of [FACTORY_ONTOLOGY_PATH]) {
      try {
        if (fs.existsSync(p)) {
          ontology = await readOntologyFile(p) as SignalOntology;
          return;
        }
      } catch { /* try next */ }
    }
  });

  it('validates codebook inputKeys against ontology', async () => {
    if (!ontology) return;

    const codebook = parseCodebookOrThrow(
      fs.readFileSync(CODEBOOK_PATH, 'utf-8'),
      CODEBOOK_PATH,
    );

    // Should not throw — all codebook inputKeys should be in the ontology
    expect(() => crossValidateCodebook(codebook, ontology!)).not.toThrow();
  });

  it('throws on unknown signal in codebook', () => {
    const codebook = parseCodebookOrThrow(
      fs.readFileSync(CODEBOOK_PATH, 'utf-8'),
      CODEBOOK_PATH,
    );

    // Create an ontology missing all codebook signals
    const minimalOntology: SignalOntology = {
      version: '1.0.0',
      signals: {},
    };

    expect(() => crossValidateCodebook(codebook, minimalOntology)).toThrow(
      /signal.*not in ontology/,
    );
  });

  it('identifies deprecated signals', async () => {
    if (!ontology) return;

    // Inject a deprecated marker into the ontology for a known signal
    const knownSignal = 'legal.impressum.present';
    const def = ontology!.signals[knownSignal];
    if (!def) return;

    const patched: SignalOntology = {
      ...ontology!,
      signals: {
        ...ontology!.signals,
        [knownSignal]: { ...def, deprecated_in: '2.0.0' },
      },
    };

    const codebook = parseCodebookOrThrow(
      fs.readFileSync(CODEBOOK_PATH, 'utf-8'),
      CODEBOOK_PATH,
    );

    // Should not throw, only warn
    expect(() => crossValidateCodebook(codebook, patched)).not.toThrow();
  });
});

describe('ScoreHdri — scoring with real codebook', () => {
  it('scores an asset with complete signals', () => {
    const codebook = parseCodebookOrThrow(
      fs.readFileSync(CODEBOOK_PATH, 'utf-8'),
      CODEBOOK_PATH,
    );

    const signals: SiteSignals = {
      'legal.impressum.present': true,
      'legal.datenschutz.present': true,
      'legal.agb.present': true,
      'legal.bfsg.present': false,
      'legal.widerruf.present': false,
      'legal.versand.present': false,
      'privacy.consent.banner.present': true,
      'contact.form.present': true,
      'content.opening_hours.present': true,
      'content.map.present': true,
      'content.team_page.present': false,
      'content.portfolio.present': true,
      'content.testimonials.present': false,
      'structured_data.schema_org.local_business.present': true,
      'structured_data.schema_org.faq.present': false,
      'structured_data.schema_org.review.present': false,
      'structured_data.schema_org.service.present': false,
      'structured_data.schema_org.breadcrumb.present': true,
      'structured_data.schema_org.product.present': false,
      'trust.certifications.present': true,
      'trust.certification.meister.present': false,
      'trust.awards.present': false,
      'trust.memberships.present': true,
      'registry.handelsregister.present': false,
      'registry.google_business.present': true,
      'social.facebook.present': true,
      'social.instagram.present': false,
      'social.youtube.present': true,
      'social.linkedin.present': false,
      'social.tiktok.present': false,
      'social.whatsapp.present': true,
      'social.xing.present': false,
    };

    const result = scoreSite(signals, codebook);
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.dimensions.length).toBe(5);
    expect(result.trace.length).toBeGreaterThan(0);
  });

  it('scores an asset with minimal signals', () => {
    const codebook = parseCodebookOrThrow(
      fs.readFileSync(CODEBOOK_PATH, 'utf-8'),
      CODEBOOK_PATH,
    );

    // No signals provided — all indicators fall back to their missing.kind policy
    const signals: SiteSignals = {};
    const result = scoreSite(signals, codebook);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(typeof result.confidence).toBe('number');
  });

  it('produces different scores for different signal sets', () => {
    const codebook = parseCodebookOrThrow(
      fs.readFileSync(CODEBOOK_PATH, 'utf-8'),
      CODEBOOK_PATH,
    );

    const highSignals: SiteSignals = {
      'legal.impressum.present': true,
      'legal.datenschutz.present': true,
      'privacy.consent.banner.present': true,
      'contact.form.present': true,
      'structured_data.schema_org.local_business.present': true,
      'social.facebook.present': true,
    };

    const lowSignals: SiteSignals = {
      'legal.impressum.present': false,
      'legal.datenschutz.present': false,
      'privacy.consent.banner.present': false,
    };

    const high = scoreSite(highSignals, codebook);
    const low = scoreSite(lowSignals, codebook);

    expect(high.overallScore).toBeGreaterThan(low.overallScore ?? 0);
  });
});

describe('ScoreHdri — computationHash with real IDs', () => {
  it('is deterministic for the same IDs', () => {
    const h1 = computationHash('1.0.0', ['obs-a', 'obs-b', 'obs-c']);
    const h2 = computationHash('1.0.0', ['obs-a', 'obs-b', 'obs-c']);
    expect(h1).toBe(h2);
  });

  it('is unaffected by ID order', () => {
    const h1 = computationHash('1.0.0', ['obs-a', 'obs-b', 'obs-c']);
    const h2 = computationHash('1.0.0', ['obs-c', 'obs-a', 'obs-b']);
    expect(h1).toBe(h2);
  });

  it('changes when version changes', () => {
    const h1 = computationHash('1.0.0', ['obs-a', 'obs-b']);
    const h2 = computationHash('2.0.0', ['obs-a', 'obs-b']);
    expect(h1).not.toBe(h2);
  });

  it('uses real UUID observation IDs', () => {
    // Generate real UUID-like observation IDs
    const obsIds = Array.from({ length: 5 }, () => {
      const hex = '0123456789abcdef';
      let id = '';
      for (let i = 0; i < 36; i++) id += hex[Math.floor(Math.random() * 16)];
      return id;
    });

    const hash = computationHash('1.0.0', obsIds);
    expect(hash).toBeTruthy();
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('links score to specific observations (hash changes when obs IDs change)', () => {
    const obsSet1 = ['obs-001', 'obs-002', 'obs-003'];
    const obsSet2 = ['obs-001', 'obs-002', 'obs-004'];

    const h1 = computationHash('1.0.0', obsSet1);
    const h2 = computationHash('1.0.0', obsSet2);
    expect(h1).not.toBe(h2);
  });
});

describe('ScoreHdri — indicator index', () => {
  it('builds lookup from dimension/indicator pairs', () => {
    const codebook = parseCodebookOrThrow(
      fs.readFileSync(CODEBOOK_PATH, 'utf-8'),
      CODEBOOK_PATH,
    );

    const idx = buildIndicatorIndex(codebook);
    expect(idx.get('legal_compliance/impressum')).toBeDefined();
    expect(idx.get('legal_compliance/datenschutz')).toBeDefined();
    expect(idx.get('social_presence/facebook')).toBeDefined();
    expect(idx.get('nonexistent/key')).toBeUndefined();
  });
});

describe('ScoreHdri — indicator trace enrichment', () => {
  it('populates declared_extractor from codebook indicator source', () => {
    const codebook = parseCodebookOrThrow(
      fs.readFileSync(CODEBOOK_PATH, 'utf-8'),
      CODEBOOK_PATH,
    );

    const idx = buildIndicatorIndex(codebook);
    const impressum = idx.get('legal_compliance/impressum');
    // The fixture codebook has no source.extractor — expect undefined
    expect(impressum?.source?.extractor).toBeUndefined();
  });

  it('records actual_extractor from observation rows', () => {
    const assetId = deriveAssetId('zeta.de');
    const rows: ObsRow[] = [
      { id: 'o1', asset_id: assetId, signal_path: 'legal.impressum.present', value_bool: 1, value_num: null, value_str: null, value_json: null, value_type: 'bool', collection_status: null, extractor_version: 'rule_v3' },
    ];

    const bundles = buildAssetBundles(rows);
    const bundle = bundles.get(assetId)!;
    expect(bundle.actualExtractors['legal.impressum.present']).toBe('rule_v3');
  });
});
