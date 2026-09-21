/*
<MODULE_CONTRACT>
<purpose>Validates the type of a given value against a specified type string.</purpose>
<non-goals>
  <item>Does not perform deep type checking for complex objects.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of type validation function.</item>
</CHANGE_SUMMARY>
*/

export function validateType(value: unknown, typeToValidate: string): boolean {
  return typeof value === typeToValidate;
}
