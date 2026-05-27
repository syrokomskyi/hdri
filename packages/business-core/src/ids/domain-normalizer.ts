/**
 * Canonical domain normalisation for Handwerksbetrieb websites.
 *
 * Rules (applied in order):
 *  1. Strip leading/trailing whitespace.
 *  2. Prepend "https://" if no scheme is present (required for URL parsing).
 *  3. Parse with Node's built-in URL constructor → get hostname.
 *  4. Lowercase the hostname (IDN domains are returned in ACE/punycode form
 *     by the URL constructor on Node ≥ 18 when ICU is full; otherwise left
 *     as-is but still lowercased).
 *  5. Strip a leading "www." prefix.
 *  6. Strip any trailing dots (rare but valid DNS).
 *
 * Returns null when the input cannot be parsed as a URL or when the
 * resulting hostname contains no dot (i.e. is a bare label or localhost).
 */
export const normaliseDomain = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let hostname: string;
  try {
    hostname = new URL(href).hostname;
  } catch {
    return null;
  }

  // Lowercase and strip www.
  let domain = hostname.toLowerCase();
  if (domain.startsWith('www.')) domain = domain.slice(4);

  // Strip trailing dots
  domain = domain.replace(/\.+$/, '');

  // Reject bare labels (no dot = not a real domain)
  if (!domain.includes('.')) return null;

  // Reject IP addresses (simple heuristic: all segments are digits)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(domain)) return null;

  return domain;
};

/**
 * Like normaliseDomain but throws on invalid input rather than returning null.
 * Use in contexts where a null result is a pipeline hard-stop.
 */
export const normaliseDomainOrThrow = (raw: string): string => {
  const result = normaliseDomain(raw);
  if (result === null) {
    throw new Error(`Cannot normalise domain from: "${raw}"`);
  }
  return result;
};
