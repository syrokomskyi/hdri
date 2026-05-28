import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		ignores: [
			"**/dist",
			"**/build",
			"**/.output",
			"**/node_modules",
			"**/vite.config.*.timestamp*",
			"**/vitest.config.*.timestamp*",
			"**/spec",
			"spec",
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ["**/*.{ts,tsx,mts,cts,js,mjs,cjs}"],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
		},
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					"argsIgnorePattern": "^_",
					"varsIgnorePattern": "^_",
					"caughtErrorsIgnorePattern": "^_"
				}
			]
		}
	},
	{
		files: ["packages/utils/src/**/*.{ts,tsx,mts,cts}"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: ["@org/async", "@org/colors", "@org/strings", "@org/pipeline-*"]
				}
			]
		}
	},
	{
		files: ["packages/async/src/**/*.{ts,tsx,mts,cts}"],
		rules: {
			"no-restricted-imports": ["error", { "patterns": ["@org/colors", "@org/strings", "@org/pipeline-*"] }]
		}
	},
	{
		files: ["packages/colors/src/**/*.{ts,tsx,mts,cts}"],
		rules: {
			"no-restricted-imports": ["error", { "patterns": ["@org/async", "@org/strings", "@org/pipeline-*"] }]
		}
	},
	{
		files: ["packages/strings/src/**/*.{ts,tsx,mts,cts}"],
		rules: {
			"no-restricted-imports": ["error", { "patterns": ["@org/async", "@org/colors", "@org/pipeline-*"] }]
		}
	}
);
