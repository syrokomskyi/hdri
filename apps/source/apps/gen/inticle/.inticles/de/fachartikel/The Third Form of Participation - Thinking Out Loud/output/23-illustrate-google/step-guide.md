# Step 23: Generate the cover image

- **Step ID:** `illustrate-google`
- **Decision type:** Auto
- **Phase:** Cover assets

## Why this step exists

Produce the publication cover image from the prepared illustration prompt.

## Inputs

- Prompt from `illustrate-prompt`
- Configured image model settings

## Outputs

- File `cover.webp` for artifact `cover`

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Describe the cover (`describe-cover`)
