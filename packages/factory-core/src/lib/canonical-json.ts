/*
<MODULE_CONTRACT>
<purpose>Serializes JSON values with ordered object keys for deterministic factory-core hashing.</purpose>
<non-goals><item>Does not perform cryptographic operations or domain-specific serialization.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Document the existing recursive key-ordering serializer without changing its runtime behavior.</item></CHANGE_SUMMARY>
*/

export const canonical = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`;
};
