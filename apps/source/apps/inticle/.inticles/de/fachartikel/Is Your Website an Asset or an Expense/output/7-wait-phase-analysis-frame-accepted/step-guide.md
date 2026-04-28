# Step 7: Confirm Analysis Frame Phase

- **Step ID:** `wait-phase-analysis-frame-accepted`
- **Decision type:** Human confirms
- **Phase:** Analytical frame

## Why this step exists

Pause after analytical synthesis so the operator can approve the narrative frame, evidence balance, and known gaps before drafting.

## Inputs

- `synthesis.md` and `knowledge-gaps.md` from `analytical-synthesis`

## Outputs

- Approval note `phase-analysis-frame-accepted.md`

## Definition of Done

- `phase-analysis-frame-accepted.md` exists and no longer contains `TBD` or `TODO`.
- The approval note records the approved narrative frame, confidence level, unresolved questions, and any operator-provided answers to knowledge gaps for drafting.

## Notes

- Use the note to lock the intended framing, caveats, and open questions for the editorial phase.
- If you have missing context, answer it in `phase-analysis-frame-accepted.md` rather than editing `knowledge-gaps.md` directly.
- Drafting, audit, rewrite, and interaction-design gogols will read this approval note on rerun.

## Next step

- Design the analysis meta-prompt (`meta-prompt-for-analyse-sources`)