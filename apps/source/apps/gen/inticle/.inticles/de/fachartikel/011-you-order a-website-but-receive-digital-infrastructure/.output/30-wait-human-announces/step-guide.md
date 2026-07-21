# Step 30: Announcement approval gate

- **Step ID:** `wait-human-announces`
- **Decision type:** Client chooses
- **Phase:** Announcement packaging

## Why this step exists

Pause for human review so approved announcement variants can be selected before translation and packaging.

## Inputs

- Announcement drafts from `announce`

## Outputs

- Directory `hip-announces/` with approved announcement files
- Hidden approval note `hip-announces/-approval.md`

## Definition of Done

- The operator places approved announcement files inside `hip-announces/`.
- `hip-announces/-approval.md` exists and no longer contains `TBD` or `TODO`.
- The approved files in `hip-announces/` are the authoritative source for downstream translation and packaging.
- Rerunning the pipeline lets translation continue from the approved announcement set.

## Next step

- Translate approved announcements (`translate-announces`)