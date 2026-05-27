# Generate Pipeline Declarations

Use this template when generating markdown declarations for a migrated pipeline.

## Declaration Generation Order

1. Generate `pipeline.md` first (top-level structure)
2. Generate `phases/*.md` for each phase
3. Generate `gogols/*.md` for each gogol
4. Validate all declarations are consistent

## Template: pipeline.md

```markdown
---
title: [Pipeline title - describe what it produces]
quickStart:
  - [Step 1 for operator to prepare before running]
  - [Step 2 for operator to prepare before running]
  - [How to start the pipeline]
  - [Where to find execution guides]
operatingRules:
  - [Rule 1: how steps interact]
  - [Rule 2: artifact trust model]
  - [Rule 3: human gate behavior]
  - [Rule 4: reuse policy]
members:
  - [phase-id-1]
  - [phase-id-2]
  - [phase-id-3]
---
```

**Guidelines:**
- `title`: Clear, concise description of pipeline purpose
- `quickStart`: Actionable steps for operators
- `operatingRules`: Principles that govern pipeline execution
- `members`: Top-level phase ids in execution order

## Template: phases/[phase-id].md

```markdown
---
title: [Phase title]
purpose: [What milestone this phase achieves]
entryCriteria:
  - [Condition 1 that must be true to enter this phase]
  - [Condition 2 that must be true to enter this phase]
successSignals:
  - [Signal 1 that phase is progressing well]
  - [Signal 2 that phase is progressing well]
exitCriteria:
  - [Condition 1 that must be true to exit this phase]
  - [Condition 2 that must be true to exit this phase]
members:
  - [gogol-id-1]
  - [gogol-id-2]
  - id: [gogol-id-3]
    whenFeature: [cover|mindMaps|announces]
---
```

**Guidelines:**
- `title`: Milestone or operational segment name
- `purpose`: One-sentence description of what this phase accomplishes
- `entryCriteria`: Prerequisites for starting this phase
- `successSignals`: Observable indicators of progress
- `exitCriteria`: Conditions for phase completion
- `members`: Ordered list of gogol ids or nested phase ids
- Use `whenFeature` for optional/conditional members

## Template: gogols/[gogol-id].md

```markdown
---
factory: [factory-name]
title: [Human-readable step title]
purpose: [What operational goal this gogol achieves]
inputs:
  - [Input 1 description with file paths in backticks]
  - [Input 2 description with file paths in backticks]
outputs:
  - [Output 1 description with file paths in backticks]
  - [Output 2 description with file paths in backticks]
definitionOfDone:
  - [Criterion 1 for step completion]
  - [Criterion 2 for step completion]
decisionType: [automated|human_confirms|client_chooses]
notes:
  - [Important note 1 for operators]
  - [Important note 2 for operators]
config:
  [paramName]: [paramValue]
  [paramName2]: [paramValue2]
---
```

**Guidelines:**
- `factory`: Maps to gogol class constructor in registry
- `title`: Operator-facing step name
- `purpose`: Clear explanation of what this step does
- `inputs`: Specific files/artifacts consumed (use backticks for paths)
- `outputs`: Specific files/artifacts produced (use backticks for paths)
- `definitionOfDone`: Criteria for successful completion
- `decisionType`: 
  - `automated` - runs without human intervention
  - `human_confirms` - waits for approval artifact
  - `client_chooses` - waits for client selection artifact
- `notes`: Additional context for operators
- `config`: Parameters for factory instantiation (omit if none)

## Naming Conventions

### Phase IDs
- Use kebab-case
- Reflect milestone or segment: `input-readiness`, `evidence-acquisition`, `editorial-production`
- Keep stable across versions (affects output numbering)

### Gogol IDs
- Use kebab-case
- Descriptive of operation: `check-input`, `draft`, `translate-splitted`
- For repeated patterns, use suffix: `url-sources-1`, `url-sources-2`
- For parameterized instances, use descriptive suffix: `translate-announces`, `translate-mind-map`

### Factory Names
- Use kebab-case
- Generic operation name: `translate`, `url-sources-circle`, `wait-human`
- Same factory can be used by multiple gogol instances with different configs

## Validation Checklist

Before finalizing declarations:

- [ ] All phase ids referenced in `pipeline.md` have corresponding phase files
- [ ] All gogol ids referenced in phase files have corresponding gogol files
- [ ] All factory names in gogol files have implementations in gogol-registry
- [ ] Feature gates (`whenFeature`) match brief feature flags
- [ ] Input/output paths are consistent across dependent gogols
- [ ] Decision types match actual gogol behavior
- [ ] Config parameters match factory constructor expectations
- [ ] No circular dependencies between phases/gogols
- [ ] Step numbering will be stable (order is intentional)
