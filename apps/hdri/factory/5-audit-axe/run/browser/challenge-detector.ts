/*
<MODULE_CONTRACT>
<purpose>Detect HTTP challenge and error pages to prevent them from being scored as ordinary business content.</purpose>
<non-goals>
  <item>Does not perform network requests or browser automation.</item>
  <item>Does not classify accessibility violations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0105: initial versioned challenge detector with 4 outcomes (measured, site-unavailable, blocked, not-observed).</item>
</CHANGE_SUMMARY>
*/

export const CHALLENGE_DETECTOR_VERSION = 1;

export type ChallengeOutcome = "measured" | "site-unavailable" | "blocked" | "not-observed";

const CHALLENGE_PATTERNS: readonly RegExp[] = [
  /cloudflare/i,
  /cf-challenge/i,
  /captcha/i,
  /hcaptcha/i,
  /recaptcha/i,
  /just a moment/i,
  /checking your browser/i,
  /ddos protection/i,
  /access denied/i,
  /bot protection/i,
];

/**
 * Detect whether a navigation result represents a real business page or an
 * error/challenge page. Uncertain detection returns "not-observed" per RFC-0105.
 *
 * @param mainStatus - HTTP status of the main navigation response, or null if unavailable.
 * @param pageContent - Rendered DOM content (title + body text excerpt) for pattern matching.
 */
export const detectChallenge = (
  mainStatus: number | null,
  pageContent: string,
): ChallengeOutcome => {
  const content = pageContent ?? "";
  const matches = CHALLENGE_PATTERNS.filter((re) => re.test(content));

  // Check for explicit challenge blocks (403/503 with challenge patterns) first
  if (mainStatus !== null && (mainStatus === 403 || mainStatus === 503) && matches.length > 0) {
    return "blocked";
  }

  if (mainStatus !== null && mainStatus >= 500) {
    return "site-unavailable";
  }

  if (matches.length > 0 && (mainStatus === null || mainStatus >= 400)) {
    return "not-observed";
  }

  return "measured";
};
