# Analyze Legacy Pipeline

Use this template when analyzing a legacy pipeline for migration to the phase-driven architecture.

## Step 1: Code Structure Analysis

Read all files in the legacy pipeline directory and answer:

1. **Entry point**: What is the main entry file?
2. **Step organization**: How are steps/stages organized? (classes, functions, files)
3. **Execution flow**: Is it linear, branching, or conditional?
4. **Dependencies**: What external packages are used?
5. **State management**: How is state passed between steps?

## Step 2: Step Identification

For each operational step found:

1. **Step name/id**: What is it called?
2. **Purpose**: What does it do?
3. **Inputs**: What files/data does it read?
4. **Outputs**: What files/artifacts does it produce?
5. **AI calls**: Does it call LLM providers? Which ones?
6. **Human gates**: Does it wait for human approval?
7. **Error handling**: How does it handle failures?

## Step 3: Phase Detection Criteria

Group steps into phases based on:

1. **Semantic similarity**: Steps that serve the same high-level goal
2. **Handoff points**: File I/O boundaries, human approval gates
3. **Natural milestones**: Completion of a major deliverable
4. **Data flow**: Steps that work on the same artifact set

Propose phase names that reflect:
- The milestone achieved (e.g., "Input Readiness", "Evidence Acquisition")
- The operational segment (e.g., "Editorial Production", "Publication Packaging")

## Step 4: Gogol Factory Mapping

For each step, determine the factory type:

- **Simple operations**: Use step name as factory (e.g., `check-input`, `draft`)
- **Parameterized operations**: Use base factory + config (e.g., `translate` with `targetLanguages`)
- **Repeated patterns**: Use factory with instance id (e.g., `url-sources-1`, `url-sources-2`)

## Step 5: Reusability Assessment

For each piece of logic, classify as:

1. **App-specific**: Tightly coupled to this pipeline's domain/prompts
2. **Potentially shared**: Could benefit other pipelines with minor changes
3. **Already exists**: Check if similar logic exists in `packages/*`

## Step 6: Migration Complexity

Rate each step's migration complexity:

- **Low**: Simple I/O, no AI calls, straightforward logic
- **Medium**: AI calls with standard patterns, moderate logic
- **High**: Complex state management, custom AI patterns, intricate logic

## Output Format

Generate a structured analysis report:

```markdown
# Legacy Pipeline Analysis

## Overview
- Pipeline name: [name]
- Entry point: [file]
- Total steps: [count]
- Execution model: [linear/branching/conditional]

## Detected Phases

### Phase 1: [name]
- Purpose: [description]
- Entry criteria: [conditions]
- Exit criteria: [conditions]
- Members: [step-1, step-2, ...]

[Repeat for each phase]

## Gogol Mapping

### [step-id]
- Factory: [factory-name]
- Title: [human-readable title]
- Purpose: [what it does]
- Inputs: [list]
- Outputs: [list]
- Decision type: [automated/human_confirms/client_chooses]
- Complexity: [low/medium/high]
- Config: [if parameterized]

[Repeat for each gogol]

## Reusability Opportunities

- **Extract to packages/pipeline-core**: [list]
- **Extract to packages/pipeline-node**: [list]
- **Extract to packages/pipeline-ai**: [list]

## Migration Risks

- [Risk 1]: [description and mitigation]
- [Risk 2]: [description and mitigation]

## Recommended Migration Order

1. [Phase/step to migrate first]
2. [Phase/step to migrate second]
...
```
