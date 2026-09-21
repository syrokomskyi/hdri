import { describe, expect, it } from "vitest";

import { createSignalMap, EXT_SIGNAL_MAP, AXE_SIGNAL_MAP } from "../signal-map.js";
import ontologyFixture from "../fixtures/signal-ontology-v1.json";
import type { SignalOntology } from "../ontology/types.js";

const ontology = ontologyFixture as unknown as SignalOntology;

describe("createSignalMap", () => {
  it("returns a validated SignalMap when all entries match the ontology", () => {
    const map = createSignalMap(ontology);
    expect(map.extByTable.size).toBeGreaterThan(0);
    expect(map.extByPath.size).toBe(EXT_SIGNAL_MAP.length);
    expect(map.axeByPath.size).toBe(AXE_SIGNAL_MAP.length);
  });

  it("throws when a signal path is not in the ontology", () => {
    const broken: SignalOntology = {
      ...ontology,
      signals: { ...ontology.signals },
    };
    // Remove a signal that IS referenced by EXT_SIGNAL_MAP
    delete (broken.signals as Record<string, unknown>)["legal.impressum.present"];

    expect(() => createSignalMap(broken)).toThrow(/unknown_signal/);
  });

  it("throws when a value type mismatches the ontology", () => {
    const broken: SignalOntology = {
      ...ontology,
      signals: { ...ontology.signals },
    };
    // Flip the value type of a signal that IS in EXT_SIGNAL_MAP
    (broken.signals as Record<string, { value_type: string }>)[
      "legal.impressum.present"
    ]!.value_type = "json";

    expect(() => createSignalMap(broken)).toThrow(/value_type_mismatch/);
  });

  it("accumulates all issues before throwing", () => {
    const broken: SignalOntology = {
      version: ontology.version,
      signals: {},
    };

    expect(() => createSignalMap(broken)).toThrow(/createSignalMap: \d+ issue\(s\)/);
  });
});
