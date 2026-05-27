/*
<MODULE_CONTRACT>
<purpose>Defines data structures for representing business source records and their parsing results.</purpose>
<keywords>data model, parsing, source records</keywords>
<responsibilities>
  <item>Defines the structure of a business source record with relevant fields.</item>
  <item>Specifies the result format for parsing operations, including warnings.</item>
</responsibilities>
<non-goals>
  <item>Do not implement parsing logic or data transformation here.</item>
  <item>Do not handle data validation or error management.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="SourceBusinessSeed">Defines individual business record structure.</entry>
  <entry key="SourceParseResult">Defines the structure for parsing outcomes.</entry>
</MODULE_MAP>
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

