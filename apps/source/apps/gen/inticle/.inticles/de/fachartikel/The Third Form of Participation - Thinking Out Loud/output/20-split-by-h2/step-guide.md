# Step 20: Split the article by H2 sections

- **Step ID:** `split-by-h2`
- **Decision type:** Auto
- **Phase:** Experience and assets

## Why this step exists

Break the branded article into ordered section files so translation, mapping, and packaging can work section by section.

## Inputs

- Branded article from `brand-inticle`

## Outputs

- Directory `splitted-by-h2/` with numbered Markdown section files

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Translate article sections (`translate-splitted`)
