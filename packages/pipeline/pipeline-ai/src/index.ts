/*
<MODULE_CONTRACT>
<purpose>Consolidates and re-exports functionalities for AI-related operations from multiple libraries.</purpose>
<non-goals>
  <item>Does not implement the underlying logic of AI operations.</item>
  <item>Does not provide UI components or interfaces.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial export setup for AI library modules.</item>
</CHANGE_SUMMARY>
*/

export * from "./lib/anthropic.js";
export * from "./lib/normalize-ai-json.js";
export * from "./lib/openai.js";
export {
  createOpenAiJson,
  createOpenAiImageWebp,
  createOpenAiText,
  createOpenAiVisionText,
} from "./lib/openai.js";
export type {
  AiAttachment,
  AiPlugin,
  OpenAiClientLike,
  OpenAiImageWebpOptions,
  OpenAiTextOptions,
  OpenAiVisionTextOptions,
} from "./lib/openai.js";
export * from "./lib/perplexity.js";
export * from "./lib/types.js";
