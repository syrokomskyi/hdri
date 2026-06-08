# Step 6: Build analytical synthesis

- **Step ID:** `analytical-synthesis`
- **Decision type:** Auto
- **Phase:** Analytical frame

## Why this step exists

Combine the active evidence route, contradictions or operator-payload normalization, and optional Git-history framing into the editorial frame that will drive the main article draft.

## Inputs

- `pipeline-route.md` from `route-pipeline`
- Unique claims from `claim-deduplication` when the route uses pipeline research
- Contradictions from `contradiction-detection` when the route uses pipeline research
- Normalized payload from `normalize-operator-payload` when the route uses operator research
- Optional Git-history episode framing from `git-history-analysis` when the route uses internal evidence
- `.input/brief.md`

## Outputs

- File `synthesis.md` for artifact `synthesis`
- File `knowledge-gaps.md` for artifact `knowledgeGaps`

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Confirm Analysis Frame Phase (`wait-phase-analysis-frame-accepted`)