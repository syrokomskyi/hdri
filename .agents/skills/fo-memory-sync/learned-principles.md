<!-- L2: Concrete principles distilled from past runs, with confirmations counter.
     At confirmations >= 3, the skill auto-applies the principle without asking.
     Rejecting a recommended answer resets confirmations to 0. -->

# Learned Principles

<!-- Format: - principle: <text> | confirmations: N | project: <path-or-remote-or-all> -->

- principle: Codex stores memories in SQLite (`~/.codex/memories_1.sqlite`), not in `~/.codex/memories/` directory. The directory may not exist. Check both locations. | confirmations: 1 | project: all
- principle: Codex sessions are JSONL files under `~/.codex/sessions/YYYY/MM/DD/`. Filter by `cwd` field to match project. Sessions spanning midnight UTC may appear under the previous day's folder but be "today" in the operator's timezone. | confirmations: 1 | project: all
