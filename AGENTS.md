<!--
  GENERATED. Safe to edit — project-specific changes are expected and encouraged.
  This file is generated but editable — your changes are preserved on regeneration.
  Owner command: forge.agents.generate
  Edit instead: the forge.agents.generate generator source (not this file).
  Regenerate:   forge forge.agents.generate
-->

## Session-end housekeeping

`forge docs.archive` moves stale `docs/sessions/*.md` into `docs/sessions/archive/`, but `.forge/pinned.yaml` protects `docs/sessions/` with `mode: protect` — the moves fail `pinned.validate` at commit time (one violation per moved file, source + destination). After running `docs.archive`, revert any `docs/sessions/` moves (`git reset`, move files back) and commit only the new session transcript, `docs/metrics/sessions/*`, and living-spec merges. Do not force-commit session relocations.
