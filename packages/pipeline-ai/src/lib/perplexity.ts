import type OpenAI from "openai";
import { DEFAULT_EMPTY_USER_PROMPT } from "@org/pipeline-core";

export type PerplexityClient = Pick<OpenAI, "chat">;

export type PerplexityTextOptions = {
	client: PerplexityClient;
	model: string;
	system: string;
	userText?: string;
};

export const createPerplexityText = async (
	options: PerplexityTextOptions,
): Promise<string> => {
	const userText = options.userText?.trim() || DEFAULT_EMPTY_USER_PROMPT;
	const messages: Array<{ role: "system" | "user"; content: string }> = [
		{ role: "system", content: options.system },
		{ role: "user", content: userText },
	];

	const response = await options.client.chat.completions.create({
		model: options.model,
		messages,
	});

	const text = response.choices[0]?.message?.content?.trim() ?? "";
	if (!text) {
		throw new Error(`Perplexity response for model ${options.model} is empty.`);
	}
	return text;
};
