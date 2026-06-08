# Step 10: Write the article draft

- **Step ID:** `draft`
- **Decision type:** Auto
- **Phase:** Editorial production

## Why this step exists

Generate the main body of the article from the brief, the active evidence route, synthesis, and any route-specific evidence framing that should shape the final structure.

## Inputs

- Brief and payload from pipeline state
- `pipeline-route.md` from `route-pipeline`
- Optional `.input/resource-overview.md`
- Normalized payload from `normalize-operator-payload` when operator research is the primary evidence path
- Optional `.input/git-history.md` when the article depends on commit evidence and episode clustering
- Normalized Git-history framing such as ranked episodes, narrative bridge, and sanitization guidance when the article type is `by_git_history`
- Synthesis, contradictions when available, and knowledge gaps
- Human approval note `phase-analysis-frame-accepted.md` with answers to knowledge gaps, confidence levels, and drafting caveats
- Type-specific draft prompt

## Outputs

- File `draft.md` for artifact `draft`

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Write the lead paragraph (`lead-paragraph`)