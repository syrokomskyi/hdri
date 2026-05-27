/**
 * Domain normalization for asset identity.
 *
 * The canonical asset domain is the eTLD+1 (registrable domain) extracted from
 * whatever input the operator has — a full URL, a bare hostname, or just the
 * domain string from core.db. `tldts` handles all three.
 *
 * Returns null for inputs that are not real registrable domains
 * (IP addresses, localhost, invalid TLDs, etc.) so callers can decide how to
 * handle unresolvable inputs rather than silently minting junk asset IDs.
 */

import { getDomain, parse } from 'tldts';

/** Result of normalizing a domain input. */
export type NormalizedDomain = {
  /** The eTLD+1 registrable domain, lowercased. e.g. "example.co.uk" */
  readonly normalized: string;
  /** The full hostname extracted from the input, before eTLD+1 reduction. */
  readonly hostname: string;
};

/**
 * Normalize any domain-like input to its eTLD+1 registrable domain.
 *
 * Accepts:
 *   - Full URLs:   "https://shop.example.co.uk/products" → "example.co.uk"
 *   - Hostnames:   "shop.example.co.uk"                  → "example.co.uk"
 *   - Bare domain: "example.co.uk"                       → "example.co.uk"
 *
 * Returns null for:
 *   - IP addresses (v4 / v6)
 *   - localhost, .local, .internal
 *   - Strings with no valid public-suffix TLD
 *   - Empty strings
 */
export function normalizeAssetDomain(input: string): NormalizedDomain | null {
  if (!input || !input.trim()) return null;

  const trimmed = input.trim();

  // tldts can parse both URLs and raw hostnames.
  const parsed = parse(trimmed, { allowPrivateDomains: false });

  if (
    parsed.isIp ||
    parsed.isPrivate ||
    !parsed.domain ||
    !parsed.publicSuffix
  ) {
    return null;
  }

  const normalized = parsed.domain.toLowerCase();
  const hostname = (parsed.hostname ?? parsed.domain).toLowerCase();

  return { normalized, hostname };
}

/**
 * Batch-normalize an array of domain strings, silently dropping invalid ones.
 * Returns a Map from original input to normalized eTLD+1.
 */
export function normalizeAssetDomains(
  inputs: readonly string[],
): Map<string, string> {
  const result = new Map<string, string>();
  for (const input of inputs) {
    const n = normalizeAssetDomain(input);
    if (n) result.set(input, n.normalized);
  }
  return result;
}

/**
 * Extract eTLD+1 directly (shorthand for callers that just need the string).
 * Returns null for non-registrable inputs.
 */
export function toRegistrableDomain(input: string): string | null {
  return getDomain(input, { allowPrivateDomains: false }) ?? null;
}
