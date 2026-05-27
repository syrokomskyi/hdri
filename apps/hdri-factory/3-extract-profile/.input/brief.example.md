---
concurrency: 20
timeoutMs: 30000
retries: 2
---

# Site Profile Extraction Brief

This brief configures the homepage crawler and signal extraction pipeline.

## What This Does

- Reads live domains from `liveness.db`
- Fetches homepage HTML for each live site
- Extracts signals (phone, email, schema.org, etc.)
- Stores HTML in CAS and metadata in `pages_YYYY.db`

## Required Input

- `registry_YYYY.db` from `1-register-businesses`
- `liveness.db` from `2-check-liveness`

## Configuration

| Field | Description | Default |
|-------|-------------|---------|
| `concurrency` | Parallel fetches | 20 |
| `timeoutMs` | Request timeout | 30000 |
| `retries` | Retry attempts | 2 |

## Output

- `pages_YYYY.db` — page observations and extracted signals
- `data/content/` — CAS storage for HTML content
