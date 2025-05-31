// Token extractor for OAuth token extraction
// This file is dynamically configured by the CLI to write the token to a specific file
const fs = require("fs");
const originalFetch = global.fetch;

// This will be replaced by the CLI with the actual temp file path
const TEMP_TOKEN_FILE = "TOKEN_FILE_PLACEHOLDER";

global.fetch = async function (input, init = {}) {
	const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

	if (url.includes("api.anthropic.com") && url.includes("/v1/messages")) {
		const headers = new Headers(init.headers || {});
		const authorization = headers.get("authorization");

		if (authorization && authorization.startsWith("Bearer ")) {
			const token = authorization.substring(7);
			try {
				fs.writeFileSync(TEMP_TOKEN_FILE, token);
			} catch (e) {
				// Ignore write errors silently
			}
		}
	}

	return originalFetch(input, init);
};
