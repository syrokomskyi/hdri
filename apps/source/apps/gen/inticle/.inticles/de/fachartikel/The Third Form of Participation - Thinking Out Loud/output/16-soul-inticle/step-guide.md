# Step 16: Adapt to the author voice

- **Step ID:** `soul-inticle`
- **Decision type:** Auto
- **Phase:** Editorial production

## Why this step exists

Rewrite the approved article draft into the author's tone, phrasing, and stylistic profile.

## Inputs

- Rewritten article from `checked-inticle`
- `.input/soul-profile.md`
- Voice-adaptation prompt

## Outputs

- File `inticle.md` for artifact `inticle`

## Definition of Done

- All declared artifacts exist in the step output directory.
- The step finishes without validation errors and can be reused safely on rerun.

## Next step

- Editorial approval gate (`wait-human-editorial`)
