/*
<MODULE_CONTRACT>
<purpose>Derives website availability transitions without inferring business closure.</purpose>
<non-goals><item>Does not classify raw network errors or mutate business lifecycle events.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0028 introduces website-level availability history.</item></CHANGE_SUMMARY>
*/

import type { SignalOntology } from "./ontology/types.js";

export type LivenessOutcome = "reachable" | "unavailable" | "blocked" | "indeterminate";

export type RawLivenessAttempt = Readonly<{
  isLive: boolean;
  httpStatus: number | null;
  errorCode: string | null;
}>;

export const LIVENESS_OUTCOME_POLICY_VERSION = "availability-outcome-v1";

export const withAvailabilityOntologyV2 = (base: SignalOntology): SignalOntology => ({
  version: "2.0.0",
  signals: {
    ...base.signals,
    "availability.website.outcome": {
      label: "Observed website availability outcome",
      value_type: "str",
      introduced_in: "2.0.0",
      deprecated_in: null,
      supersedes: [],
      stability: "high",
      extractor: LIVENESS_OUTCOME_POLICY_VERSION,
      notes: "Website transport observation only; never evidence that a business closed.",
    },
    "availability.website.is_reachable": {
      label: "Website reachable during quarterly attempt",
      value_type: "bool",
      introduced_in: "2.0.0",
      deprecated_in: null,
      supersedes: [],
      stability: "high",
      extractor: LIVENESS_OUTCOME_POLICY_VERSION,
    },
    "availability.website.error_code": {
      label: "Raw liveness error code",
      value_type: "str",
      introduced_in: "2.0.0",
      deprecated_in: null,
      supersedes: [],
      stability: "medium",
      extractor: LIVENESS_OUTCOME_POLICY_VERSION,
    },
  },
});

export const classifyLivenessOutcome = (attempt: RawLivenessAttempt): LivenessOutcome => {
  if (attempt.isLive) return "reachable";
  if (attempt.httpStatus === 401 || attempt.httpStatus === 403 || attempt.httpStatus === 429) {
    return "blocked";
  }
  const code = attempt.errorCode?.toLowerCase() ?? "";
  if (/robots|bot|challenge|captcha|rate.?limit/.test(code)) return "blocked";
  if (/collector|internal|browser|tool|cancel/.test(code)) return "indeterminate";
  if (
    attempt.httpStatus === 404 ||
    attempt.httpStatus === 410 ||
    (attempt.httpStatus != null && attempt.httpStatus >= 500) ||
    /dns|enotfound|econnrefused|timeout|tls|certificate/.test(code)
  ) {
    return "unavailable";
  }
  return "indeterminate";
};
export type WebsitePanelState = "candidate_never_live" | "active" | "unavailable" | "restored" | "unknown-history";
export type WebsiteAvailabilityEvent = "website_first_observed_live" | "website_became_unavailable" | "website_restored";

export type AvailabilityTransition = Readonly<{
  state: WebsitePanelState;
  event: WebsiteAvailabilityEvent | null;
  carriesForward: boolean;
}>;

export const deriveAvailabilityTransition = (
  previous: WebsitePanelState,
  outcome: LivenessOutcome,
): AvailabilityTransition => {
  if (outcome === "blocked" || outcome === "indeterminate") return { state: previous, event: null, carriesForward: true };
  if (outcome === "reachable") {
    if (previous === "candidate_never_live" || previous === "unknown-history") return { state: "active", event: "website_first_observed_live", carriesForward: false };
    if (previous === "unavailable") return { state: "restored", event: "website_restored", carriesForward: false };
    return { state: previous, event: null, carriesForward: false };
  }
  if (previous === "active" || previous === "restored") return { state: "unavailable", event: "website_became_unavailable", carriesForward: false };
  return { state: previous, event: null, carriesForward: false };
};
