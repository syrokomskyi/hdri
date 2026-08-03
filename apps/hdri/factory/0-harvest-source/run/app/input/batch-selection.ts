/*
<MODULE_CONTRACT>
<purpose>Selects the deterministic cumulative set of preserved source batches for a quarter.</purpose>
<non-goals><item>Does not touch the filesystem or parse source contents.</item></non-goals>
</MODULE_CONTRACT>
*/

import { parseSourceToken } from "@syrokomskyi/observatory-crypto";

export const selectCumulativeBatchNames = (
  discovered: readonly string[],
  currentSourceToken: string,
): string[] => {
  const current = parseSourceToken(currentSourceToken);
  const currentOrdinal = current.year * 4 + current.quarter;
  const selected = [...discovered]
    .sort((a, b) => a.localeCompare(b))
    .filter((batchName) => {
      const parsed = parseSourceToken(batchName);
      return parsed.year * 4 + parsed.quarter <= currentOrdinal;
    });
  if (!selected.includes(currentSourceToken)) {
    throw new Error(`Current batch folder is not discoverable: ${currentSourceToken}`);
  }
  return selected;
};
