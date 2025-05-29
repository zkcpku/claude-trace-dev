import { readFileSync, existsSync } from "fs";
import { basename } from "path";
import mimeTypes from "mime-types";
import { Attachment } from "@mariozechner/lemmy";

export function getFileType(filePath: string): "image" | "text" | "binary" | "unknown" {
	const mimeType = mimeTypes.lookup(filePath);
	if (!mimeType) return "unknown";

	if (mimeType.startsWith("image/")) return "image";
	if (mimeType.startsWith("text/")) return "text";

	// Special cases for common text files that might not be detected as text/
	const commonTextTypes = [
		"application/json",
		"application/javascript",
		"application/typescript",
		"application/xml",
		"application/yaml",
		"application/x-yaml",
	];

	if (commonTextTypes.includes(mimeType)) return "text";

	return "binary";
}

export function isImageFile(filePath: string): boolean {
	return getFileType(filePath) === "image";
}

export function isTextFile(filePath: string): boolean {
	return getFileType(filePath) === "text";
}

export function loadImageAttachment(filePath: string): Attachment {
	try {
		if (!existsSync(filePath)) {
			throw new Error(`File not found: ${filePath}`);
		}

		if (!isImageFile(filePath)) {
			throw new Error(`File is not an image: ${filePath}`);
		}

		const buffer = readFileSync(filePath);
		const base64Data = buffer.toString("base64");
		const mimeType = mimeTypes.lookup(filePath) || "image/jpeg";

		return {
			type: "image",
			data: base64Data,
			mimeType,
			name: basename(filePath),
		};
	} catch (error) {
		throw new Error(
			`Failed to load image from ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

export function loadTextFile(filePath: string): string {
	try {
		if (!existsSync(filePath)) {
			throw new Error(`File not found: ${filePath}`);
		}

		if (!isTextFile(filePath)) {
			throw new Error(`File is not a text file: ${filePath}`);
		}

		const content = readFileSync(filePath, "utf8");
		return content;
	} catch (error) {
		throw new Error(
			`Failed to load text file from ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

export function loadFileAttachment(filePath: string): { type: "image" | "text"; content: string | Attachment } {
	const fileType = getFileType(filePath);

	if (fileType === "image") {
		return { type: "image", content: loadImageAttachment(filePath) };
	} else if (fileType === "text") {
		return { type: "text", content: loadTextFile(filePath) };
	} else if (fileType === "binary") {
		throw new Error(`Binary files are not supported: ${filePath}`);
	} else {
		throw new Error(`Unknown file type: ${filePath}`);
	}
}
