# Step 34: LLM Cost Report

- **Step ID:** `llm-cost-report`
- **Decision type:** Auto
- **Phase:** Publication packaging

## Why this step exists

Scan all previous gogol AI call logs, estimate token usage and cost per provider+model, and write a markdown cost report table.

## Inputs

- All previous step output directories containing AI/ai-* call logs.

## Outputs

- llm-cost-report.md with cost table, per-gogol breakdown, and insights.

## Definition of Done

- The cost report artifact is present with a valid cost table and total row.

## Next step

- Confirm Publication Packaging Phase (`wait-phase-publication-packaging-accepted`)