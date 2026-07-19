# Step 19: Brand the approved article

- **Step ID:** `brand-inticle`
- **Decision type:** Auto
- **Phase:** Experience and assets

## Why this step exists

Insert the interaction block and validate the approved article structure before section-based packaging starts.

## Inputs

- Approved article from `wait-human-editorial`
- Interaction block from `interaction-design`

## Outputs

- File `inticle.md` for artifact `brandedInticle`

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Split the article by H2 sections (`split-by-h2`)
