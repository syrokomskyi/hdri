---
description: Run the harvest crawler in headed mode via xvfb on a headless server
---

# xvfb-Headed Crawl

Use this workflow when `browserLaunchMode: headed` is needed but the server has no display.

## Prerequisites

- `xvfb-run` installed (`sudo apt install xvfb` on Debian/Ubuntu)
- Playwright Chromium installed (`npx playwright install --with-deps chromium`)
- `brief.md` has `browserLaunchMode: headed` and `maxConcurrency` set (4-8 for xvfb)

## Steps

1. Ensure `brief.md` is configured for headed mode with desired concurrency.

2. Run the crawl pipeline through xvfb-run:

```bash
xvfb-run -a --server-args="-screen 0 1920x1080x24" pnpm --filter @syrokomskyi/crawler start
```

- `-a` auto-selects an unused display number (safe for parallel runs)
- `--server-args` sets a 1920x1080 24-bit display — large enough for any viewport profile
- The crawler launches real Chromium windows into the virtual display

3. Monitor output as usual — `crawl.log.jsonl` and console output work identically.

4. For multi-site parallel crawls, each site gets its own display via `-a`:

```bash
xvfb-run -a pnpm --filter @syrokomskyi/crawler start -- --input-dir .input-site1 --output-dir .output-site1 &
xvfb-run -a pnpm --filter @syrokomskyi/crawler start -- --input-dir .input-site2 --output-dir .output-site2 &
wait
```
