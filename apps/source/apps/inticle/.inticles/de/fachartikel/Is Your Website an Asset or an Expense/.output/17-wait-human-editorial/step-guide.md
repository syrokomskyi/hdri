# Step 17: Editorial approval gate

- **Step ID:** `wait-human-editorial`
- **Decision type:** Client chooses
- **Phase:** Editorial production

## Why this step exists

Pause for human review so the editor can approve or replace the article before downstream packaging begins.

## Inputs

- Article from `soul-inticle`
- Context from `analytical-synthesis` and `contradiction-detection`

## Outputs

- Directory `hip-soul-inticle/` with the approved article package

## Definition of Done

- The editor places the approved article inside `hip-soul-inticle/`.
- `hip-soul-inticle/inticle.md` is the authoritative approved article for all downstream packaging steps.
- Rerunning the pipeline lets packaging steps consume the approved article without another pause.

## Next step

- Design the interaction block (`interaction-design`)