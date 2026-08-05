/*
<MODULE_CONTRACT>
<purpose>Applies the previously-accepted-or-currently-reachable admission rule at the raw-capsule to scientific-panel boundary.</purpose>
<non-goals>
  <item>Does not delete raw Factory evidence.</item>
  <item>Does not infer business closure from website availability.</item>
</non-goals>
</MODULE_CONTRACT>
*/

import type { Observation } from "@syrokomskyi/observatory-core";

export const isCurrentReachabilityEvidence = (observation: Observation): boolean =>
  observation.signal_path === "availability.website.is_reachable" &&
  observation.value_bool === true;

export const collectPanelEligibleAssetIds = async (
  source: AsyncIterable<Observation>,
  previouslyAccepted: Iterable<string>,
): Promise<{ eligibleAssetIds: Set<string>; currentReachableAssets: number; observationsScanned: number }> => {
  const eligibleAssetIds = new Set(previouslyAccepted);
  const currentReachable = new Set<string>();
  let observationsScanned = 0;
  for await (const observation of source) {
    observationsScanned++;
    if (isCurrentReachabilityEvidence(observation)) {
      eligibleAssetIds.add(observation.asset_id);
      currentReachable.add(observation.asset_id);
    }
  }
  return {
    eligibleAssetIds,
    currentReachableAssets: currentReachable.size,
    observationsScanned,
  };
};

export async function* filterPanelEligibleObservations(
  source: AsyncIterable<Observation>,
  eligibleAssetIds: ReadonlySet<string>,
  onIgnored?: (observation: Observation) => void,
): AsyncGenerator<Observation> {
  for await (const observation of source) {
    if (eligibleAssetIds.has(observation.asset_id)) yield observation;
    else onIgnored?.(observation);
  }
}
