# Step 1: Validate article-type contracts

- **Step ID:** `check-inticle-types`
- **Decision type:** Auto
- **Phase:** Input readiness

## Why this step exists

Make sure the configured article types, prompts, evidence profiles, editorial envelopes, and route-dependent three-circle research configs are consistent before runtime work starts.

## Inputs

- Configured article types from run-time settings
- Prompt files for draft/check flows
- Three-circle research configuration for article types whose evidence profile still uses discovery research

## Outputs

- File `report.md` for artifact `report`

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Validate the input package (`check-input`)