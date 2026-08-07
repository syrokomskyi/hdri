# @syrokomskyi/pipeline-ai

Integration with AI providers (OpenAI, Anthropic) for use within pipelines.

## Usage

Provides typed helpers for generating structured content, logging AI requests, and error handling.

## Multimodal attachments

Both `createOpenAiText` and `createAnthropicAiText` accept an optional `attachments` field (`AiAttachment[]`) on their options. Each attachment carries raw image `bytes` (as `Uint8Array`) and a `mimeType` string. When provided, images are injected into the request as base64-encoded content parts:

- **OpenAI** (`createOpenAiText`): GPT-5 models with a single image route to `createOpenAiVisionText`; GPT-5 with multiple images and non-GPT-5 models use `image_url` content parts via `chat.completions.create`.
- **Anthropic** (`createAnthropicAiText`): image content blocks are appended to the last user message.

Callers are responsible for checking model vision capabilities before passing attachments — do not send images to models that do not support them.

## Changelog

[CHANGELOG.md](CHANGELOG.md)
