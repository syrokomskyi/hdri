# Step 3: Confirm Input Readiness Phase

- **Step ID:** `wait-phase-input-readiness-accepted`
- **Decision type:** Human confirms
- **Phase:** Input readiness

## Why this step exists

Pause after input validation so the operator can approve the full input package before URL discovery starts.

## Inputs

- Validation reports from `check-inticle-types` and `check-input`

## Outputs

- Approval note `phase-input-readiness-accepted.md`

## Definition of Done

- `phase-input-readiness-accepted.md` exists and no longer contains `TBD` or `TODO`.
- The approval note records any manual corrections, boundary conditions, or important assumptions for downstream research.

## Notes

- Record any manual corrections or assumptions that should constrain source discovery.

## Next step

- Materialize the pipeline route (`route-pipeline`)