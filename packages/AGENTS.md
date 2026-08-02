# Shared Package Guidelines

Apply these rules when reading or editing files under `packages/**`.

## Purpose

- `packages/*` contains shared reusable packages and internal libraries for the Turborepo monorepo.
- Prefer extracting reusable runtime, framework, and cross-app logic here instead of duplicating it in apps.
- Keep app-specific orchestration, prompts, and domain contracts out of shared packages unless they have real multi-app value.

## Package naming

- Every new package under `packages/*` must declare `"name": "@syrokomskyi/<package-name>"` in its `package.json`.
- The `@org/` and `@wgogol/` scopes are retired; do not use them for new packages, imports, or scripts.
- Keep the directory name (`packages/<package-name>`) and the npm package name aligned in kebab-case.
- Pipeline apps follow the same rule; see [`.agents/rules/new-pipeline-app.md`](../.agents/rules/new-pipeline-app.md) for the app scaffolding checklist.

## Package responsibilities

### Pipeline framework

- `packages/pipeline/pipeline-core`: pipeline definition, phases, shared step contracts, execution guide generation, engine behavior, shared pipeline errors/constants, validator composition helpers, and pipeline lifecycle event emission via `onEvent` callback (`PipelineEvent` / `PipelineEventCallback` types).
- `packages/pipeline/pipeline-node`: Node.js runtime context, artifact I/O, filesystem/path helpers, prompt/template helpers, cached frontmatter/declaration helpers, template artifact writing helpers, logging-aware AI adapters, and CLI entry factory (`createMainEntry`) with optional `onEvent` propagation.
- `packages/pipeline/pipeline-ai`: provider wrappers, structured OpenAI helpers such as `createOpenAiJson(...)`, and resilient AI JSON normalization/parsing helpers.
- `packages/pipeline/pipeline-evidence`: app-neutral Zod contracts and pure deterministic operations for source-material references, immutable claim revisions, evidence links, provenance-family grouping, content fingerprints, and claim evidence summaries. It contains no SQLite, files, network, AI, or app workflow.
- `packages/pipeline/pipeline-steps`: reusable operational step base classes — rate limiting, browser pooling, cross-DB reads, k-anonymity gates, human gates, source signing (`SignSourceStep`), upstream signature verification (`VerifyUpstreamStep`), and video extraction utilities (`yt-dlp` captions, Whisper transcription fallback).
- `packages/rate-limit`: token-bucket, concurrency gate, circuit-breaker, and retry algorithms for mass crawling and external calls. All time-dependent modules share a unified `Clock` seam (`now`/`setTimeout`/`random`). `RateLimiter` exposes a single `onEvent` observer for all sub-modules. `NonRetryableError` prevents retrying breaker-open errors without closure capture.

### HDRI / Observatory domain

- `packages/business/business-core`: business domain schemas, SQLite migrations, and cross-DB helpers for the HDRI factory pipeline.
- `packages/business/business-crawler`: Playwright-based site crawling primitives for business data extraction.
- `packages/hdri-codebook`: YAML rule parser and deterministic HDRI scoring logic (parse, score-site, aggregate, governance). Input types are Zod-derived in `parse.ts`; `types.ts` retains only runtime and output types. `scoring-rules.ts` is a re-export shim for `score-site.ts`.
- `packages/observatory/observatory-core`: observatory ontology, signal-to-ontology mapping (`EXT_SIGNAL_MAP`, `createSignalMap` for runtime validation), observation value invariant (`value.ts`), hashing utilities, and asset ID generation (`deriveAssetId`, `mintAssetId`, `IdentityRequest`).
- `packages/factory-core`: factory-shared utilities including factory path helpers (`getFactoryPaths`, `createFactoryRelativePathConverter`, `getUpstreamOutputRoot`).
- `packages/observatory/observatory-crypto`: cryptographic helpers used by the observatory pipeline. Modules: `sign.ts` (ed25519 signing + key loading), `verify.ts` (signature verification + trust-aware `verifySignedObservation`), `canonicalize.ts` (RFC 8785 JCS), `key-registry.ts` (trusted-key policy), `sign-source.ts` (batch-level source signatures), `transparency.ts` (multi-device key loading + deep `verifyUpstream`), `env.ts` (repo root discovery + `DEVICE_ID` validation; `loadRepoEnv` walks up from cwd to find the first `.env` — for HDRI apps this resolves to `apps/hdri/.env`), `source-token.ts` (sourceToken parsing), `device-folders.ts` (device output enumeration), `auto-env.ts` (thin side-effect wrapper around `autoLoadEnv()` from `env.ts`).
- `packages/observatory/observatory-emit`: emit-bundle contract types, writer, reader, and schema for observatory publication artifacts. Signature reporters have moved to `@syrokomskyi/pipeline-steps`.
- `packages/observatory/observatory-vault`: Parquet vault read/write and verification for observatory data integrity. Modules: `paths.ts` (shard path resolution, `VaultShardKind`, `SHARD_KIND_DIRS`, `resolveShardPaths`, `shardKindGlob`), `duckdb.ts` (`DuckDbSession` — pooled in-memory DuckDB connection), `writer.ts` (`VaultWriter.writeShard` — unified atomic shard write + manifest recording; `recordShard` for existing shards; deprecated per-kind wrappers remain for compat), `reader.ts` (`VaultReader` — typed query methods: `getAllObservations`, `getObservationsForRun`, `getObservationJsonMap`, `countRowsInShard`, `getAssetStateRecords`, `getIdentityMap`, `getLifecycleEvents`; raw `query()`/glob methods deprecated), `manifest.ts` (`VaultManifest` class with `load`/`save`/`upsert`/`find`/`verify`; `VaultManifestData` type; free functions `readManifest`/`writeManifest`/`upsertShardEntry`/`buildShardEntry`/`verifyVaultAgainstManifest` retained for backward compat).

### Axiom Global domain

- Start with `docs/axiom/STARTING-AXIOM.md` and `docs/axiom/OPERATIONAL-READINESS.md`; local runtime readiness is not a Production Seal.
- `packages/axiom/axiom-contracts`: neutral identifiers, time, digest, artifact, producer, policy, diagnostic, and lifecycle relation contracts.
- `packages/axiom/axiom-provenance`: canonical JSON, digesting, signatures, trust-key policy, manifests, and lineage validation.
- `packages/axiom/axiom-control-plane`: Work Request/Attempt semantics, PostgreSQL persistence, worker registration/heartbeats/drain state, leases, artifact commits, exceptions, transactional outbox, and run namespaces.
- `packages/axiom/axiom-identity`: Business/Web Presence/domain-independent identity contracts, PostgreSQL/in-memory identity stores, lifecycle and bitemporal queries, automated precision-first resolution, and signed exceptional decisions.
- `packages/axiom/axiom-intake`: bounded public-source fetch/extraction and evidence-backed identity projection; it must never infer private/authenticated evidence or auto-merge ambiguous candidates.
- `packages/axiom/axiom-vault`: content-addressed object storage, S3 adapter, PostgreSQL manifest/hold/tombstone registry, signature verification, legal holds, and whole-artifact erasure.
- `packages/axiom/axiom-capture`: public capture/schedule contracts, deterministic keys, bounded discovery, live HTTP/Playwright/Browsertrix/replay adapters, evidence indexes, closure/seal guards, and local-dev site evidence capture (site-evidence graphs, check targets, safety validation, Playwright capture adapter, diagnostic types, run paths, reports, action packs, audience profiles). `playwright` is a peerDependency.
- `packages/axiom/axiom-methodology`: immutable methodology packages, validation, signed governance, compatibility, and epistemic contracts.
- `packages/axiom/axiom-study`: real instruments (pure functions), observation/study persistence interfaces and in-memory stores, findings, uncertainty, cache/fingerprint/timeline. PostgreSQL store implementations live in `axiom-runtime`. Strict leaf — no runtime dependencies.
- `packages/axiom/axiom-dashboard`: rebuildable PostgreSQL read models, OIDC actor/permission contracts, and signed idempotent command bus.
- `packages/axiom/axiom-publication`: durable release policy/candidate/approval state, projection/evidence-map safety, reproducible static builds, immutable deployment, and correction/withdrawal lineage.
- `packages/axiom/axiom-ops`: cadence, worker/lease, telemetry, egress, preservation/recovery evidence, rootless single-server deployment, and fail-closed launch checks.
- `packages/axiom/axiom-acceptance`: signed production seal, scenario/simulation gates, and the fail-closed operational readiness capability registry.
- `packages/axiom/axiom-runtime`: shared explicit `fixture` or persistent PostgreSQL identity/control/Vault, S3, file-backed signing, pg-boss dispatch/worker execution, heartbeat supervision, Attempt settlement, and PostgreSQL study/automation stores.
- `packages/axiom/axiom-pg-helpers`: shared PostgreSQL helper utilities — `DbRow` type, JSON serialization (`json`/`parseJson`), timestamp normalization, row assertions (`requireRow`/`requireValue`), unique-violation detection (`isUniqueViolation`), and transaction wrapper (`withTransaction`).

### General utilities

- `packages/brand-inticle`: brand article text processing service. `BrandInticleService` applies a chain of text processors (currently `ReductProcessor` with language-scoped abbreviation maps) to normalize and reduce article text. Processor names derive from `keyof typeof processorMap` — no separate config file needed. `ReductProcessor` accepts an optional `ReductionLanguage` (`"en" | "de" | "ru" | "uk"`) in its constructor for scoped reduction. Case preservation is Unicode-aware (`\p{L}\p{N}`). Unknown processor names in `BrandInticleServiceOptions.processors` trigger a `console.warn` and are skipped.
- `packages/strings`: string utilities such as URL normalization.
- `packages/utils`: general-purpose utility functions.
- `packages/changelog-live`: AI-powered CHANGELOG.md generator from git history. Collects commits from configured paths (including historical rename paths), groups by week, generates changelog entries via OpenAI/Anthropic/Gemini, and writes multi-language CHANGELOG files. Includes `changelog-live init` subcommand that traces git rename history to discover all historical paths and generates `changelog.config.yaml`. Integrated into `export-clients.ts` for client exports.

## Design rules

- Design shared APIs for reuse across multiple pipeline apps.
- Prefer official package exports and subpaths over deep source imports.
- Keep shared abstractions typed and stable enough to support app registries and route assembly without adapter churn.
- Extract a concern to shared code when it affects more than one app or clearly belongs to the framework boundary.
- Do not keep app-local copies of helpers once an equivalent shared helper exists.

## Shared gogol-building principles

- Shared packages should provide the standard building blocks from which app gogols are assembled: contracts, validators, runtime helpers, AI adapters, guide helpers, and reusable operational steps.
- Design shared gogol primitives so apps can build thin gogols with one operational goal, explicit prerequisites, explicit artifacts, and predictable fail-fast behavior.
- Shared helpers that wrap provider calls must keep request construction, logging metadata, and full response persistence in one aligned flow.
- Shared artifact and validation helpers must preserve the invariant that missing or invalid prerequisites stop execution before a new step output directory is created.
- When a repeated gogol pattern appears in more than one app, prefer extracting a reusable helper or step abstraction instead of documenting duplication as acceptable.

## Shared runtime contracts

- Shared engine behavior must preserve fail-fast validation before step output directory creation when prerequisites are missing or invalid.
- Shared guide generation must stay aligned with declaration-driven route assembly.
- Shared AI helpers must keep request and logging metadata aligned through one call context object.
- Shared JSON helpers must normalize provider output before app-level schema validation.
- Shared template or artifact helpers should preserve idempotent write flows and invalid output backup behavior.
- Shared AI logging helpers must persist both model metadata and the full provider response inside the same `AI/ai-<k>/` call directory.

## Extraction guidance

- Extract to `pipeline-core` for contracts, engine behavior, phases, steps, validators, and guide rendering.
- Extract to `pipeline-node` for Node runtime, filesystem access, artifact helpers, path generation, declaration loading, logging, and prompt/template utilities.
- Extract to `pipeline-ai` for provider communication and AI JSON parsing or normalization.
- Extract to `pipeline-steps` for reusable operational steps and human gates.

## Testing

- All test files live in `src/tests/` — never alongside source files or in `__tests__/`.
- Every package with tests must have a `vitest.config.ts` with `resolve.conditions: ["@syrokomskyi/source"]`.
- The `test` script is always `"test": "pnpm exec vitest run"`.
- Test fixtures go in `src/tests/__fixtures__/`.
- See [`.agents/rules/testing.md`](../.agents/rules/testing.md) for what to test per package category and [`.agents/rules/property-based-testing.md`](../.agents/rules/property-based-testing.md) for PBT guidance.

## Anti-patterns

- Do not deep-import from another package's `src` directory.
- Do not leave repeated app-local wrappers in place when a generic shared helper can replace them.
- Do not move app-local runtime data contracts into shared packages.
- Do not introduce breaking shared abstractions without updating affected app consumers.
- Do not place test files outside `src/tests/` or use `__tests__/` directories.
