# Step 18: Design the interaction block

- **Step ID:** `interaction-design`
- **Decision type:** Auto
- **Phase:** Experience and assets

## Why this step exists

Generate the article-level interaction design and the concrete block that should be inserted into the approved article.

## Inputs

- Brief from pipeline state
- Synthesis and the approved article from upstream editorial steps
- Human approval note `phase-analysis-frame-accepted.md` with clarifications, caveats, and unresolved questions
- Interaction-design prompt

## Outputs

- File `interaction-design.json` for artifact `interactionDesign`
- File `interaction-block.md` for artifact `interactionBlock`

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Brand the approved article (`brand-inticle`)
