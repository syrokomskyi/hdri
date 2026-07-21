# Step 9: Prepare the analysis prompt

- **Step ID:** `prompt-for-analyse-sources`
- **Decision type:** Auto
- **Phase:** Editorial production

## Why this step exists

Turn the meta-prompt into a concrete operational prompt for the article drafting flow.

## Inputs

- Meta-prompt from `meta-prompt-for-analyse-sources`

## Outputs

- File `prompt.md` for artifact `prompt`

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Write the article draft (`draft`)