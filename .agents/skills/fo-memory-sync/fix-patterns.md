<!-- L1: Baseline fix patterns for filtering, deduplication, and import decisions.
     Grown by AI per operator direction. Each pattern describes a recurring situation
     and the action to take. -->
<!-- knowledge-layer: L1 -->

# Fix Patterns

### K-0001: Skip non-project sessions

```knowledge-entry
id: K-0001
layer: L1
created: 2026-08-03
status: active
```

**Situation:** Codex session references a project path that does not match the current project root or git remote.

**Action:** Skip. List in the "Filtered out" section of the report with reason "irrelevant — references different project".

### K-0002: Skip duplicate knowledge

```knowledge-entry
id: K-0002
layer: L1
created: 2026-08-03
status: active
```

**Situation:** Memory or session content is already present in `AGENTS.md`, `docs/architecture-dna.md`, or existing `docs/sessions/` files.

**Action:** Skip import. List in the "Filtered out" section with reason "duplicate — knowledge already in <location>".

### K-0003: Import project convention

```knowledge-entry
id: K-0003
layer: L1
created: 2026-08-03
status: active
```

**Situation:** Memory or instruction contains a convention or rule directly applicable to the current project.

**Action:** Route to the nearest applicable `AGENTS.md`. Read the file before editing. Add in concise actionable form.

### K-0004: Redact sensitive information

```knowledge-entry
id: K-0004
layer: L1
created: 2026-08-03
status: active
```

**Situation:** Memory or session content contains API keys, passwords, or PII.

**Action:** Redact before importing. Replace with `<redacted>` placeholder. Never import raw secrets.

### K-0005: Multi-day Codex rollout attribution

```knowledge-entry
id: K-0005
layer: L1
created: 2026-09-16
status: active
```

**Situation:** A single Codex rollout `.jsonl` file can span multiple days (observed: 09-11 → 09-16). The filename date is only the session start.

**Action:** Attribute commits to a session by comparing commit timestamps against the rollout's first/last entry timestamps, not by filename date. Parallel sessions from other agents (e.g. Windsurf) may interleave in the same window — verify by commit content.

### K-0006: Dedup against docs/handoffs/ too

```knowledge-entry
id: K-0006
layer: L1
created: 2026-09-16
status: active
```

**Situation:** A session's main output may already exist as a handoff document in `docs/handoffs/` even when no `docs/sessions/` record exists.

**Action:** During deduplication, check `docs/handoffs/` in addition to `docs/sessions/`. A handoff covers the forward-looking state but does not replace the backward-looking session record — still import the session file, referencing the handoff.
