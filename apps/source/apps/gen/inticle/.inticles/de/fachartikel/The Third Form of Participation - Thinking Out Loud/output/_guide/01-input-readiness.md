# Input readiness

Validate the brief, inticle type configuration, and all required manual inputs so the pipeline starts from a stable operator-approved contract.

## Entry criteria

- The operator has prepared `.input/brief.md` and other required `.input/*` materials.

## Steps

- 1. Validate article-type contracts `check-inticle-types`
- 2. Validate the input package `check-input`
- 3. Confirm Input Readiness Phase `wait-phase-input-readiness-accepted`
- 4. Materialize the pipeline route `route-pipeline`

## Success signals

- Validation reports exist for the inticle type setup and the current input folder.
- The operator has enough context to decide whether research may begin without hidden input ambiguity.
- The selected article type is translated into an explicit route before downstream phases begin.

## Exit criteria

- All required manual inputs are present, valid, explicitly approved, and routed into the correct evidence path.
