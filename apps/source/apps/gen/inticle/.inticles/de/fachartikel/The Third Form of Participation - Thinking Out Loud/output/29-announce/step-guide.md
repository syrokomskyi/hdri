# Step 29: Draft promotional announcements

- **Step ID:** `announce`
- **Decision type:** Auto
- **Phase:** Announcement packaging

## Why this step exists

Generate platform-specific announcement texts that can be reviewed and published alongside the article.

## Inputs

- Composed article from `compose-inticle`
- `.input/soul-profile.md`
- Announcement prompt

## Outputs

- Directory `announces/` with platform-specific announcement files

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Announcement approval gate (`wait-human-announces`)
