# Step 4: Materialize the pipeline route

- **Step ID:** `route-pipeline`
- **Decision type:** Auto
- **Phase:** Input readiness

## Why this step exists

Translate the selected article type contract into an explicit pipeline route, evidence-priority order, and skip markers before downstream research phases begin.

## Inputs

- Parsed brief from `check-input`
- Article-type contract from `run/inticle-types.ts`

## Outputs

- `pipeline-route.md` with active phases, conditional steps, and evidence priority
- Optional phase skip markers when source discovery or evidence acquisition is intentionally disabled

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Normalize operator-prepared payload (`normalize-operator-payload`)