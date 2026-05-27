import { DEFAULT_EMPTY_USER_PROMPT } from "@org/pipeline-core";

import { parseAiJson } from "./normalize-ai-json.js";

type OpenAiMessageContentPart = {
	type?: string;
	text?: string | null;
};

type OpenAiResponsesOutputPart = {
	type?: string;
	text?: string | null;
	content?: Array<{
		type?: string;
		text?: string | null;
	}>;
};

type OpenAiTextMessage = {
	role: "system" | "user";
	content: string;
};

type OpenAiVisionMessage = {
	role: "system";
	content: string;
} | {
	role: "user";
	content: Array<
		| { type: "text"; text: string }
		| { type: "image_url"; image_url: { url: string } }
	>;
};

type OpenAiTextResponse = {
	choices?: Array<{
		message?: {
			content?: string | Array<OpenAiMessageContentPart> | null;
		};
	}>;
};

type OpenAiImageResponse = {
	data?: Array<{
		b64_json?: string | null;
	}>;
};

type OpenAiResponsesTextResponse = {
	output_text?: string | null;
	output?: OpenAiResponsesOutputPart[];
	status?: string | null;
	incomplete_details?: {
		reason?: string | null;
	} | null;
	error?: {
		message?: string | null;
	} | null;
};

const extractOpenAiText = (
	content: string | Array<OpenAiMessageContentPart> | null | undefined,
): string => {
	if (typeof content === "string") {
		return content.trim();
	}

	if (!Array.isArray(content)) {
		return "";
	}

	return content
		.map((part) => {
			if (typeof part?.text === "string") {
				return part.text;
			}

			return "";
		})
		.join("")
		.trim();
};

const extractResponsesText = (
	response: OpenAiResponsesTextResponse,
): string => {
	if (typeof response.output_text === "string" && response.output_text.trim()) {
		return response.output_text.trim();
	}

	return (response.output ?? [])
		.map((item) => {
			if (typeof item.text === "string") {
				return item.text;
			}

			if (!Array.isArray(item.content)) {
				return "";
			}

			return item.content
				.map((part) => (typeof part.text === "string" ? part.text : ""))
				.join("");
		})
		.join("")
		.trim();
};

export type OpenAiClientLike = {
	chat: {
		completions: {
			create: (options: {
				model: string;
				messages: OpenAiTextMessage[] | OpenAiVisionMessage[];
				max_tokens?: number;
				temperature?: number;
			}) => Promise<OpenAiTextResponse>;
		};
	};
	responses?: {
		create: (options: {
			model: string;
			instructions: string;
			input: string;
			max_output_tokens?: number;
			temperature?: number;
		}) => Promise<OpenAiResponsesTextResponse>;
	};
	images: {
		generate: (options: {
			model: string;
			prompt: string;
			size: "1536x1024";
			quality: "medium";
			moderation: "low";
			output_format: "webp";
			output_compression: number;
		}) => Promise<OpenAiImageResponse>;
	};
};

export type OpenAiTextOptions = {
	client: OpenAiClientLike;
	model: string;
	system: string;
	userText?: string;
	maxTokens?: number;
	temperature?: number;
};

export type OpenAiVisionTextOptions = {
	client: OpenAiClientLike;
	model: string;
	system: string;
	userText: string;
	imageBytes: Uint8Array;
	imageMimeType: string;
	maxTokens?: number;
	temperature?: number;
};

export type OpenAiImageWebpOptions = {
	client: OpenAiClientLike;
	model: string;
	prompt: string;
};

export const createOpenAiText = async (
	options: OpenAiTextOptions,
): Promise<string> => {
	const userText = options.userText?.trim() || DEFAULT_EMPTY_USER_PROMPT;
	const isGpt5Model = options.model.startsWith("gpt-5");

	if (isGpt5Model) {
		if (!options.client.responses?.create) {
			throw new Error(
				`OpenAI client does not support responses.create for model ${options.model}.`,
			);
		}

		const response = await options.client.responses.create({
			model: options.model,
			instructions: options.system,
			input: userText,
			...(options.maxTokens ? { max_output_tokens: options.maxTokens } : {}),
			...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
		});

		const text = extractResponsesText(response);
		if (!text) {
			const suffix = response.error?.message
				? ` Error: ${response.error.message}`
				: response.incomplete_details?.reason
					? ` Incomplete reason: ${response.incomplete_details.reason}`
					: response.status
						? ` Status: ${response.status}`
						: "";
			throw new Error(`OpenAI response for model ${options.model} is empty.${suffix}`);
		}

		return text;
	}

	const messages: OpenAiTextMessage[] = [
		{ role: "system", content: options.system },
		{ role: "user", content: userText },
	];

	const response = await options.client.chat.completions.create({
		model: options.model,
		messages,
		...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
		...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
	});

	const text = extractOpenAiText(response.choices?.[0]?.message?.content);
	if (!text) {
		throw new Error(`OpenAI response for model ${options.model} is empty.`);
	}
	return text;
};

export const createOpenAiJson = async <T>(
	options: OpenAiTextOptions,
): Promise<T> => {
	const text = await createOpenAiText(options);
	return parseAiJson<T>(text);
};

export const createOpenAiVisionText = async (
	options: OpenAiVisionTextOptions,
): Promise<string> => {
	const base64 = Buffer.from(options.imageBytes).toString("base64");
	const dataUrl = `data:${options.imageMimeType};base64,${base64}`;

	const completionTokens = options.model.startsWith('gpt-5') ? 'max_completion_tokens' : 'max_tokens';
	const supportedTemperature = options.model.startsWith('gpt-5') ? 1 : options.temperature;
	const response = await options.client.chat.completions.create({
		model: options.model,
		messages: [
			{
				role: "system",
				content: options.system,
			},
			{
				role: "user",
				content: [
					{ type: "text", text: options.userText },
					{ type: "image_url", image_url: { url: dataUrl } },
				],
			},
		],
		...(options.maxTokens ? { [completionTokens]: options.maxTokens } : {}),
		...(supportedTemperature !== undefined ? { temperature: supportedTemperature } : {}),
	});

	const text = extractOpenAiText(response.choices?.[0]?.message?.content);
	if (!text) {
		throw new Error(`OpenAI vision response for model ${options.model} is empty.`);
	}

	return text;
};

export const createOpenAiImageWebp = async (
	options: OpenAiImageWebpOptions,
): Promise<Uint8Array> => {
	const response = await options.client.images.generate({
		model: options.model,
		prompt: options.prompt,
		size: "1536x1024",
		quality: "medium",
		moderation: "low",
		output_format: "webp",
		output_compression: 100,
	});

	const b64 = response.data?.[0]?.b64_json ?? "";
	if (!b64) {
		throw new Error(`OpenAI image response for model ${options.model} is empty.`);
	}

	return new Uint8Array(Buffer.from(b64, "base64"));
};
