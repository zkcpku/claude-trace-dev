import { readFileSync } from "fs";
import { extname } from "path";
import { Attachment } from "@mariozechner/lemmy";

export function getMimeTypeFromExtension(filePath: string): string {
	const ext = extname(filePath).toLowerCase();
	const mimeTypes: { [key: string]: string } = {
		".jpg": "image/jpeg",
		".jpeg": "image/jpeg",
		".png": "image/png",
		".gif": "image/gif",
		".webp": "image/webp",
		".bmp": "image/bmp",
		".tiff": "image/tiff",
		".tif": "image/tiff",
	};

	return mimeTypes[ext] || "image/jpeg"; // default fallback
}

export function loadImageAttachment(filePath: string): Attachment {
	try {
		const buffer = readFileSync(filePath);
		const base64Data = buffer.toString("base64");
		const mimeType = getMimeTypeFromExtension(filePath);

		return {
			type: "image",
			data: base64Data,
			mimeType,
			name: filePath.split("/").pop() || "image",
		};
	} catch (error) {
		throw new Error(
			`Failed to load image from ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
