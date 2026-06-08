# Step 27: Confirm Experience Assets Phase

- **Step ID:** `wait-phase-experience-assets-accepted`
- **Decision type:** Human confirms
- **Phase:** Experience and assets

## Why this step exists

Pause after interactive and visual asset preparation so the operator can approve the enriched article package before final publication packaging starts.

## Inputs

- Interaction design from `interaction-design`
- Branded and sectioned article outputs from `brand-inticle`, `split-by-h2`, and `translate-splitted`
- Optional cover and mind-map assets when the related features are enabled

## Outputs

- Approval note `phase-experience-assets-accepted.md`

## Definition of Done

- `phase-experience-assets-accepted.md` exists and no longer contains `TBD` or `TODO`.
- The approval note records any asset-level constraints, packaging expectations, or feature-specific caveats.

## Notes

- Use the note to capture any asset-level constraints that packaging must preserve.

## Next step

- Compose language-specific articles (`compose-inticle`)