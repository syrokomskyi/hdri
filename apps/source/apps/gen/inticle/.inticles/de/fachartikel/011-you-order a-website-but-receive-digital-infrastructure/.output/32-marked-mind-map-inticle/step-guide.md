# Step 32: Link mind maps to article headings

- **Step ID:** `marked-mind-map-inticle`
- **Decision type:** Auto
- **Phase:** Publication packaging

## Why this step exists

Add stable heading anchors so article sections and mind maps can reference each other in the final package.

## Inputs

- Composed article set from `compose-inticle`
- Translated mind maps when the feature is enabled

## Outputs

- Directory `marked-mind-map-inticle/` with anchor-marked article files

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Assemble final article packages (`final-inticle`)