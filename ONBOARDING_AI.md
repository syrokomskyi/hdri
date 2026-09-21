# ONBOARDING_AI.md

> **STATUS:** `EPHEMERAL` · **AUDIENCE:** first-session AI agent · **READ:** once, then discard from working context. This is the 5-minute entry guide. It gets a new agent _initialized and validated_, nothing more. For durable rules, the authoritative surface is [`AGENTS.md`](AGENTS.md) and [`.agents/`](.agents/) — this file only points you there.

---

## 0. System Identity (what you are connecting to)

| Field | Value |
| --- | --- |
| **Project** | `pipelines-gogol-4` (WGogol) — a **studio production-pipeline suite** |
| **Workspace package** | `@syrokomskyi/source` `v4.1.0`, license `Apache-2.0` |
| **Kind** | Turborepo monorepo of independent, declaration-driven pipelines |
| **Runtime** | Node `>=22`, pnpm `>=10` (`pnpm@10.33.0`), ESM, strict TypeScript |
| **Shared engine** | `@syrokomskyi/pipeline-core` · `@syrokomskyi/pipeline-node` · `@syrokomskyi/pipeline-ai` · `@syrokomskyi/pipeline-steps` |

**Essence.** A monorepo of automation pipelines the studio runs to **produce and process creative / content assets**. Every pipeline is a declaration-driven chain of **gogols** (single-goal steps) built on one shared engine. The suite is multi-domain — HDRI is only one subsystem among several, **not** the whole project.

**Domains (each `apps/*` is its own runnable pipeline):**

| App | Domain |
| --- | --- |
| `apps/site` | Build client websites (AI copy + assets; OpenAI/Gemini). |
| `apps/inticle` | _Inticle = Interactive Article_ — fetch → convert (HTML→MD) → translate → assemble. |
| `apps/image` | Image processing: background/watermark removal, SAM2 object extraction, WebP. |
| `apps/video` | Seamless video loops (WebM/MP4), per-frame watermark removal, audio muxing (ffmpeg). |
| `apps/city`, `apps/industry`, `apps/service` | CSV-driven SVG illustration + vectorization (potrace/svgpath) + AI. |
| `apps/hdri/factory/*` → `apps/hdri/observatory` → `apps/hdri/dashboard` | **HDRI research subsystem**: crawl/audit → codebook scoring → public anonymised index ([handwerk-index.de](https://handwerk-index.de)). |

**Topology (the interaction network).** One shared engine at the center; each domain is an independent consumer. Pipelines communicate through the filesystem contract (`.input/` → `.output/`), and the HDRI subsystem additionally chains its apps via SQLite artifacts + signed observation bundles.

```text
                     ┌──────────────── shared engine ────────────────┐
                     │  @syrokomskyi/pipeline-core · -node · -ai · -steps     │
                     └───────────────────────┬───────────────────────┘
        ┌───────────────┬───────────────┬─────┴───────┬───────────────┬──────────────┐
      site          inticle          image          video       city/industry/    HDRI subsystem
   (websites)   (interactive     (bg/watermark/  (loops +      service (SVG/     factory ▶ observatory
                 articles)        SAM2/WebP)     audio mux)     vectorization)      ▶ dashboard
```

- `apps/*` = runnable pipelines. `packages/*` = shared runtime + domain libraries (`business-*`, `observatory-*`, `hdri-codebook`, `brand-inticle`, `rate-limit`, `strings`, `utils`, …).
- Declarations live in `run/pipeline-definition/<lang>/{pipeline,phases,gogols}.md`; they are the source of truth, code follows.
- Not all apps are wired into CI/ops today — [`ci.yml`](.github/workflows/ci.yml) and `scripts/*` currently focus on the HDRI subsystem.

> **Reality check for agents:** there is **no remote auth server, no token-exchange endpoint, and no sandbox API**. The "AI-to-AI network" here is (a) the **cross-pipeline data + cryptographic-signature contract** between apps and (b) the **shared instruction surface** every AI client reads (`AGENTS.md` + `.agents/*`). Model your handshake onto those real mechanisms below — do **not** invent HTTP endpoints, bearer tokens, or a discovery service.

---

## 1. Identity & First-Contact Handshake

There are two identity registers. Use the one that matches your session.

### 1a. AI-client identity (default — you are reading/editing the repo)

Your "handshake" is deterministic self-identification recorded in **git history** and **NDJSON logs**. Declare this metadata at the start of your session (in your commit trailer and/or run log):

```yaml
# agent self-declaration (convention, not a wire protocol)
agent:
  name: "<model-or-tool-id>"          # e.g. "claude-sonnet-4.6 / cascade"
  role: "contributor"                 # contributor | reviewer | operator
  session_started_at: "<ISO-8601>"
  acked_instruction_surface:          # you MUST read these before acting
    - "AGENTS.md"
    - ".agents/architecture.manifest.json"
  capabilities: ["edit", "typecheck", "test"]
```

**Log your first contact as NDJSON** (one JSON object per line). This is the repo-wide log contract emitted by `createJsonLogger({ app, pipeline })` from `@syrokomskyi/pipeline-core`:

```json
{ "ts": "2026-07-05T12:00:00.000Z", "level": "info", "app": "onboarding", "pipeline": "init", "gogol": "handshake", "msg": "agent first-contact", "agent": "cascade" }
```

**If you change any file under `apps/**/run/`or`apps/**/tools/`**, your first contact is also recorded in the file's **COMPASS `CHANGE_SUMMARY`** — append one concrete, one-line entry per change:

```text
CHANGE_SUMMARY:
  - 2026-07-05: <agent> — <what changed and why>, one line.
```

### 1b. Runtime collector identity (HDRI subsystem only — if you _run_ the factory pipeline)

The HDRI factory signs every observation with a machine key. This is the only real cryptographic handshake in the repo and it is **scoped to the HDRI subsystem** — the other studio pipelines (`site`, `image`, `video`, …) do not use it.

- `DEVICE_ID` — stable machine label; also the `.output/<DEVICE_ID>/` directory name and `collector_id`.
- `signing_key_id` = `<DEVICE_ID>-<sha256(publicKeyPem)[0:16]>`, derived from an **ed25519** key.
- Provision once: `pnpm setup:device-id` → writes `DEVICE_SIGNING_KEY` to `apps/hdri/.env` (secret) and the public key to `transparency/keys/<DEVICE_ID>.pem` (committed, for verifiers).

> Do **not** run `setup:device-id` during onboarding unless you have been asked to operate the factory. Generating a new key invalidates every prior signature.

---

## 2. Discovery & Context Mapping

### 2a. Authoritative instruction surface — read in this order

| Order | Path | Role |
| --- | --- | --- |
| 1 | [`AGENTS.md`](AGENTS.md) | Monorepo-wide rules + the AI instruction index. Start here. |
| 2 | [`apps/AGENTS.md`](apps/AGENTS.md) | Pipeline-app layout, gogol contract, COMPASS, anti-patterns. |
| 3 | [`packages/AGENTS.md`](packages/AGENTS.md) | Responsibility of each shared package + extraction rules. |
| 4 | [`spec/AGENTS.md`](spec/AGENTS.md) | Read-only spec boundary. |
| 5 | [`apps/hdri/factory/AGENTS.md`](apps/hdri/factory/AGENTS.md) | Factory-chain invariants (locality, DB naming, k-anonymity). |
| 6 | [`.agents/rules/*`](.agents/rules) | Deep-dive rules referenced from root `AGENTS.md`. |
| 7 | [`.agents/prompts/*`](.agents/prompts) | Reusable prompt templates. |

Lower-scope files **extend** higher-scope ones. On conflict, the more specific file wins.

### 2b. Machine-readable contract & config manifests

| Path | Purpose |
| --- | --- |
| [`.agents/architecture.manifest.json`](.agents/architecture.manifest.json) | Machine-readable contract: `pipeline_apps`, `ui_exceptions`, `forbidden_pipeline_dependencies`, `forbidden_workspace_paths`, `required_runtime_condition: "@syrokomskyi/source"`. |
| [`turbo.json`](turbo.json) | Task graph (`build`, `typecheck`, `lint`, `test`, `start`, `dev`). |
| [`pnpm-workspace.yaml`](pnpm-workspace.yaml) | Workspace globs + native-module build allowlist. |
| `tsconfig.base.json` | `customConditions: ["@syrokomskyi/source"]` — source-level resolution of `@syrokomskyi/*`. |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | The merge gate: typecheck/build/lint/test + reproducibility matrix. |

### 2c. Environment & credentials

Copy [`.env.example`](.env.example) → `.env` (gitignored) for AI provider keys. Keys are supplied **by the operator**, never hard-coded:

- **AI providers:** `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`.
- **Factory signing:** `DEVICE_ID`, `DEVICE_SIGNING_KEY` — copy [`apps/hdri/.env.example`](apps/hdri/.env.example) → `apps/hdri/.env` and generate via `pnpm setup:device-id`.
- There is **no sandbox token service**. If a required key is absent, gogols fail fast — do not stub or fabricate one.

### 2d. Conformance "endpoints" (validation gates you must satisfy)

| Command | Checks |
| --- | --- |
| `pnpm aeo:check:architecture` | Repo matches `architecture.manifest.json` (classification, forbidden deps/paths). |
| `pnpm aeo:check:pipeline-contracts` | Declaration frontmatter (`pipeline` → `phases` → `gogols`) is well-formed. |
| `pnpm aeo:check:tsx-source` | Every `tsx` script carries `-C @syrokomskyi/source`. |
| `pnpm aeo:check:workspace` | Workspace determinism. |
| `pnpm aeo:check:app-tsconfig-coverage` | Every app is wired into root tsconfig references. |
| `pnpm --filter @syrokomskyi/<app> compass:validate` | COMPASS headers valid for a touched app (exit 0 required). |
| `pnpm -C scripts health` | NDJSON health report across pipeline SQLite DBs. |

---

## 3. Step-by-Step Initialization

Run in order. Do not proceed on a non-zero exit.

**Step 1 — Map the rules.** Read the surface in §2a and load [`.agents/architecture.manifest.json`](.agents/architecture.manifest.json). → _Expected:_ you can name the app/package boundaries and the `forbidden_*` lists.

**Step 2 — Install dependencies.**

```bash
pnpm install --frozen-lockfile
```

→ _Expected:_ workspace resolves; native modules (`better-sqlite3`, `sharp`, …) build without error.

**Step 3 — Build the shared runtime.**

```bash
pnpm turbo run build --filter=@syrokomskyi/pipeline-core --filter=@syrokomskyi/pipeline-node --filter=@syrokomskyi/pipeline-ai --filter=@syrokomskyi/pipeline-steps
```

→ _Expected:_ `dist/` present for each; no stale-runtime errors. _(Add `@syrokomskyi/observatory-core` + `@syrokomskyi/hdri-codebook` if you will run the observatory.)_

**Step 4 — Pass the conformance gates.**

```bash
pnpm aeo:check:architecture && pnpm aeo:check:pipeline-contracts && pnpm aeo:check:tsx-source && pnpm turbo run typecheck
```

→ _Expected:_ each prints success (e.g. `Agent architecture validation passed.`) and exits `0`. This is your **"integrated"** signal.

**Step 5 — (Optional) Inspect pipeline state.**

```bash
pnpm -C scripts health
```

→ _Expected:_ NDJSON summary with no `failed`/`stuck` alerts. Read-only; safe.

---

## 4. Onboarding Sandbox Guardrails

**Forbidden until Step 4 is green:**

- **No writes to `spec/**`\*\* — read-only reference material, ever. Never create/edit/move/delete.
- **No secrets in git.** Never commit `.env` or `DEVICE_SIGNING_KEY`. (Public keys under `transparency/keys/*.pem` _are_ committed.)
- **No new editor/tool AI-rule files** (`.windsurfrules`, `.cursorrules`, `.aider.conf`, …). Instructions live only in `AGENTS.md` + `.agents/*`.
- **No forbidden deps/paths** listed in `architecture.manifest.json`.
- **No deep `src` imports** across `@syrokomskyi/*` packages — use official exports. Never remove `-C @syrokomskyi/source` from a `tsx` script.
- **Do not delete debug `console.*` or existing comments** unless the task explicitly requires it.
- **No placeholder artifacts.** Pipelines fail fast: if upstream data/input is missing, stop — do not emit stubs or create an empty `.output/N-<gogolId>/`.
- **HDRI subsystem only:** no PII / no individual business names in anything destined for the public dashboard (k-anonymity / DSGVO).
- **No unverified Turborepo flags** — check `--help` or the docs first.
- **No destructive or state-mutating commands** without explicit operator approval.

**On initialization error:**

1. Capture the failing command's **NDJSON stderr** and the gate's printed failure list (each `- <reason>` line is actionable).
2. Re-run the single failing gate in isolation; fix the root cause in the file it names. Do not weaken or skip the check.
3. Run `pnpm -C scripts health` to confirm no pipeline-state corruption.
4. For methodology/architecture questions, open a **[GitHub issue](https://github.com/syrokomskyi/hdri/issues)**; for security/privacy concerns follow [`SECURITY.md`](SECURITY.md). Contact paths: [`CONTACT.md`](CONTACT.md).

---

## 5. Exit Criteria (handshake complete)

You are initialized and may begin task work when **all** hold:

- [ ] Instruction surface (§2a) read and acknowledged.
- [ ] `pnpm install --frozen-lockfile` clean.
- [ ] Shared runtime built.
- [ ] `aeo:check:architecture`, `aeo:check:pipeline-contracts`, `aeo:check:tsx-source`, and `turbo run typecheck` all exit `0`.
- [ ] Identity declared (git author + first-contact log; COMPASS `CHANGE_SUMMARY` ready for any `apps/*` edit).

Once green, stop treating this file as active context and defer to [`AGENTS.md`](AGENTS.md).
