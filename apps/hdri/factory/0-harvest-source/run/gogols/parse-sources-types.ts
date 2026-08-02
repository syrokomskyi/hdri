/*
<MODULE_CONTRACT>
<purpose>Shared domain types for the parse-sources gogol — this module handles parse-sources-types operations within the pipeline application.</purpose>
<non-goals>
  <item>Does not implement parsing, database, or reporting logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted parse-sources domain types from ParseSourcesGogol.ts during file-size refactor.</item>
</CHANGE_SUMMARY>
*/

export type SkipReason = "no_url" | "bad_url" | "stop_domain";

export type SourceFileStat = {
  path: string;
  type: string;
  itemsParsed: number;
  itemsRegistered: number;
  itemsSkipped: number;
  noUrl: number;
  badUrl: number;
  stopDomain: number;
};

export type SkipSummary = {
  noUrl: number;
  badUrl: number;
  stopDomain: number;
};

export type BatchReport = {
  batchName: string;
  sourceFiles: SourceFileStat[];
  /** Parser-level items that had no URL at all (not counted in skipped). */
  noUrlWarnings: number;
  skipSummary: SkipSummary;
  /** Free-form warning strings accumulated during batch processing. */
  warnings: string[];
};

export type FileResult = {
  stat: SourceFileStat;
  noUrlWarnings: number;
  skipSummary: SkipSummary;
};
