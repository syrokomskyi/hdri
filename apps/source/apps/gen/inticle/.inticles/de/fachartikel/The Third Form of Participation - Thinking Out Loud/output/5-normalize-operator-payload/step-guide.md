# Step 5: Normalize operator-prepared payload

- **Step ID:** `normalize-operator-payload`
- **Decision type:** Auto
- **Phase:** Analytical frame

## Why this step exists

Convert manually prepared payload materials into a structured evidence packet that analytical synthesis and drafting can trust when external research phases are intentionally skipped.

## Inputs

- Parsed brief from pipeline state
- Brief payload from `check-input`
- Optional `resource-overview.md`
- `pipeline-route.md` from `route-pipeline`

## Outputs

- `normalized-payload.md` with supported claims, open questions, exclusions, and editorial angles

## Definition of Done

- The payload is organized into direct evidence, validation gaps, and safe editorial framing
- Downstream synthesis can consume one normalized evidence packet instead of raw payload fragments

## Next step

- Build analytical synthesis (`analytical-synthesis`)
