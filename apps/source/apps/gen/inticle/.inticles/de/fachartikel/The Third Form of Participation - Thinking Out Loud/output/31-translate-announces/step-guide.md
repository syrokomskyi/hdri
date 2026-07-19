# Step 31: Translate approved announcements

- **Step ID:** `translate-announces`
- **Decision type:** Auto
- **Phase:** Announcement packaging

## Why this step exists

Translate the human-approved announcement pack into the target publication languages.

## Inputs

- Approved announcements from `wait-human-announces`
- Translation prompt and target languages from the brief

## Outputs

- Directories `translated-announces-<lang>/` with translated announcement files

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Link mind maps to article headings (`marked-mind-map-inticle`)
