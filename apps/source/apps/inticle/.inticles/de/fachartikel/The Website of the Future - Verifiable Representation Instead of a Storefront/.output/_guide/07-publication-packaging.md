# Publication packaging

Assemble the final per-language publication packages, including optional announcements and linked mind maps, into the release-ready delivery set.

## Entry criteria

- The approved article and optional assets already exist.

## Steps

- 28. Compose language-specific articles `compose-inticle`
- 29. Draft promotional announcements `announce`
- 30. Announcement approval gate `wait-human-announces`
- 31. Translate approved announcements `translate-announces`
- 32. Link mind maps to article headings `marked-mind-map-inticle`
- 33. Assemble final article packages `final-inticle`
- 34. Confirm Publication Packaging Phase `wait-phase-publication-packaging-accepted`

## Success signals

- Final delivery directories exist for all configured languages and enabled packaging features.
- The operator can inspect one coherent release package per language instead of scattered intermediate outputs.

## Exit criteria

- The final publication package is approved for release and treated as the terminal output of the route.