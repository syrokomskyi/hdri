# Step 26: Translate mind maps

- **Step ID:** `translate-mind-map`
- **Decision type:** Auto
- **Phase:** Mind map assets

## Why this step exists

Translate mind map files into the target publication languages.

## Inputs

- Mind maps from `draw-mind-map`
- Translation prompt and target languages from the brief

## Outputs

- Directories `translated-mind-map-<lang>/` with translated mind maps

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Confirm Experience Assets Phase (`wait-phase-experience-assets-accepted`)
