# Step 33: Assemble final article packages

- **Step ID:** `final-inticle`
- **Decision type:** Auto
- **Phase:** Publication packaging

## Why this step exists

Produce the final publication directories per language, combining article text with optional cover and mind-map assets.

## Inputs

- Marked article set from `marked-mind-map-inticle`
- Generated cover when enabled
- Translated mind maps when enabled

## Outputs

- Directories `final-inticle-<lang>/` ready for publication

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Confirm Publication Packaging Phase (`wait-phase-publication-packaging-accepted`)