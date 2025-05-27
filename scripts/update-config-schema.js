#!/usr/bin/env node

import { Context, lemmy } from "../packages/lemmy/dist/index.js";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function generateOptionsSchema() {
	console.log("🤖 Using Claude Sonnet 4.0 to generate options schema...");

	// Read the types.ts file using proper path resolution
	const typesPath = join(__dirname, "../packages/lemmy/src/types.ts");
	const typesContent = readFileSync(typesPath, "utf8");

	// Create Claude client
	const claude = lemmy.anthropic({
		apiKey: process.env.ANTHROPIC_API_KEY,
		model: "claude-sonnet-4-20250514", // Claude Sonnet 4.0
	});

	const context = new Context();

	const prompt = `
Analyze this TypeScript types file and generate a comprehensive options schema for CLI argument parsing.

Extract from BaseConfig, AnthropicConfig, OpenAIConfig, and GoogleConfig interfaces:
1. Field names and types (string, number, boolean, enum)
2. Whether fields are required or optional
3. JSDoc documentation comments
4. Enum values for union types like "low" | "medium" | "high"

Generate ONLY the CONFIG_SCHEMA object, no helper functions. The schema should look like this:

\`\`\`typescript
export const CONFIG_SCHEMA = {
  base: {
    fieldName: { 
      type: 'string' | 'number' | 'boolean' | 'enum',
      required: boolean,
      doc: string,
      values?: string[] // for enums
    },
    // ... more fields
  },
  anthropic: {
    // anthropic-specific fields (excluding base)
  },
  openai: {
    // openai-specific fields (excluding base)
  },
  google: {
    // google-specific fields (excluding base)
  }
} as const;
\`\`\`

Only include the actual interface definitions, skip imports and other code.

Here's the types.ts file:

${typesContent}
`;

	console.log("🧠 Analyzing types with Claude...");
	const result = await claude.ask(prompt, { context });

	if (result.type === "success") {
		console.log("✅ Generated schema successfully!");

		// Extract code blocks from the response
		const codeMatch = result.message.content.match(/```typescript\n([\s\S]*?)\n```/);
		if (codeMatch) {
			const generatedCode = codeMatch[1];

			// Write to generated/config-schema.ts using proper path resolution
			const outputPath = join(__dirname, "../packages/lemmy/src/generated/config-schema.ts");
			writeFileSync(outputPath, generatedCode);

			console.log(`📝 Written to ${outputPath}`);
			console.log(`💰 Cost: $${result.cost.toFixed(6)}`);
			console.log(`🏷️  Tokens: ${result.tokens.input} in, ${result.tokens.output} out`);
		} else {
			console.error("❌ Could not extract TypeScript code from response");
			console.log("Response:", result.message.content);
		}
	} else {
		console.error("❌ Error:", result.error.message);
		process.exit(1);
	}
}

generateOptionsSchema().catch((error) => {
	console.error("💥 Fatal error:", error);
	process.exit(1);
});
