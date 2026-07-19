# Step 25: Generate section mind maps

- **Step ID:** `draw-mind-map`
- **Decision type:** Auto
- **Phase:** Mind map assets

## Why this step exists

Create mind maps for the internal sections of the article so the final package can include navigable visual summaries.

## Inputs

- Section files from `split-by-h2`
- Branded article from `brand-inticle`
- Mind-map prompt

## Outputs

- Directory `mind-map/` with section mind maps and a branded article copy

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Translate mind maps (`translate-mind-map`)
