---
description: Prepare .input/ for a gen-pipeline app (inticle or truth) from an external materials folder or inline text — copy materials, propose topics, generate brief.md and companion file
---

# Workflow: prepare pipeline inputs

Use this workflow when the operator wants to populate `.input/` for a gen-pipeline app from an external folder of materials or from text provided directly in the prompt. The workflow copies or writes materials, proposes topics, and generates `brief.md` plus a companion file.

## Supported apps

- `inticle` — interactive article pipeline (`apps/gen/inticle`). Companion file: `resource-overview.md`. Brand-level preserved files: `soul-profile.md`, `visual-profile.md`.
- `truth` — truth research pipeline (`apps/gen/truth`). Companion file: `audience.md`. No brand-level preserved files.

## Step 1: determine target app and collect inputs from the operator

Determine the target app from the operator's request. If the operator mentions `@[apps/gen/truth]` or "truth", use `truth`. If they mention `@[apps/gen/inticle]` or "inticle"/"article", use `inticle`. If ambiguous, ask.

Ask for missing values before proceeding:

The operator must provide **one** of these two material sources:

- `externalFolderPath` — absolute path to a folder outside the monorepo that contains the source materials. The folder must NOT be inside the monorepo root.
- `inlineMaterials` — text provided directly in the prompt (articles, notes, source excerpts, research briefs, or any other text content). Can be a single block or multiple labeled sections.

If neither is provided, ask the operator which source they want to use. If both are provided, use `externalFolderPath` as the primary source and treat `inlineMaterials` as supplementary context.

If `inlineMaterials` is provided but the operator also has an external folder, mention that the folder option is available for binary files (images, PDFs) that cannot be passed as inline text.

### inticle-specific options

- Optional: `articleType` — one of: `guest`, `comparison`, `practical_guide`, `checklist`, `seo_expert_forecast`, `by_git_history`, `year_update`, `local_sector_site_review`.
- Optional: `primaryLanguage`; default is `ru`.
- Optional: `translationLanguages`; default is `ru`, `de`, `en`.
- Optional: desired perspective; default is `first_person_singular` for thought-leadership articles and neutral expert voice for guides/checklists.
- Optional: vertical/location hints if they are important for framing.

If `articleType` is not provided, infer the best type from the topic and materials after reading them (Step 5), then state the inferred type before editing:

- Use `guest` for an opinionated external-publication article with a strong thesis and non-promotional tone.
- Use `comparison` for criteria-based comparison of options, tools, approaches, providers, or alternatives.
- Use `practical_guide` for step-by-step execution guidance.
- Use `checklist` for self-audit or implementation checklists.
- Use `seo_expert_forecast` for SEO/AI-search forecast and strategic search recommendations.
- Use `by_git_history` only when the operator explicitly asks for commit-derived storytelling and `git-history.md` will be provided.
- Use `year_update` for annual updates, retrospectives, and "what changed in YYYY" articles.
- Use `local_sector_site_review` for concrete site/sector audits, local visibility checks, BFSG/DSGVO reviews, or "Sofa-Test" style articles.

### truth-specific options

- Optional: `primaryLanguage`; default is `ru`.
- Optional: `models` — list of model IDs for the multi-model inquiry panel. If omitted, use the default panel: `perplexity/sonar-pro-search`, `google/gemini-3.1-pro-preview`, `deepseek/deepseek-v4-pro`, `z-ai/glm-5.2`, `claude-sonnet-5`.
- Optional: `synthesisModel`; default is `claude-opus-4-8`.
- Optional: `finalEditModel`; default is `claude-opus-4-8`.
- Optional: `researchTier` — preset for all model settings at once (`high`, `medium`, `light`). Mutually exclusive with explicit `models`/`synthesisModel`/`finalEditModel`.
- Optional: `journalisticMode` — boolean; when `true`, activates all journalistic enrichment gogols (quotes, sources, protagonists, timeliness, visual data) and all derivative documents (editorial dossier, source leads, fact-check card, contradiction map, telegram pack). Recommended for research that will feed journalistic reporting.
- Optional: individual derivative flags — `editorialDossier`, `sourceLeads`, `factCheckCard`, `contradictionMap`, `telegramPack` — each a boolean; use when you want specific journalistic outputs without the full `journalisticMode` package.
- Optional: output derivative flags — `practicalGuide`, `executiveSummary`, `policyBrief`, `researchAgenda` — each a boolean; adds standalone documents after the final report.
- Optional: `reviewSubQuestions`; default is `true`. Set to `false` for unattended runs.
- Optional: `videoUrl` — YouTube URL if the research is based on a video. If provided, the pipeline will extract a transcript.
- Optional: `whisperModel`; default is `medium`. Only relevant if `videoUrl` is set.

## Step 2: validate the material source

### If `externalFolderPath` is provided

Verify the external folder:

1. The path must be outside the monorepo root. If the path is inside the monorepo, stop and tell the operator: "External folder must be outside the project."
2. The folder must exist and be readable.
3. The folder must not be empty.

If any check fails, stop and explain the problem. Do not proceed to Step 3.

### If `inlineMaterials` is provided (no folder)

Verify that the inline text is non-empty and contains substantive content — not just a topic title. If the text is too thin (e.g. a single sentence with no source material), ask the operator to provide more context or switch to an external folder.

No path validation needed. Proceed to Step 3.

## Step 3: clear `.input/`

Remove everything inside `<app>/.input/` **except** app-specific brand-level files:

### inticle

Preserve these files:

- `soul-profile.md`
- `visual-profile.md`

Remove `brief.md`, `resource-overview.md`, `materials/` (and all its contents), `git-history.md`, and any other files from a previous article.

### truth

No brand-level files to preserve. Remove `brief.md`, `audience.md`, `materials/` (and all its contents), and any other files from a previous run.

This is a destructive operation — it runs automatically without confirmation.

## Step 4: populate `.input/materials/`

### If `externalFolderPath` is provided

Copy **everything** from the external folder into `<app>/.input/materials/` recursively. This includes all file types: `.md`, `.txt`, `.json`, `.csv`, `.html`, `.xml`, `.yaml`, `.yml`, images, PDFs, and any other files. Preserve the directory structure from the external folder.

### If `inlineMaterials` is provided (no folder)

Write the inline text to `<app>/.input/materials/inline-materials.md`. If the operator provided multiple labeled sections, preserve them as separate `## <section label>` headings within the file. Do not reformat or compress the text — write it verbatim.

### If both are provided

Copy the external folder first, then write `inlineMaterials` to `<app>/.input/materials/inline-materials.md` as a supplementary file.

## Step 5: read and analyze materials

Read every text file under `<app>/.input/materials/`. Text file extensions include: `.md`, `.txt`, `.json`, `.csv`, `.html`, `.xml`, `.yaml`, `.yml`. Binary files (images, PDFs, etc.) are noted but not read.

If materials came from `inlineMaterials`, the single `inline-materials.md` file is the only text file — read it in full.

Also read app-specific context files if they exist (for context, not for overwriting):

### inticle

1. `<app>/.input/soul-profile.md`
2. `<app>/.input/visual-profile.md`

### truth

No brand-level context files.

Do not treat `.output` or `.inticles` as the source for the new run unless the operator explicitly asks to reuse an archived run.

## Step 6: determine the topic

### 6a: check if the operator already provided a complete topic

After reading the materials, check whether the operator has already provided a **complete topic** — one that includes:

- A working title or topic statement
- A central question or core research problem
- Enough context to decompose into sub-questions (research design, comparison criteria, specific scope, or framing)

If all three elements are present, **use the operator's topic directly**. State it back in one sentence and proceed to Step 7. Do not propose variations or alternatives — the operator has already made their choice.

### 6b: propose 3–5 topics (only if no complete topic was provided)

If the materials do not contain a complete topic (e.g. the operator provided raw source materials without a framing, or asked for topic suggestions), propose 3 to 5 topics. Present them as a numbered list with a one-sentence rationale for each.

#### Topic criteria

Each proposed topic must satisfy all of these criteria:

1. **Formulates a problem or question, not a statement** — e.g. "how to distinguish…", "why… remains an expense", "what will a website become in a world of…"
2. **Specific, not generic** — not "marketing in Germany", but "fear-based marketing in the German web: how to read scare emails"
3. **Grounded in facts from the materials** — the topic must be provable with the available source material, not a hypothesis outside it
4. **Reveals a hidden mechanism or systemic problem** — lock-in, FUD mechanics, commoditization, risk asymmetry, infrastructure dependency
5. **Engineering, not promotional** — structure, architecture, methodology, not "10 ways to boost sales"
6. **Interesting to the target audience** — touches their pain, risk, or decision, not abstract theory
7. **Not clickbait** — precise wording, no exaggeration

#### truth-specific topic framing

For `truth`, topics should be framed as research questions suitable for verifiable decomposition — not editorial angles. The topic should imply a core question that can be broken into sub-questions, each answerable with evidence from independent sources. Emphasize verifiability: the topic should invite confirmation, refutation, or identification of knowledge gaps, not just opinion.

Ask the operator to select one topic or write their own. Wait for their choice before proceeding.

## Step 7: determine `articleType` (inticle only)

Skip this step for `truth`.

If the operator already provided `articleType` in Step 1, use it. Otherwise, infer the best type from the selected topic and materials. State the inferred type and rationale before proceeding.

## Step 8: generate `<app>/.input/brief.md`

Completely replace the file with YAML frontmatter, a blank line, and the body.

### inticle frontmatter contract

Use this shape and fill every meaningful field:

```yaml
---
articleType: <selected type>
theme: "<selected or operator-provided topic>"
coreQuestion: >-
  <the central question the article must answer>
hypothesis: >-
  <the working thesis, phrased as a testable editorial claim>
interactionGoal: >-
  <what the reader should understand, decide, or be able to do after reading>
primaryLanguage: ru
translationLanguages:
  - ru
  - de
  - en
features:
  cover: true
  mindMaps: true
  announces: true
titleHint: "<optional strong title direction, or empty if uncertain>"
narratorPerspective: first_person_singular
vertical: <domain, for example design, web, seo, handwerk, compliance>
location:
  state: Baden-Württemberg
  city:
  landkreis: Germany
---
```

inticle frontmatter rules:

- Keep `articleType` exactly one of the supported values.
- Keep audience and tone out of `brief.md`; they belong in `resource-overview.md`.
- Prefer precise Russian wording for `coreQuestion`, `hypothesis`, and `interactionGoal` unless the operator requested another primary language.
- Do not invent factual claims not supported by materials. If an important claim is uncertain, mark it as an open question in the editorial framing section.

### inticle body structure

```markdown
# Source payload

## Operator topic

<the selected topic in one or two precise paragraphs>

## Materials

### <filename>

<full text of the material file>

### <filename>

<full text of the material file>

### <filename> (binary, not included in payload)

> Binary file — not embedded in text payload. See `.input/materials/<path>` for the original.

## Editorial framing

### Working thesis

<the strongest defensible thesis from the materials>

### Recommended article angle for `<articleType>`

<angle tailored to the selected type>

### Must include

- <specific points that must appear in the article>

### Must avoid

- <unsupported claims, hype, unsafe legal/medical/financial claims, salesy CTAs, or irrelevant tangents>

### Open questions and boundaries

- **Open question:** <what is unknown>
  **Boundary:** <what the article must not overclaim>
```

inticle body rules:

- Include the **full text** of every text file found in `.input/materials/`. Do not summarize or compress.
- Use `### <filename>` headings, where `<filename>` is the relative path from `materials/`.
- For binary files (images, PDFs, etc.), add a placeholder heading: `### <filename> (binary, not included in payload)` with a note pointing to the original file.
- Preserve the original formatting of each material file inside its section.

### truth frontmatter contract

Use this shape:

```yaml
---
topic: "<selected or operator-provided topic>"
coreQuestion: "<the central research question — what needs to be verified, refuted, or clarified>"
primaryLanguage: ru
synthesisModel: claude-opus-4-8
finalEditModel: claude-opus-4-8
models:
  - perplexity/sonar-pro-search
  - google/gemini-3.1-pro-preview
  - deepseek/deepseek-v4-pro
  - z-ai/glm-5.2
  - claude-sonnet-5
---
```

Optional truth frontmatter fields (include only if relevant):

```yaml
# Research tier preset — sets models, synthesisModel, finalEditModel, and expert-role pool together.
# When specified, explicit model fields (models, synthesisModel, finalEditModel) are NOT allowed.
# Values: high, medium, light.
researchTier: medium

# Output derivatives — each adds a standalone document after the final report.
practicalGuide: false
executiveSummary: false
policyBrief: false
researchAgenda: false

# Journalistic mode — master switch that activates ALL enrichment gogols
# (quote-extraction, source-discovery, protagonist-discovery, timeliness-assessment,
# visual-data-discovery) and ALL derivative documents (editorial-dossier, source-leads,
# fact-check-card, contradiction-map, telegram-pack).
# Enable for journalistic research that needs ready-to-use reporting material.
journalisticMode: false

# Individual journalistic derivative flags — use when you want specific outputs
# without the full journalisticMode package. Each works standalone.
editorialDossier: false      # 3-5 ready-to-publish angles with headlines and leads
sourceLeads: false           # source/lead map for follow-up reporting
factCheckCard: false         # structured fact-check card with statuses and sources
contradictionMap: false      # contradiction map with both sides assessed
telegramPack: false          # 3-5 draft Telegram posts with engagement hooks

# Pause after topic decomposition so the operator can review sub-questions.
reviewSubQuestions: true

# Video source — only if the research is based on a YouTube video.
videoUrl: "<YouTube URL>"
whisperModel: medium
```

truth frontmatter rules:

- `topic` and `primaryLanguage` are required.
- `coreQuestion` is optional but strongly recommended — it guides topic decomposition.
- `models` is optional; if omitted, the pipeline uses its built-in defaults.
- `synthesisModel` and `finalEditModel` are optional; defaults are `gpt-5.5` and `claude-opus-4-8` respectively, but `claude-opus-4-8` is recommended for both.
- `researchTier` is optional; when set, it overrides all model fields. Do NOT combine `researchTier` with explicit `models`, `synthesisModel`, or `finalEditModel` — the parser will reject it.
- `journalisticMode: true` enables the full journalistic enrichment and derivative pipeline. Individual derivative flags (`editorialDossier`, `sourceLeads`, `factCheckCard`, `contradictionMap`, `telegramPack`) can be enabled independently when `journalisticMode` is false.
- `reviewSubQuestions` defaults to `true`; set to `false` only for unattended runs.
- `practicalGuide`, `executiveSummary`, `policyBrief`, `researchAgenda` are standalone output flags independent of `journalisticMode`.
- Do not include `videoUrl` or `whisperModel` unless a video source is provided.
- Keep audience profile out of `brief.md`; it belongs in `audience.md`.

### truth body structure

The body is free-form markdown describing the research context. Use this structure as a guide:

```markdown
<2–4 paragraphs describing the research topic, its context, and what the research should accomplish>

<Paragraph explaining the starting point and key idea — what sparked the research, what hypothesis or claim is being investigated>

<Paragraph explaining the two purposes of the result: (1) verified, provable conclusions usable as raw material for authority-building articles, (2) a feed of verified information where every claim is traceable to a citable source>

<Paragraph describing how the research should decompose the topic: (1) claims confirmable by independent sources, (2) claims refuted or refined, (3) unverifiable claims (knowledge gaps). Highlight specific areas of focus — mechanisms, technical factors, comparisons, practical applicability>

<Paragraph emphasizing verifiability and critical filtering. The studio builds authority on evidence, not opinions. Unverifiable claims must be labeled as knowledge gaps, not presented as fact>
```

truth body rules:

- Write in the language specified by `primaryLanguage`.
- Do not invent factual claims. Describe what the research should investigate, not what the conclusions will be.
- Frame the topic as a research problem, not as a predetermined conclusion.
- Include the operator's original request text or a close paraphrase so the pipeline understands the intent.

## Step 9: generate companion file

### inticle: `resource-overview.md`

Completely replace the file. Keep this heading contract — headings are always in Russian, regardless of `primaryLanguage`:

```markdown
# Основная аудитория

<primary reader: who they are, their situation, knowledge level, pain, decision they face>

# Вторичная аудитория

<secondary readers: adjacent stakeholders, translators, partners, editors, implementers>

# Тон текста

<voice, register, rhythm, constraints, what to avoid>
```

inticle companion rules:

- Make this file specific to the selected `articleType`.
- For `guest`, define a credible publication audience and non-promotional expert tone.
- For `comparison`, define readers who need decision criteria and a fair, balanced tone.
- For `practical_guide`, define readers who need execution steps and a calm operational tone.
- For `checklist`, define readers who will self-audit and need concise imperative wording.
- For `seo_expert_forecast`, define SEO/business readers who need forecast uncertainty clearly separated from action.
- For `by_git_history`, define readers interested in case-study lessons, not raw commit chronology.
- For `year_update`, define readers who need "what changed / what to do now".
- For `local_sector_site_review`, define local business owners and a diagnostic, evidence-first tone.

### truth: `audience.md`

Completely replace the file with YAML frontmatter and a body:

```yaml
---
topic: "Целевая аудитория для этого исследования"
audienceProfile: "<who the audience is — their role, expertise, what they need from the research>"
expertiseLevel: "expert"
questions:
  - "<research sub-question 1 the audience needs answered>"
  - "<research sub-question 2 the audience needs answered>"
  - "<...6–8 questions total>"
---
```

Followed by a body paragraph:

```markdown
<1–2 paragraphs describing the audience in detail: their expertise, what they value, how they will use the research result, and what distinguishes them from a general audience>
```

truth companion rules:

- `audienceProfile` should describe the specific team or role (e.g. "founder and engineering team of a web studio", "founder and design team").
- `expertiseLevel` is typically `expert` for truth research — the audience consists of domain professionals.
- `questions` should list 6–8 specific research questions the audience needs answered. These questions guide topic decomposition and inquiry.
- The body should explain how the audience will use the results (e.g. for articles, for technical decisions, for product development).
- Write in the language specified by `primaryLanguage`.

## Step 10: quality bar

Verify manually after editing:

### Common checks

- `brief.md` has valid YAML frontmatter delimited by `---`.
- The Materials section (if applicable) includes the full text of every text file from `.input/materials/`.
- Binary files in `materials/` have placeholder entries (inticle only).
- Unsupported assumptions are labelled as open questions or boundaries.
- App-specific brand-level files were not modified.

### inticle-specific checks

- `articleType` is supported.
- `theme`, `coreQuestion`, `hypothesis`, and `interactionGoal` are not empty.
- `brief.md` body contains `## Operator topic`, `## Materials`, and `## Editorial framing` sections.
- `resource-overview.md` has exactly the three top-level headings: `# Основная аудитория`, `# Вторичная аудитория`, `# Тон текста`.
- Audience and tone are not duplicated into `brief.md` frontmatter.
- `soul-profile.md` and `visual-profile.md` were not modified.

### truth-specific checks

- `topic` and `primaryLanguage` are not empty.
- `coreQuestion` is present and non-empty (strongly recommended).
- `brief.md` body is non-empty and describes the research context.
- `audience.md` has valid YAML frontmatter with `audienceProfile`, `expertiseLevel`, and `questions` fields.
- `audience.md` body is non-empty.
- `models` list (if present) contains valid model IDs.
- If `researchTier` is set, verify that `models`, `synthesisModel`, and `finalEditModel` are NOT also set (mutually exclusive).
- If `journalisticMode` is `true`, confirm that the topic framing benefits from journalistic enrichment (quotes, sources, protagonists, visual data). If the topic is purely technical, consider using individual derivative flags instead.
- Individual derivative flags (`editorialDossier`, `sourceLeads`, `factCheckCard`, `contradictionMap`, `telegramPack`) are valid only as booleans.
- `reviewSubQuestions`, `practicalGuide`, `executiveSummary`, `policyBrief`, `researchAgenda` are valid only as booleans.
- No `videoUrl` or `whisperModel` fields unless a video source was provided.

## Step 11: completion response

After editing, respond with:

- **Target app:** `<inticle` or `truth>`
- **Selected topic:** `<topic or theme>`
- **Updated files:** `brief.md`, `<companion file name>`
- **Material basis:** list of material files in `.input/materials/` (from external folder, inline text, or both)
- **Open boundaries:** any important uncertainty left in the brief
- **App-specific notes:**
  - inticle: `articleType`, `narratorPerspective`, `vertical`
  - truth: `models` panel (or `researchTier`), `synthesisModel`, `finalEditModel`, `journalisticMode`, derivative flags
