# Step 8: Design the analysis meta-prompt

- **Step ID:** `meta-prompt-for-analyse-sources`
- **Decision type:** Auto
- **Phase:** Editorial production

## Why this step exists

Create the high-level editorial instruction set that explains how source analysis should think about the article brief.

## Inputs

- Parsed brief from pipeline state
- `pipeline-route.md` from `route-pipeline`
- Optional manual context inputs such as `resource-overview.md` and `git-history.md`
- Optional normalized operator payload from `normalize-operator-payload`
- Optional normalized Git-history framing from `git-history-analysis`, including episode candidates, ranked episodes, the narrative bridge, and sanitization guidance
- Meta-prompt template for source analysis

## Outputs

- File `meta-prompt.md` for artifact `metaPrompt`

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Prepare the analysis prompt (`prompt-for-analyse-sources`)
