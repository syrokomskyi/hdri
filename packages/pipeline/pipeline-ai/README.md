# @warpgogol/pipeline-ai

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE) [![npm](https://img.shields.io/npm/v/@warpgogol/pipeline-ai?logo=npm&logoColor=white)](https://www.npmjs.com/package/@warpgogol/pipeline-ai)

AI provider wrappers for the pipeline framework — structured OpenAI helpers, Anthropic integration, and resilient JSON normalization.

> Engineered at [Warpgogol](https://warpgogol.com) · Released as open source.

---

## Features

- **Structured OpenAI helpers** — `createOpenAiJson()`, `createOpenAiText()`, `createOpenAiVisionText()`, `createOpenAiImageWebp()`
- **Anthropic integration** — `createAnthropicText()` with the same call/logging contract
- **Perplexity integration** — `createPerplexityText()`
- **Resilient JSON normalization** — extract and parse JSON from LLM output with `normalizeAiJson()`
- **Unified logging** — every call persists prompts, responses, and usage metadata
- **Zod-validated output** — structured outputs validated before returning
- **Multimodal attachments** — pass images as `AiAttachment` objects (base64-encoded automatically)

## Install

```bash
npm install @warpgogol/pipeline-core @warpgogol/pipeline-ai

# Install at least one AI provider (optional peer deps)
npm install openai
# or
npm install @anthropic-ai/sdk
```

### Peer dependencies

| Package | Required for | Optional |
| --- | --- | --- |
| `openai` | `createOpenAiJson`, `createOpenAiText`, `createOpenAiVisionText`, `createOpenAiImageWebp` | Yes |
| `@anthropic-ai/sdk` | `createAnthropicText` | Yes |

You only need to install the provider(s) you use.

## Quick start

```ts
import { createOpenAiJson } from "@warpgogol/pipeline-ai/openai";
import { z } from "zod";

const schema = z.object({
  title: z.string(),
  summary: z.string(),
});

const result = await createOpenAiJson({
  client: openaiClient,
  model: "gpt-4.1",
  schema,
  systemPrompt: "You are a helpful assistant.",
  userPrompt: "Summarize this article: ...",
  logDir: "./output/AI/ai-1",
});

console.log(result.data); // { title: "...", summary: "..." }
```

### Multimodal attachments

`createOpenAiText` and `createAnthropicText` accept an optional `attachments` field (`AiAttachment[]`). Each attachment carries raw image `bytes` (as `Uint8Array`) and a `mimeType` string. Images are injected as base64-encoded content parts automatically.

## Exports

| Export                         | Description                                    |
| ------------------------------ | ---------------------------------------------- |
| `createOpenAiJson(opts)`       | Structured JSON via OpenAI with Zod validation |
| `createOpenAiText(opts)`       | Text generation via OpenAI                     |
| `createOpenAiVisionText(opts)` | Vision + text via OpenAI                       |
| `createOpenAiImageWebp(opts)`  | Image generation (WebP) via OpenAI             |
| `createAnthropicText(opts)`    | Text generation via Anthropic                  |
| `createPerplexityText(opts)`   | Text generation via Perplexity                 |
| `normalizeAiJson(raw)`         | Extract and parse JSON from LLM output         |
| `AiAttachment`                 | Type for image/file attachments                |
| `AiPlugin`                     | Type for AI plugin configuration               |
| `OpenAiClientLike`             | Interface for OpenAI client compatibility      |

### Subpath exports

| Path                            | Description                |
| ------------------------------- | -------------------------- |
| `@warpgogol/pipeline-ai/openai` | OpenAI helpers             |
| `@warpgogol/pipeline-ai/json`   | JSON normalization helpers |

## Changelog

[CHANGELOG.md](CHANGELOG.md)

## License

Apache-2.0 — see [LICENSE](LICENSE)

## Open Engineering

This package originated from production engineering work at [Warpgogol](https://warpgogol.com), an engineering studio in Germany.

We publish reusable parts of our infrastructure when they can be useful beyond our own projects. It is published independently of any Warpgogol commercial service. Using this package does not create any dependency on Warpgogol.

Built for real systems. Shared openly.
