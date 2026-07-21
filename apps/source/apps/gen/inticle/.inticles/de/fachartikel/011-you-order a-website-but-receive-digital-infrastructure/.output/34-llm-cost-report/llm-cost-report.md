# LLM Cost Report

Generated: 2026-07-21T20:12:36.533Z

## Cost by Provider + Model

| Поставщик | Модель             |  Вызовы | Входящие токены | Исходящие токены | Стоимость |
| :-------- | :----------------- | ------: | --------------: | ---------------: | --------: |
| google    | gemini-3-pro-image |       2 |             694 |           806.8k |     $2.42 |
| openai    | gpt-5.5            |     114 |          215.2k |            58.6k |     $1.96 |
| anthropic | claude-opus-4-8    |       1 |           35.7k |             2.9k |     $0.04 |
| anthropic | claude-sonnet-5    |       4 |           19.5k |             6.2k |     $0.04 |
| **Итого** |                    | **121** |      **271.1k** |       **874.5k** | **$4.46** |

## Cost by Gogol

|  # | Gogol                      | Вызовы | Стоимость |
| -: | :------------------------- | -----: | --------: |
| 23 | illustrate-google          |      2 |     $2.42 |
| 31 | translate-announces        |     56 |     $0.55 |
|  6 | analytical-synthesis       |      1 |     $0.28 |
| 26 | translate-mind-map         |     20 |     $0.27 |
| 21 | translate-splitted         |     22 |     $0.22 |
|  5 | normalize-operator-payload |      1 |     $0.16 |
| 29 | announce                   |      1 |     $0.14 |
| 14 | check                      |      1 |     $0.13 |
| 18 | interaction-design         |      1 |     $0.08 |
| 25 | draw-mind-map              |      9 |     $0.07 |
| 10 | draft                      |      1 |     $0.04 |
| 22 | illustrate-prompt          |      1 |     $0.04 |
| 15 | checked-inticle            |      1 |     $0.02 |
| 16 | soul-inticle               |      1 |     $0.01 |
| 24 | describe-cover             |      1 |   $0.0045 |
| 12 | final-paragraph            |      1 |   $0.0042 |
| 11 | lead-paragraph             |      1 |   $0.0039 |

## Insights

- **Total LLM calls:** 121
- **Calls with API usage data:** 0
- **Calls with estimated tokens:** 121
- **Total input tokens:** 271.1k
- **Total output tokens:** 874.5k
- **Average input tokens per call:** 2.2k
- **Average output tokens per call:** 7.2k
- **Calls without response (potential failures):** 1

### Top 5 Largest Prompts

| Gogol                      | Model           | Input Tokens |
| :------------------------- | :-------------- | -----------: |
| draft                      | claude-opus-4-8 |        35.7k |
| analytical-synthesis       | gpt-5.5         |        24.5k |
| normalize-operator-payload | gpt-5.5         |        21.1k |
| check                      | gpt-5.5         |        15.2k |
| interaction-design         | gpt-5.5         |        10.1k |

### Notes

- Token counts come from `usage.json` (API response usage) when available, otherwise estimated from text (~4 chars/token).
- Pricing is based on a configurable table inside `LlmCostReportStep`.
- Image generation calls (gpt-image-1.5, gemini image models) use per-call pricing, not token-based pricing.

