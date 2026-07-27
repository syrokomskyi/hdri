/*
<MODULE_CONTRACT>
<purpose>Formats numerical and date values according to German locale standards</purpose>
<non-goals>
  <item>Does not handle locale settings other than "de-DE"</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of formatting functions</item>
</CHANGE_SUMMARY>
*/

import type { Summary, ComparisonPoint } from "../types";

const LOCALE = "de-DE";

export function score(value: number): string {
  return new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value);
}

export function count(value: number): string {
  return new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(value);
}

export function pct(value: number, maxFractionDigits = 0): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
}

export function weight(value: number): string {
  return new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

export function axisRange(item: Summary): string {
  return `${score(item.p25)} – ${score(item.p75)}`;
}

export function barColorClass(value: number): string {
  if (value >= 80) return "bar-excellent";
  if (value >= 60) return "bar-good";
  if (value >= 30) return "bar-fair";
  return "bar-poor";
}

export function deltaLabel(item: ComparisonPoint): string {
  if ((item.suppressionReasons?.length ?? 0) > 0) return "Delta unterdrückt";
  if (item.deltaFromPrevious == null) return "Kein Vorquartal";
  const sign = item.deltaFromPrevious > 0 ? "+" : "";
  return `${sign}${score(item.deltaFromPrevious)}`;
}

export function formatDate(isoString: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(new Date(isoString));
}

export function reliabilityLabel(r: "reliable" | "caution" | "suppressed"): string {
  switch (r) {
    case "reliable":
      return "Zuverlässig";
    case "caution":
      return "Mit Vorsicht";
    case "suppressed":
      return "Unterdrückt";
  }
}

export function reliabilityClass(r: "reliable" | "caution" | "suppressed"): string {
  return `reliability-dot reliability-${r}`;
}

export function percentileTooltip(item: {
  n: number;
  mean: number;
  p25: number;
  p50: number;
  p75: number;
}): string {
  const pad = (s: string) => s.padEnd(13, " ");
  return `${pad("P75")} = ${score(item.p75)}\n${pad("P50 (Median)")} = ${score(item.p50)}\n${pad("P25")} = ${score(item.p25)}\n${pad("Mittelwert")} = ${score(item.mean)}\n${pad("N")} = ${count(item.n)}`;
}

export function detailGrid(item: {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}): string {
  return `
    <div class="details-grid">
      <div class="details-cell"><small>P10</small><strong>${score(item.p10)}</strong></div>
      <div class="details-cell"><small>P25</small><strong>${score(item.p25)}</strong></div>
      <div class="details-cell"><small>P50</small><strong>${score(item.p50)}</strong></div>
      <div class="details-cell"><small>P75</small><strong>${score(item.p75)}</strong></div>
      <div class="details-cell"><small>P90</small><strong>${score(item.p90)}</strong></div>
    </div>
  `;
}
