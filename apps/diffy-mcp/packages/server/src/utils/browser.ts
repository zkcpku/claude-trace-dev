import { spawn } from "child_process";

/**
 * Cross-platform browser opening utilities
 */

/**
 * Get the appropriate browser opener function for the current platform
 */
export function getBrowserOpener(): (url: string) => Promise<void> {
	return async (url: string) => {
		const platform = process.platform;

		let command: string;
		let args: string[];

		switch (platform) {
			case "win32":
				command = "cmd";
				args = ["/c", "start", '""', url];
				break;
			case "darwin":
				command = "open";
				args = [url];
				break;
			default: // linux and others
				command = "xdg-open";
				args = [url];
				break;
		}

		return new Promise((resolve, reject) => {
			const child = spawn(command, args, {
				detached: true,
				stdio: "ignore",
			});

			child.unref();

			child.on("error", (error) => {
				reject(new Error(`Failed to open browser: ${error.message}`));
			});

			// Don't wait for the browser to close, resolve immediately
			setTimeout(resolve, 100);
		});
	};
}

/**
 * Check if we can open a browser on this platform
 */
export function canOpenBrowser(): boolean {
	const platform = process.platform;
	return ["win32", "darwin", "linux"].includes(platform);
}

/**
 * Get browser opening command for the current platform (for debugging)
 */
export function getBrowserCommand(): { command: string; args: string[] } {
	const platform = process.platform;

	switch (platform) {
		case "win32":
			return { command: "cmd", args: ["/c", "start", '""'] };
		case "darwin":
			return { command: "open", args: [] };
		default:
			return { command: "xdg-open", args: [] };
	}
}
