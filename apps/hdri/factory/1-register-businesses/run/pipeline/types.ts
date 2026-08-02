/*
<MODULE_CONTRACT>
<purpose>Facilitates type definitions for pipeline state and context in the 1-register-businesses pipeline.</purpose>
<non-goals>
  <item>Do not include AI processing capabilities within this module.</item>
  <item>Do not handle transport or configuration orchestration for the pipeline.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
  <item>Add resolvedCoreDbPath and upstreamHarvestOutputRoot to PipelineState so gogols receive dynamically-computed upstream paths from brief.coreDbPath instead of importing a hardcoded value.</item>
  <item>Add bundesland and gemeinde fields to DomainAggregate for downstream geographic propagation.</item>
  <item>Replace local PipelineContextExtras with HdriFactoryContextExtras from @syrokomskyi/factory-core.</item>
</CHANGE_SUMMARY>
*/

import type {
  PipelineArtifact as SharedPipelineArtifact,
  PipelineArtifacts as SharedPipelineArtifacts,
} from "@syrokomskyi/pipeline-core";
import type { NodePipelineContext } from "@syrokomskyi/pipeline-node/types";
import type { HdriFactoryContextExtras } from "@syrokomskyi/factory-core";
import type { Brief } from "../brief.js";

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

export type PipelineContext = SharedPipelineContext & HdriFactoryContextExtras;

export type GogolArtifact = SharedPipelineArtifact<PipelineContext>;
export type GogolArtifacts = SharedPipelineArtifacts<PipelineContext>;
