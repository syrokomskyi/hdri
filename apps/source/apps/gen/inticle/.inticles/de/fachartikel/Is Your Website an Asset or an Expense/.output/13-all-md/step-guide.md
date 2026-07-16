# Step 13: Assemble the full article

- **Step ID:** `all-md`
- **Decision type:** Auto
- **Phase:** Editorial production

## Why this step exists

Merge the active editorial-envelope sections into one full article document for audit and revision.

## Inputs

- Lead paragraph from `lead-paragraph` when the route keeps a separate opening
- Draft from `draft`
- Closing paragraph from `final-paragraph` when the route keeps a separate ending

## Outputs

- File `all.md` for artifact `all`

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Audit the article (`check`)