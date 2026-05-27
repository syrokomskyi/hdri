/**
 * Signal Ontology types.
 *
 * The ontology is a versioned dictionary of semantic signal paths. It is the
 * contract between collectors (who emit observations) and consumers (who
 * score, aggregate, visualise). A signal path encodes meaning, not platform.
 */

import type { ObservationValueType } from '../types.js';

/** Stability rating for long-term signal relevance. */
export type SignalStability = 'high' | 'medium' | 'low';

/** Migration descriptor for renamed/superseded signal paths. */
export type SignalMigration = {
  readonly from_version: string;
  readonly mapping: 'exact_equivalent' | 'approximate' | 'split' | 'merged';
  readonly notes?: string;
};

/** A single signal definition in the ontology. */
export type SignalDefinition = {
  readonly label: string;
  readonly value_type: ObservationValueType;
  /** Ontology version where this signal was first introduced. */
  readonly introduced_in: string;
  /** Ontology version where this signal was deprecated (null = active). */
  readonly deprecated_in: string | null;
  /** Legacy signal names this path supersedes. */
  readonly supersedes: readonly string[];
  readonly stability: SignalStability;
  /**
   * Logical extractor identifier (e.g. "rule_v3", "dom_css_v2", "json_ld_v1").
   * Declares which extraction method is expected to produce this signal.
   * Used for provenance cross-checks against actual `extractor_version` in observations.
   */
  readonly extractor?: string;
  readonly notes?: string;
  readonly migration?: SignalMigration;
};

/** Top-level ontology document. */
export type SignalOntology = {
  readonly version: string;
  readonly signals: Readonly<Record<string, SignalDefinition>>;
};
