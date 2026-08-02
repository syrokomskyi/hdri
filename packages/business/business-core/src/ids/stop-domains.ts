/*
<MODULE_CONTRACT>
<purpose>This module defines a set of domains that are considered aggregators, social platforms, or redirectors, which are not valid for Handwerksbetrieb websites. It provides functionality to check if a given domain is part of this set.</purpose>
<non-goals>
  <item>This module does not handle the normalization of domain names.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation of the STOP_DOMAINS set and isStopDomain function.</item>
</CHANGE_SUMMARY>
*/

/**
 * Domains that are aggregators, social platforms, or redirectors —
 * never a valid Handwerksbetrieb website.
 *
 * Used by domain-normalizer to reject catalog entries that point to
 * a listing page on the aggregator itself rather than the business site.
 */
export const STOP_DOMAINS = new Set<string>([
  // German business directories / aggregators
  "firmenabc.com",
  "stadtbranchenbuch.com",
  "opendi.de",
  "gelbeseiten.de",
  "dasoertliche.de",
  "herold.at",
  "handwerker.de",
  "myhammer.de",
  "blauarbeit.de",
  "homify.de",
  "werhatwas.de",
  "cylex.de",
  "localheroes.com",
  "localsearch.de",
  "yelp.de",
  "yelp.com",
  "trustpilot.com",
  "tripadvisor.de",
  "tripadvisor.com",
  "golocal.de",
  "branchenbuch.de",
  "deutschland-branchenbuch.de",
  "wlw.de",
  "europages.de",
  "kompass.com",
  // Social / platforms
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "xing.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "tiktok.com",
  "pinterest.com",
  // Booking / marketplace
  "booking.com",
  "airbnb.de",
  "airbnb.com",
  "ebay.de",
  "amazon.de",
  "etsy.com",
  // Google / Maps
  "google.com",
  "google.de",
  "maps.google.com",
  // Generic redirect / parking registrars
  "wixsite.com",
  "jimdo.com",
  "strikingly.com",
  "webnode.de",
  "weebly.com",
  "webflow.io",
]);

/**
 * Returns true if the given normalised domain string matches a stop-domain
 * or any subdomain of a stop-domain.
 */
export const isStopDomain = (normalisedDomain: string): boolean => {
  if (STOP_DOMAINS.has(normalisedDomain)) return true;
  for (const stop of STOP_DOMAINS) {
    if (normalisedDomain.endsWith(`.${stop}`)) return true;
  }
  return false;
};
