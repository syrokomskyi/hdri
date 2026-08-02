/**
 * PII isolation invariant (WP5 groundwork).
 *
 * Q3 adds factory-side collection of Impressum names/contacts. That personal
 * data must live ONLY in the factory and must NEVER enter the observation /
 * HDRI / published-dashboard pipeline.
 *
 * TranslateOntologyGogol emits observations strictly from EXT_SIGNAL_MAP /
 * AXE_SIGNAL_MAP — any ext_* table not listed there is structurally invisible to
 * the index. These tests lock that guarantee: the contact table is never bridged,
 * and no published signal path carries person-level contact data.
 */

import { describe, expect, it } from "vitest";
import { AXE_SIGNAL_MAP, EXT_SIGNAL_MAP } from "../signal-map";

/** Factory-local tables that hold personal data and must stay out of the bridge. */
const PII_FACTORY_TABLES = ["ext_impressum_contacts"];

/** Signal-path fragments that would indicate person-level contact data leaking in. */
const PII_PATH_PATTERNS = [
  /inhaber/i,
  /geschaeftsfuehrer/i,
  /geschäftsführer/i,
  /vertreten_durch/i,
  /owner/i,
  /person.*(name|email|phone|tel)/i,
  /contact.*(name|person)/i,
  /\bvorname\b/i,
  /\bnachname\b/i,
];

describe("PII isolation: Impressum contacts never reach the index", () => {
  it("no PII factory table is bridged into observations via EXT_SIGNAL_MAP", () => {
    const bridged = EXT_SIGNAL_MAP.map((m) => m.table);
    for (const table of PII_FACTORY_TABLES) {
      expect(bridged).not.toContain(table);
    }
  });

  it("no published signal path carries person-level contact data", () => {
    const offenders: string[] = [];
    for (const m of EXT_SIGNAL_MAP) {
      if (PII_PATH_PATTERNS.some((re) => re.test(m.signalPath))) offenders.push(m.signalPath);
    }
    for (const m of AXE_SIGNAL_MAP) {
      if (PII_PATH_PATTERNS.some((re) => re.test(m.signalPath))) offenders.push(m.signalPath);
    }
    expect(offenders).toEqual([]);
  });
});
