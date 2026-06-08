# Step 2: Validate the input package

- **Step ID:** `check-input`
- **Decision type:** Auto
- **Phase:** Input readiness

## Why this step exists

Parse the brief, verify required input files, and stop early if the article packet is incomplete or still contains placeholders.

## Inputs

- `.input/brief.md`
- Type-specific input files required by the selected article type
- Manual evidence packs such as `git-history.md` when the selected article type depends on commit-derived storytelling
- git log --pretty=format:"### %h%n**%s**%n%n%b%n---" --reverse > git-history.md
- Feature-driven optional inputs such as `visual-profile.md`

## Outputs

- File `report.md` for artifact `report`

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Confirm Input Readiness Phase (`wait-phase-input-readiness-accepted`)