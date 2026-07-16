# Step 12: Write the closing paragraph

- **Step ID:** `final-paragraph`
- **Decision type:** Auto
- **Phase:** Editorial production

## Why this step exists

Create the final paragraph that lands the argument and gives the article a coherent ending when the selected article type keeps a separate closing outside the main draft body.

## Inputs

- Lead paragraph from `lead-paragraph`
- Draft text from `draft`
- Brief with the primary language and article type

## Outputs

- File `final-paragraph.md` for artifact `finalParagraph`

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Assemble the full article (`all-md`)