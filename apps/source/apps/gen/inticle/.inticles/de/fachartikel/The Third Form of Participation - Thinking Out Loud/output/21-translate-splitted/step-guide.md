# Step 21: Translate article sections

- **Step ID:** `translate-splitted`
- **Decision type:** Auto
- **Phase:** Experience and assets

## Why this step exists

Produce language-specific section files from the primary-language section corpus.

## Inputs

- Section files from `split-by-h2`
- Translation prompt and target languages from the brief

## Outputs

- Directories `translated-inticle-<lang>/` with translated section files

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Prepare the cover prompt (`illustrate-prompt`)
