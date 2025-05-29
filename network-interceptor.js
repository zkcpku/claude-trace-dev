#!/usr/bin/env node

const https = require("https");
const http = require("http");
const path = require("path");

// Get target file from command line
const targetFile = process.argv[2];
if (!targetFile) {
	console.error("Usage: node network-interceptor.js <target-file.js>");
	process.exit(1);
}

// Store original methods
const originalHttpsRequest = https.request;
const originalHttpRequest = http.request;

// Patch HTTPS
https.request = function (options, callback) {
	console.log("\n🔒 HTTPS REQUEST:", {
		url:
			typeof options === "string"
				? options
				: `${options.protocol || "https:"}//${options.host || options.hostname}:${options.port || 443}${options.path || "/"}`,
		method: options.method || "GET",
		headers: options.headers || {},
	});

	const req = originalHttpsRequest.call(this, options, (res) => {
		console.log("📥 HTTPS RESPONSE:", {
			statusCode: res.statusCode,
			headers: res.headers,
		});

		// Log response body
		let data = "";
		const originalOn = res.on.bind(res);
		res.on = function (event, handler) {
			if (event === "data") {
				return originalOn("data", (chunk) => {
					data += chunk;
					handler(chunk);
				});
			} else if (event === "end") {
				return originalOn("end", () => {
					console.log("📄 RESPONSE BODY:", data.slice(0, 500) + (data.length > 500 ? "..." : ""));
					handler();
				});
			}
			return originalOn(event, handler);
		};

		if (callback) callback(res);
	});

	// Log request body if written
	const originalWrite = req.write.bind(req);
	req.write = function (chunk) {
		console.log("📤 REQUEST BODY:", chunk.toString().slice(0, 500));
		return originalWrite(chunk);
	};

	return req;
};

// Patch HTTP (similar to HTTPS)
http.request = function (options, callback) {
	console.log("\n🔓 HTTP REQUEST:", {
		url:
			typeof options === "string"
				? options
				: `${options.protocol || "http:"}//${options.host || options.hostname}:${options.port || 80}${options.path || "/"}`,
		method: options.method || "GET",
		headers: options.headers || {},
	});

	const req = originalHttpRequest.call(this, options, (res) => {
		console.log("📥 HTTP RESPONSE:", {
			statusCode: res.statusCode,
			headers: res.headers,
		});

		let data = "";
		const originalOn = res.on.bind(res);
		res.on = function (event, handler) {
			if (event === "data") {
				return originalOn("data", (chunk) => {
					data += chunk;
					handler(chunk);
				});
			} else if (event === "end") {
				return originalOn("end", () => {
					console.log("📄 RESPONSE BODY:", data.slice(0, 500) + (data.length > 500 ? "..." : ""));
					handler();
				});
			}
			return originalOn(event, handler);
		};

		if (callback) callback(res);
	});

	const originalWrite = req.write.bind(req);
	req.write = function (chunk) {
		console.log("📤 REQUEST BODY:", chunk.toString().slice(0, 500));
		return originalWrite(chunk);
	};

	return req;
};

console.log(`🚀 Starting ${targetFile} with network interception...\n`);

// Launch the target file
require(path.resolve(targetFile));
