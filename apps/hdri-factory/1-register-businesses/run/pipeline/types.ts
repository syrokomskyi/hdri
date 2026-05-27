/*
<MODULE_CONTRACT>
<purpose>Facilitates type definitions for pipeline state and context in the 1-register-businesses pipeline.</purpose>
<keywords>pipeline, state, context, types</keywords>
<responsibilities>
  <item>Defines the structure for pipeline state, including source token and discovered cores.</item>
  <item>Specifies an empty record for AI services, indicating no AI functionality is required.</item>
  <item>Enhances shared pipeline context with methods for managing gogol artifacts.</item>
</responsibilities>
<non-goals>
  <item>Do not include AI processing capabilities within this module.</item>
  <item>Do not handle transport or configuration orchestration for the pipeline.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="PipelineState">Structure for managing pipeline state data.</entry>
  <entry key="PipelineContext">Contextual information and methods for artifact management.</entry>
  <entry key="DiscoveredCore">Type for discovered upstream core DB.</entry>
  <entry key="DomainAggregate">Type for aggregated domain data.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
  <item>Add resolvedCoreDbPath and upstreamHarvestOutputRoot to PipelineState so gogols receive dynamically-computed upstream paths from brief.coreDbPath instead of importing a hardcoded value.</item>
  <item>Add bundesland and gemeinde fields to DomainAggregate for downstream geographic propagation.</item>
</CHANGE_SUMMARY>
*/

import type {
  PipelineArtifact as SharedPipelineArtifact,
  PipelineArtifacts as SharedPipelineArtifacts,
} from '@org/pipeline-core';
import type { NodePipelineContext } from '@org/pipeline-node/types';
import type { Brief } from '../brief.js';

// ---------------------------------------------------------------------------
// Pipeline state — carried across all gogols
// ---------------------------------------------------------------------------

export type DiscoveredCore = {
  deviceId: string;
  dbPath: string;
  sizeBytes: number;
};

export type DomainAggregate = {
  daId: string;
  domain: string;
  sourceDeviceIds: Set<string>;
  sitesCount: number;
  firstSeenDeviceId: string;
  bundesland: string | null;
  gemeinde: string | null;
};

export type PipelineState = {
  /** Canonical batch identifier from brief. */
  sourceToken: string;
  /** Year extracted from sourceToken. */
  year: number;
  /** Local device ID. */
  deviceId: string;
  /** Resolved absolute path to upstream core.db. */
  resolvedCoreDbPath: string;
  /** Resolved absolute path to upstream output root (parent of all device folders). */
  upstreamHarvestOutputRoot: string;
  /** Discovered upstream core DBs. */
  discoveredCores: DiscoveredCore[];
  /** Aggregated domain data. */
  domainAggregates: DomainAggregate[];
  /** Total rows read from upstream. */
  totalRowsRead: number;
  /** Number of deduplicated domains. */
  dedupedCount: number;
  /** Registry rows after merge. */
  registryRows: RegistryRow[];
  /** Path to local registry DB. */
  localDbPath: string;
  /** Content hash for signing. */
  contentHash: string;
  brief: Brief;
};

export type RegistryRow = {
  da_id: string;
  domain: string;
  bundesland: string | null;
  gemeinde: string | null;
  first_seen_source_token: string;
  first_seen_device_id: string;
  sites_count: number;
};

// ---------------------------------------------------------------------------
// AI services — none needed for this rule-based pipeline
// ---------------------------------------------------------------------------

export type PipelineAiServices = Record<string, never>;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type SharedPipelineContext = NodePipelineContext<PipelineState, PipelineAiServices>;

export type PipelineContextExtras = {
  getGogolNumber: (gogolId: string) => number;
  getGogolOutputDir: (gogolId: string) => string;
  getGogolArtifactPath: (gogolId: string, artifactId: string) => string;
  currentGogolId: string | null;
  readGogolArtifactText: (gogolId: string, artifactId: string) => Promise<string>;
  readGogolArtifactJson: (gogolId: string, artifactId: string) => Promise<unknown>;
};

export type PipelineContext = SharedPipelineContext & PipelineContextExtras;

export type GogolArtifact = SharedPipelineArtifact<PipelineContext>;
export type GogolArtifacts = SharedPipelineArtifacts<PipelineContext>;
