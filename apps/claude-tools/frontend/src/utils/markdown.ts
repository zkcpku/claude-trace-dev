import { marked } from "marked";

/**
 * Convert markdown text to HTML string
 * @param markdown - The markdown text to convert
 * @returns HTML string
 */
export function markdownToHtml(markdown: string): string {
	if (!markdown) return "";

	try {
		return marked(markdown) as string;
	} catch (error) {
		console.warn("Failed to parse markdown:", error);
		// Fallback to plain text with basic line break handling
		return markdown.replace(/\n/g, "<br>");
	}
}
