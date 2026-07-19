# Step 24: Describe the cover

- **Step ID:** `describe-cover`
- **Decision type:** Auto
- **Phase:** Cover assets

## Why this step exists

Create a textual description of the generated cover so downstream packaging has both the image and its editorial framing.

## Inputs

- Generated cover image

## Outputs

- File `description.md` for artifact `description`

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Generate section mind maps (`draw-mind-map`)
