# Shared Package Guidelines

Apply these rules when reading or editing files under `packages/**`.

## Purpose

- `packages/*` contains shared reusable packages and internal libraries for the Turborepo monorepo.
- Prefer extracting reusable runtime, framework, and cross-app logic here instead of duplicating it in apps.
- Keep app-specific orchestration, prompts, and domain contracts out of shared packages unless they have real multi-app value.

## Package responsibilities

### Pipeline framework

- `packages/pipeline-core`: pipeline definition, phases, shared step contracts, execution guide generation, engine behavior, shared pipeline errors/constants, and validator composition helpers.
- `packages/pipeline-node`: Node.js runtime context, artifact I/O, filesystem/path helpers, prompt/template helpers, cached frontmatter/declaration helpers, template artifact writing helpers, and logging-aware AI adapters.
- `packages/pipeline-ai`: provider wrappers, structured OpenAI helpers such as `createOpenAiJson(...)`, and resilient AI JSON normalization/parsing helpers.
- `packages/pipeline-steps`: reusable operational steps such as shared human/manual gate steps and pause steps.

### HDRI / Observatory domain

- `packages/business-core`: business domain schemas, SQLite migrations, and cross-DB helpers for the HDRI factory pipeline.
- `packages/business-crawler`: Playwright-based site crawling primitives for business data extraction.
- `packages/business-rate-limit`: token-bucket, concurrency gate, and circuit-breaker algorithms for mass crawling.
- `packages/hdri-codebook`: YAML rule parser and deterministic HDRI scoring logic (parse, score-site, aggregate).
- `packages/observatory-asset-id`: deterministic asset ID generation for observatory artifacts.
- `packages/observatory-core`: observatory ontology, signal-to-ontology mapping (`EXT_SIGNAL_MAP`), and hashing utilities.
- `packages/observatory-crypto`: cryptographic helpers used by the observatory pipeline.
- `packages/observatory-emit`: emission helpers for observatory publication artifacts.
- `packages/observatory-vault`: vault and verification helpers for observatory data integrity.

### Cosmic / Platform

- `packages/nebula`: composite 0–100 quality metric (Nebula Score) across Performance, Accessibility, Content Health, and Architectural Compliance pillars.
- `packages/passport`: build-time W3C Verifiable Credential (Cosmic Passport) with provenance, composition, Nebula Score, and Ed25519 signing.
- `packages/star-map`: cosmic metaphor utilities mapping site structure to star-map representations.

### General utilities

- `packages/async`: async retry helpers (`retry`, `withRetry`, `retryAll`, `TimeoutError`) with configurable backoff.
- `packages/colors`: color utility functions.
- `packages/growth`: growth tracking contracts and primitives.
- `packages/growth-adapter-null`: no-op growth adapter implementation.
- `packages/growth-adapter-plausible`: Plausible Analytics growth adapter implementation.
- `packages/ontology`: shared ontology definitions used across observatory and site pipelines.
- `packages/share`: shared components and helpers reused by multiple apps.
- `packages/strings`: string utilities such as URL normalization.
- `packages/utils`: general-purpose utility functions.

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

## Anti-patterns

- Do not deep-import from another package's `src` directory.
- Do not leave repeated app-local wrappers in place when a generic shared helper can replace them.
- Do not move app-local runtime data contracts into shared packages.
- Do not introduce breaking shared abstractions without updating affected app consumers.
