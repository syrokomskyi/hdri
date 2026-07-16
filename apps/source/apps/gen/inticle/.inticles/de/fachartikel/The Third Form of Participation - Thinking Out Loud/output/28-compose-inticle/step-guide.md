# Step 28: Compose language-specific articles

- **Step ID:** `compose-inticle`
- **Decision type:** Auto
- **Phase:** Publication packaging

## Why this step exists

Reassemble numbered section files into complete article files for every publication language.

## Inputs

- Primary-language sections from `split-by-h2`
- Translated sections from `translate-splitted` for non-primary languages

## Outputs

- Directory `composed-inticle/` with one composed article per language

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Draft promotional announcements (`announce`)