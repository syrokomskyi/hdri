/*
<MODULE_CONTRACT>
<purpose>Models business lifecycle transitions as an immutable event log and reconstructs a coherent timeline per business.</purpose>
<non-goals>
  <item>Does not read or persist data.</item>
  <item>Does not handle event production or external data sources.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of business lifecycle event modeling and timeline reconstruction.</item>
</CHANGE_SUMMARY>
*/

/**
 * Business lifecycle event model (WP13).
 *
 * Asset identity is domain-based and stable (see ids.ts in this package): the same
 * business keeps one `asset_id` across years. But a business is not static — it is
 * founded, renamed/rebranded, merges with or splits from others, closes, and
 * sometimes reopens. Those transitions are the "story" behind an asset. This module
 * models them as an append-only event log and folds the events into a coherent,
 * queryable timeline per business.
 *
 * Events are immutable ground truth: like observations and the identity registry,
 * they are only ever appended, never edited. A correction is a new event, not an edit.
 *
 * Producers (wired elsewhere): the dead-domain state machine emits `closed` (and
 * `reopened`) transitions; the manual-correction workflow emits `renamed`, `merged`,
 * `split`, and `reassigned` when an operator confirms a rebrand, consolidation, or
 * domain hand-over. This module is pure: it defines the shape, validates it, and
 * reconstructs history — it does not read or persist.
 */

/** The kinds of transition a business can undergo. */
export type LifecycleEventType =
  | "founded" // the business is first observed / established
  | "renamed" // rebrand or domain change, SAME legal entity (asset_id unchanged)
  | "merged" // this business merged INTO `related_asset_id` (this one ends)
  | "split" // this business spun off `related_asset_id` (this one continues)
  | "closed" // ceased operating (confirmed dead domain, insolvency, …)
  | "reopened" // a previously-closed business is active again
  | "reassigned"; // this business's domain was handed to `related_asset_id`

/** How confident/where-from an event is. */
export type LifecycleEventSource = "observed" | "manual" | "inferred";

export const LIFECYCLE_EVENT_TYPES: readonly LifecycleEventType[] = [
  "founded",
  "renamed",
  "merged",
  "split",
  "closed",
  "reopened",
  "reassigned",
];

/** Event types that name a counterparty business in `related_asset_id`. */
const RELATIONAL_TYPES = new Set<LifecycleEventType>(["merged", "split", "reassigned"]);

/** A single, immutable lifecycle transition for one business. */
export type AssetLifecycleEvent = {
  readonly event_id: string;
  /** The subject business. */
  readonly asset_id: string;
  readonly event_type: LifecycleEventType;
  /** When the transition happened in the world (ISO 8601). */
  readonly event_at: string;
  /** Optional quarter tag, e.g. "2026-q3". */
  readonly period: string | null;
  /**
   * The counterparty business for relational events:
   *  - merged:     the surviving business this one merged INTO;
   *  - split:      the new business spun off FROM this one;
   *  - reassigned: the business the domain was handed TO.
   * Null for founded/renamed/closed/reopened.
   */
  readonly related_asset_id: string | null;
  /** Domain at/after the event (new domain for renamed/reassigned; founding domain for founded). */
  readonly domain: string | null;
  readonly reason: string | null;
  readonly source: LifecycleEventSource;
  readonly recorded_at: string;
  readonly evidence_ref: string | null;
};

/**
 * Returns a list of validation problems for an event (empty = valid). Enforces the
 * type-specific requirements: relational events must name a counterparty; a rename or
 * reassignment must carry the new domain.
 */
export function validateLifecycleEvent(event: AssetLifecycleEvent): string[] {
  const issues: string[] = [];
  if (!event.event_id) issues.push("event_id is required");
  if (!event.asset_id) issues.push("asset_id is required");
  if (!event.event_at) issues.push("event_at is required");
  if (!LIFECYCLE_EVENT_TYPES.includes(event.event_type)) {
    issues.push(`unknown event_type "${event.event_type}"`);
  }
  if (RELATIONAL_TYPES.has(event.event_type) && !event.related_asset_id) {
    issues.push(`event_type "${event.event_type}" requires related_asset_id`);
  }
  if (!RELATIONAL_TYPES.has(event.event_type) && event.related_asset_id) {
    issues.push(`event_type "${event.event_type}" must not set related_asset_id`);
  }
  if ((event.event_type === "renamed" || event.event_type === "reassigned") && !event.domain) {
    issues.push(`event_type "${event.event_type}" requires domain`);
  }
  if (event.related_asset_id && event.related_asset_id === event.asset_id) {
    issues.push("related_asset_id must differ from asset_id");
  }
  return issues;
}

/** Throws if the event is invalid; otherwise returns it unchanged. */
export function assertValidLifecycleEvent(event: AssetLifecycleEvent): AssetLifecycleEvent {
  const issues = validateLifecycleEvent(event);
  if (issues.length > 0) {
    throw new Error(
      `Invalid lifecycle event ${event.event_id || "?"}:\n  - ${issues.join("\n  - ")}`,
    );
  }
  return event;
}

export type LifecycleStatus = "active" | "closed";

/** The reconstructed "story" of one business, folded from its events. */
export type AssetTimeline = {
  readonly asset_id: string;
  readonly founded_at: string | null;
  readonly closed_at: string | null;
  readonly status: LifecycleStatus;
  /** Domain as of the latest rename/reassignment/founding, or null if never recorded. */
  readonly current_domain: string | null;
  /** Ordered domain history (rename/reassign chain), consecutive duplicates collapsed. */
  readonly domains: string[];
  /** The business this one merged into (terminal), or null. */
  readonly merged_into: string | null;
  /** Businesses spun off from this one. */
  readonly split_into: string[];
  /** The subject events in chronological order. */
  readonly events: AssetLifecycleEvent[];
};

/**
 * Folds an asset's events into a coherent timeline. Robust to out-of-order input
 * (events are sorted by `event_at`, then `recorded_at`) and ignores events for other
 * assets. `founded_at` is the first `founded` event, or the earliest event if none is
 * explicit; a `merged` event closes the business into `merged_into`.
 */
export function reconstructAssetHistory(
  assetId: string,
  allEvents: readonly AssetLifecycleEvent[],
): AssetTimeline {
  const events = allEvents
    .filter((e) => e.asset_id === assetId)
    .slice()
    .sort(
      (a, b) => a.event_at.localeCompare(b.event_at) || a.recorded_at.localeCompare(b.recorded_at),
    );

  let founded_at: string | null = null;
  let closed_at: string | null = null;
  let status: LifecycleStatus = "active";
  let current_domain: string | null = null;
  let merged_into: string | null = null;
  const domains: string[] = [];
  const split_into: string[] = [];

  const pushDomain = (domain: string | null): void => {
    if (domain && domains[domains.length - 1] !== domain) domains.push(domain);
    if (domain) current_domain = domain;
  };

  for (const e of events) {
    switch (e.event_type) {
      case "founded":
        if (founded_at === null) founded_at = e.event_at;
        status = "active";
        pushDomain(e.domain);
        break;
      case "renamed":
      case "reassigned":
        pushDomain(e.domain);
        break;
      case "closed":
        status = "closed";
        closed_at = e.event_at;
        break;
      case "reopened":
        status = "active";
        closed_at = null;
        break;
      case "merged":
        status = "closed";
        closed_at = e.event_at;
        merged_into = e.related_asset_id;
        break;
      case "split":
        if (e.related_asset_id) split_into.push(e.related_asset_id);
        break;
    }
  }

  if (founded_at === null && events.length > 0) founded_at = events[0]!.event_at;

  return {
    asset_id: assetId,
    founded_at,
    closed_at,
    status,
    current_domain,
    domains,
    merged_into,
    split_into,
    events,
  };
}
