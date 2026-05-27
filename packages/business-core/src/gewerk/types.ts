/**
 * HWO (Handwerksordnung) classification system types and interfaces.
 * Based on official German Handwerksordnung master dataset and mapping systems.
 */

export type HwoType = 'A' | 'B1' | 'B2';

export type HwoUid = string; // Format: "A-25", "B1-56", "B2-03"

export type HwoStatus = 'active' | 'repealed_entfaellt' | 'repealed_weggefallen';

export interface HwoEntry {
  uid: HwoUid;
  classificationNo: string;
  status: HwoStatus;
  officialText: string;
  name: string | null;
  type: HwoType;
  anlage: string;
  abschnitt: string | null;
}

export interface HwoClassification {
  type: HwoType;
  anlage: string;
  abschnitt: string | null;
  typeName: string;
  legalBasisUrl: string;
  items: HwoEntry[];
}

export interface HwoMasterDataset {
  dataset: {
    id: string;
    title: string;
    jurisdiction: string;
    sourceOfTruth: Array<{
      type: HwoType;
      title: string;
      legalBasisUrl: string;
    }>;
    notes: string[];
  };
  classifications: HwoClassification[];
}

export type HwoMappingSystemId = string;

export interface HwoMappingTarget {
  system: HwoMappingSystemId;
  code: string;
  label: string;
}

export interface HwoMappingEntry {
  uid: HwoUid;
  target: HwoMappingTarget;
}

export interface HwoMappingDataset {
  dataset: {
    id: string;
    title: string;
    sourceDocument: {
      filename: string;
      title: string;
      publisher: string;
    };
    notes: string[];
  };
  targetSystem: {
    id: HwoMappingSystemId;
    groups: Array<{
      code: string;
      label: string;
    }>;
  };
  entries: HwoMappingEntry[];
  qualityChecks?: {
    mappedEntryCount: number;
    unmappedActiveAB1Uids: string[];
  };
}

export interface HwoMappingSystemDefinition {
  id: HwoMappingSystemId;
  sourceFile: string;
  targetKind: 'group' | 'category' | 'tier';
  description?: string;
}

export interface HwoClassificationInput {
  rawBranche?: string;
  siteTitle?: string;
  companyName?: string;
  domain?: string;
}

export type HwoProvenance =
  | 'entry_keyword'
  | 'entry_alias'
  | 'heuristic_group_only'
  | 'unclassified';

export interface HwoClassificationResult {
  uid: HwoUid | null;
  confidence: number | null;
  provenance: HwoProvenance;
}
