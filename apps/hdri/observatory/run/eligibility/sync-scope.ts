/*
<MODULE_CONTRACT>
<purpose>Select the sync intake population from validated preparation intent.</purpose>
<non-goals><item>Does not grant publication admission or alter the scientific panel eligibility rule.</item></non-goals>
</MODULE_CONTRACT>
<KEY_DECISIONS><item>Availability-only preparation retains all observations and states, including never-reachable targets.</item></KEY_DECISIONS>
<CHANGE_SUMMARY><item>RFC-0115: separate full-denominator availability intake from panel selection.</item></CHANGE_SUMMARY>
*/
import type { Observation } from "@syrokomskyi/observatory-core";
import type { ScientificProduct } from "../release/release-contract";
import { collectPanelEligibleAssetIds, filterPanelEligibleObservations } from "./panel-eligibility";

export async function selectSyncPopulation(
  source: AsyncIterable<Observation>, previouslyAccepted: Iterable<string>,
  products: readonly ScientificProduct[],
): Promise<{ eligibleAssetIds: ReadonlySet<string> | null; observationsScanned: number | null }> {
  // Null means deliberately unfiltered intake, not an empty selected population.
  if (products.length === 1 && products[0] === "availability")
    return { eligibleAssetIds: null, observationsScanned: null };
  return collectPanelEligibleAssetIds(source, previouslyAccepted);
}

export function syncObservations(source: AsyncIterable<Observation>, eligibleAssetIds: ReadonlySet<string> | null,
  onIgnored: (observation: Observation) => void): AsyncIterable<Observation> {
  return eligibleAssetIds === null ? source : filterPanelEligibleObservations(source, eligibleAssetIds, onIgnored);
}
