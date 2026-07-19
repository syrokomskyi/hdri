# Step 22: Prepare the cover prompt

- **Step ID:** `illustrate-prompt`
- **Decision type:** Auto
- **Phase:** Cover assets

## Why this step exists

Generate the image-generation prompt that captures the article topic and visual constraints.

## Inputs

- Branded article context
- Visual profile inputs when cover generation is enabled

## Outputs

- File `prompt.md` for artifact `prompt`

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Generate the cover image (`illustrate-google`)
