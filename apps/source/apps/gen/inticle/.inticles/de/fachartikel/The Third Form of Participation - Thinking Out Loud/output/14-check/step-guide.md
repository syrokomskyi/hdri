# Step 14: Audit the article

- **Step ID:** `check`
- **Decision type:** Auto
- **Phase:** Editorial production

## Why this step exists

Review the full article against the brief and evidence frame, then produce an editorial audit of weaknesses and fixes.

## Inputs

- Combined article from `all-md`
- Brief from pipeline state
- Synthesis, route-appropriate contradictions context, and knowledge gaps
- Human approval note `phase-analysis-frame-accepted.md` with operator clarifications and locked caveats
- Type-specific audit prompt

## Outputs

- File `check.md` for artifact `check`

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Rewrite after audit (`checked-inticle`)
