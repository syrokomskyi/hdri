/*
<MODULE_CONTRACT>
<purpose>Rejects independent rebuild requests until preserved-evidence reconstruction and enforceable isolation are connected to this command.</purpose>
<non-goals>
  <item>Does not claim that hashing an empty output directory proves reconstruction.</item>
  <item>Does not modify scratch roots, sealed capsules, working databases or public archives.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Remove the placeholder rebuild that could certify an empty directory; fail before filesystem effects until the actual executor exists.</item>
</CHANGE_SUMMARY>
*/

// @ai-invariant: A rebuild receipt requires actual reconstruction; an absent executor never yields success.
throw new Error(
  "REBUILD_EXECUTOR_UNAVAILABLE: independent reconstruction and OS isolation are not connected; no rebuild receipt can be issued",
);
