# Step 15: Rewrite after audit

- **Step ID:** `checked-inticle`
- **Decision type:** Auto
- **Phase:** Editorial production

## Why this step exists

Apply the audit findings to produce a stronger version of the article before voice adaptation.

## Inputs

- Combined article from `all-md`
- Audit report from `check`
- Brief with language and article type
- Human approval note `phase-analysis-frame-accepted.md` with resolved gaps, confidence levels, and locked caveats

## Outputs

- File `inticle.md` for artifact `inticle`

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Adapt to the author voice (`soul-inticle`)
