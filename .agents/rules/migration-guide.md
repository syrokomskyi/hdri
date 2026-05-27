# Migration guide for legacy pipelines to phase-driven architecture

## AI migration instructions

When migrating a legacy pipeline:

1. **Start with analysis**:
   - Read all legacy pipeline files
   - Use AST parsing to understand structure
   - Generate dependency graph
   - Identify reusable vs app-specific code

2. **Detect phases automatically**:
   - Group steps by semantic similarity
   - Identify handoff points (file I/O, human gates)
   - Propose phase names based on purpose
   - Create nested phases for complex segments

3. **Extract gogols systematically**:
   - One gogol per operational goal
   - Determine factory type from operation pattern
   - Extract inputs/outputs from file operations
   - Identify decision types (automated, human_confirms, client_chooses)

4. **Generate declarations first, code second**:
   - Create all markdown declarations before code
   - Ensure declarations are complete and valid
   - Use declarations as source of truth for code generation
   - Prefer shared frontmatter/declaration helpers from `packages/pipeline-node` instead of app-local markdown parsing code

5. **Reuse shared packages aggressively**:
   - Check if operation exists in packages/* before creating app-local code
   - Propose extraction to packages/* when pattern repeats
   - Use shared AI helpers, I/O helpers, validation helpers, and reusable operational steps
   - Prefer `packages/pipeline-steps` for reusable human gates and pause-like steps
   - Prefer `createOpenAiJson(...)` when migrating OpenAI text calls that expect structured JSON
   - Prefer logging-aware runtime adapters such as `createLoggedOpenAiHelpers(...)` instead of hand-written AI logging wrappers

6. **Preserve behavior, modernize structure**:
   - Keep same operational logic
   - Adapt to new context/state model
   - Use artifact accessors instead of hardcoded paths
   - Type app registries and route members against shared `PipelineStep<PipelineContext>` contracts when shared steps participate in the route
   - Maintain retry/reuse policies

7. **Apply Turborepo monorepo hygiene after migration**:
   - Keep legacy source material inside `spec/**` as read-only reference material, but do not let legacy spec snapshots participate in Turborepo task inputs or workspace automation scans
   - Add the new app `tsconfig.json` to the root `tsconfig.json` `references` array when the repository uses TypeScript project references
   - Verify the migrated app with the relevant root-level Turbo check tasks before claiming that the app is ready to start from the monorepo root

8. **Generate comprehensive migration report**:
   - List all migrated steps
   - Show phase mapping
   - Highlight extracted shared code
   - Document manual review points
