/*
<MODULE_CONTRACT>
<purpose>Defines and manages maturity bands, codebook dimensions, and site metadata for digital presence evaluation.</purpose>
<non-goals>
  <item>Does not handle data persistence or external API interactions.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of maturity bands and site metadata retrieval.</item>
</CHANGE_SUMMARY>
*/

import { loadCodebook, loadCurrentPeriod } from "./dashboard-data";
import latest from "../assets/data/public/latest.json";

export type MaturityBand = {
  id: string;
  range: string;
  meaning: string;
};

export const MATURITY_BANDS: MaturityBand[] = [
  {
    id: "kritisch",
    range: "0 – <20",
    meaning: "Kritische Mängel, fundamentale Anforderungen nicht erfüllt",
  },
  {
    id: "basis",
    range: "20 – <40",
    meaning: "Grundlegende Anforderungen überwiegend erfüllt",
  },
  {
    id: "aufbau",
    range: "40 – <60",
    meaning: "Fortgeschrittene Maßnahmen teilweise umgesetzt",
  },
  {
    id: "fortgeschritten",
    range: "60 – <80",
    meaning: "Moderne Best Practices weitgehend implementiert",
  },
  {
    id: "vorbild",
    range: "80 – 100",
    meaning: "Hervorragende digitale Präsenz, Best-Practice-Niveau",
  },
];

export const MATURITY_THRESHOLDS = [20, 40, 60, 80] as const;

export const DIM_DE_LABELS: Record<string, string> = {
  legal_compliance: "Recht & Pflichtangaben",
  contact_accessibility: "Kontakt & Erreichbarkeit",
  structured_data: "Strukturierte Informationen",
  accessibility_audit: "Barrierefreiheit",
  trust_signals: "Vertrauen & Nachweise",
  social_presence: "Soziale Präsenz",
};

const DIM_DE_SHORT: Record<string, string> = {
  legal_compliance: "Recht",
  contact_accessibility: "Kontakt",
  structured_data: "Strukturiert",
  accessibility_audit: "Barrierefreiheit",
  trust_signals: "Vertrauen",
  social_presence: "Sozial",
};

export type CodebookDimension = {
  id: string;
  label: string;
  weight: number;
  indicators: Array<{
    id: string;
    inputKey: string;
    weight: number;
    rule: Record<string, unknown>;
    missing?: Record<string, unknown>;
    source?: { extractor?: string };
    remediation?: {
      severity?: string;
      category?: string;
      humanLabel?: string;
      recommendation?: string;
    };
  }>;
};

export type Codebook = {
  id: string;
  version: string;
  label: string;
  ontologyRef: string;
  notes: string;
  dimensions: CodebookDimension[];
};

export type SiteMeta = {
  codebook: Codebook;
  period: string;
  manifest: ReturnType<typeof loadCurrentPeriod>["manifest"];
  overview: ReturnType<typeof loadCurrentPeriod>["overview"];
  dimensions: ReturnType<typeof loadCurrentPeriod>["dimensions"];
  dimensionCount: number;
  indicatorCount: number;
  kAnonymityMin: number;
  sampleSize: number;
  codebookVersion: string;
  codebookId: string;
  codebookFilename: string;
  overallFormulaLatex: string;
  overallFormulaPlain: string;
};

function buildOverallFormulaLatex(cb: Codebook): string {
  const parts = cb.dimensions.map((d) => {
    const w = d.weight.toFixed(2).replace(/0$/, "");
    const short = DIM_DE_SHORT[d.id] ?? d.label;
    return `${w} \\cdot D_{\\text{${short}}}`;
  });
  return `\\text{Overall} = ${parts.join(" + ")}`;
}

function buildOverallFormulaPlain(cb: Codebook): string {
  const parts = cb.dimensions.map((d) => {
    const w = (d.weight * 100).toFixed(0);
    const label = DIM_DE_LABELS[d.id] ?? d.label;
    return `${w} % ${label}`;
  });
  return parts.join(" + ");
}

export function getCodebookFilename(version: string): string {
  return `codebook-observatory-${version}.yaml`;
}

let cached: SiteMeta | null = null;

export function getSiteMeta(): SiteMeta {
  if (cached) return cached;

  const codebook = loadCodebook() as Codebook;
  const period = latest.period;
  const { manifest, overview, dimensions } = loadCurrentPeriod(period);

  cached = {
    codebook,
    period,
    manifest,
    overview,
    dimensions,
    dimensionCount: codebook.dimensions.length,
    indicatorCount: codebook.dimensions.reduce((sum, d) => sum + d.indicators.length, 0),
    kAnonymityMin: manifest.kAnonymityMin,
    sampleSize: overview.sampleSize,
    codebookVersion: codebook.version,
    codebookId: codebook.id,
    codebookFilename: getCodebookFilename(codebook.version),
    overallFormulaLatex: buildOverallFormulaLatex(codebook),
    overallFormulaPlain: buildOverallFormulaPlain(codebook),
  };
  return cached;
}
