# Self-explained article pipeline

Self-explained article pipeline for article type `guest`. Evidence profile: `operator-research`. Primary language: `ru`. Narrator perspective: `first_person_singular` (`я`). Target languages: `ru`, `de`, `en`. Enabled extras: cover, mind maps, announcements.

## Quick start

- Prepare `.input/brief.md` and all required article inputs before starting the run.
- In `.input/brief.md`, set narratorPerspective to control author-facing prose: use first_person_singular for 'first person singular' or first_person_plural for 'first person plural'.
- Start the pipeline from the monorepo root with `pnpm turbo run start --filter=@syrokomskyi/inticle`.
- Read `.output/_guide/start-here.md` for the route and each step's `step-guide.md` for the local contract.
- Confirm the route decision in the `route-pipeline` step output directory (`pipeline-route.md`) before expecting discovery or editorial-envelope branches to run.
- If a step pauses, satisfy the requested files in that step output directory and rerun the pipeline.

## Operating rules

- One step owns one operational goal and produces artifacts that the next step can trust.
- Downstream work should rely on validated upstream artifacts, not ad hoc file paths.
- Human decisions are explicit gates; the pipeline only resumes after the requested approval artifacts appear.
- Article-type routing is explicit: evidence profile decides which research phases run, which are skipped, and which evidence sources are primary.
- Narrator perspective is explicit: the operator controls whether the article speaks from `я` or `мы` through `brief.md`, and drafting/rewrite steps must preserve that contract.
- When the engine reuses a step, treat its validated artifacts as the source of truth for the current run.

## Route

### Input readiness (Steps 1-4)

Validate the brief, inticle type configuration, and all required manual inputs so the pipeline starts from a stable operator-approved contract.

- 1. Validate article-type contracts `check-inticle-types`
- 2. Validate the input package `check-input`
- 3. Confirm Input Readiness Phase `wait-phase-input-readiness-accepted`
- 4. Materialize the pipeline route `route-pipeline`

### Analytical frame (Steps 5-7)

Turn the approved evidence corpus into a synthesis, uncertainty model, and knowledge-gap framing that editorial writing can safely build on, including routes that must transform raw project evidence such as Git history into narrative episodes.

- 5. Normalize operator-prepared payload `normalize-operator-payload`
- 6. Build analytical synthesis `analytical-synthesis`
- 7. Confirm Analysis Frame Phase `wait-phase-analysis-frame-accepted`

### Editorial production (Steps 8-17)

Draft, audit, refine, and human-approve the article before packaging and publication work begins.

- 8. Design the analysis meta-prompt `meta-prompt-for-analyse-sources`
- 9. Prepare the analysis prompt `prompt-for-analyse-sources`
- 10. Write the article draft `draft`
- 11. Write the lead paragraph `lead-paragraph`
- 12. Write the closing paragraph `final-paragraph`
- 13. Assemble the full article `all-md`
- 14. Audit the article `check`
- 15. Rewrite after audit `checked-inticle`
- 16. Adapt to the author voice `soul-inticle`
- 17. Editorial approval gate `wait-human-editorial`

### Experience and assets (Steps 18-27)

Prepare interaction structure, visual assets, translated sections, and optional cover or mind-map materials so the approved article becomes a complete publication asset set.

- 18. Design the interaction block `interaction-design`
- 19. Brand the approved article `brand-inticle`
- 20. Split the article by H2 sections `split-by-h2`
- 21. Translate article sections `translate-splitted`
- 27. Confirm Experience Assets Phase `wait-phase-experience-assets-accepted`

#### Cover assets (Steps 22-24)

Prepare and generate the article cover package when the cover feature is enabled.

- 22. Prepare the cover prompt `illustrate-prompt`
- 23. Generate the cover image `illustrate-google`
- 24. Describe the cover `describe-cover`

#### Mind map assets (Steps 25-26)

Generate and translate section mind maps when the mind-map feature is enabled.

- 25. Generate section mind maps `draw-mind-map`
- 26. Translate mind maps `translate-mind-map`

### Publication packaging (Steps 28-34)

Assemble the final per-language publication packages, including optional announcements and linked mind maps, into the release-ready delivery set.

- 28. Compose language-specific articles `compose-inticle`
- 32. Link mind maps to article headings `marked-mind-map-inticle`
- 33. Assemble final article packages `final-inticle`
- 34. Confirm Publication Packaging Phase `wait-phase-publication-packaging-accepted`

#### Announcement packaging (Steps 29-31)

Generate, approve, and translate promotional announcements when the announcement feature is enabled.

- 29. Draft promotional announcements `announce`
- 30. Announcement approval gate `wait-human-announces`
- 31. Translate approved announcements `translate-announces`