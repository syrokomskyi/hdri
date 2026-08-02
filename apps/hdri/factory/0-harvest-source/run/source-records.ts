/*
<MODULE_CONTRACT>
<purpose>Defines data structures for representing business source records and their parsing results.</purpose>
<non-goals>
  <item>Do not implement parsing logic or data transformation here.</item>
  <item>Do not handle data validation or error management.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Backfill module contract for data structures related to source records.</item>
</CHANGE_SUMMARY>
*/

export type SourceBusinessSeed = {
  sourceItemKey: string;
  sourcePageNumber: string | null;
  businessName: string | null;
  streetAddress: string | null;
  postalCode: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  websiteUrl: string | null;
  category: string | null;
  sourceProfileUrl: string | null;
  raw: Record<string, unknown>;
};

export type SourceParseResult = {
  parserKind: string;
  items: SourceBusinessSeed[];
  warnings: string[];
};
