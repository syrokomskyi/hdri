# Step 2: Validate the input package

- **Step ID:** `check-input`
- **Decision type:** Auto
- **Phase:** Input readiness

## Why this step exists

Parse the brief, verify required input files, and stop early if the article packet is incomplete or still contains placeholders.

## Inputs

- `.input/brief.md` → always required
- `.input/soul-profile.md` → always required
- `.input/resource-overview.md` → required for types guest, comparison, practical_guide, year_update, local_sector_site_review
- `.input/visual-profile.md` → required for types guest, comparison, practical_guide, seo_expert_forecast, checklist, year_update, local_sector_site_review, by_git_history
- `.input/git-history.md` → required only for type by_git_history (commit-derived storytelling)
- Feature flag `cover: true` in brief.md adds `visual-profile.md` requirement

## Outputs

- File `report.md` for artifact `report`

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Confirm Input Readiness Phase (`wait-phase-input-readiness-accepted`)