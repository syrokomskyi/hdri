# @org/site-liveness

Pipeline for checking site availability via HTTP/HTTPS protocols (T1 — Availability).

## Getting Started

1. Ensure `1-register-businesses` is complete and its `registry.db` exists.
2. Prepare `.input/brief.md` with `sourceToken` (format: `YYYY-Qn-CC[-extra]`).
3. Run from the monorepo root:
   ```bash
   pnpm turbo run start --filter=@org/site-liveness
   ```
4. Check results will be saved in `liveness.db`.
