import { execSync } from "child_process";
import { readFileSync, readdirSync, statSync, mkdirSync, existsSync, writeFileSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { platform } from "os";
import { fileURLToPath } from "url";

/**
 * Configuration interface for screenshot operations
 */
export interface ScreenshotConfig {
	screenshotPath: string;
}

/**
 * Interface for window information
 */
export interface WindowInfo {
	id: number;
	cgWindowID: number; // Core Graphics window ID for direct capture
	title: string;
	app: string;
	position: { x: number; y: number };
	size: { width: number; height: number };
}

/**
 * Validates that the screenshot path exists and is writable
 * Creates the directory if it doesn't exist
 * @param path - The directory path to validate
 * @throws Error if the path is not writable
 */
export function validateScreenshotPath(path: string): void {
	if (!existsSync(path)) {
		mkdirSync(path, { recursive: true });
	}

	// Test if directory is writable by creating a temporary file
	const testFile = join(path, ".test-write");
	try {
		writeFileSync(testFile, "");
		unlinkSync(testFile);
	} catch (error) {
		throw new Error(`Screenshot path is not writable: ${path}`);
	}
}

/**
 * Takes a screenshot and saves it to the specified directory
 * Uses platform-specific commands: screencapture (macOS), gnome-screenshot/scrot (Linux), PowerShell (Windows)
 * @param screenshotPath - Directory where the screenshot should be saved
 * @param windowId - Optional window ID to capture specific window (macOS only, uses window geometry)
 * @returns The full path to the saved screenshot file
 * @throws Error if screenshot capture fails
 */
export function takeScreenshot(screenshotPath: string, windowId?: number): string {
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-").split("T").join("-").split(".")[0];
	const filename = `${timestamp}.png`;
	const filepath = join(screenshotPath, filename);

	const currentPlatform = platform();

	// Window-specific screenshots only supported on macOS
	if (windowId && currentPlatform !== "darwin") {
		throw new Error("Window-specific screenshots are only supported on macOS");
	}

	try {
		switch (currentPlatform) {
			case "darwin": // macOS
				if (windowId) {
					// Find the window by ID and use native window capture
					const windows = listWindows();
					const targetWindow = windows.find((w) => w.id === windowId);

					if (!targetWindow) {
						throw new Error(`Window with ID ${windowId} not found`);
					}

					// Use native utility to capture window directly by cgWindowID
					const __filename = fileURLToPath(import.meta.url);
					const __dirname = dirname(__filename);
					let captureUtilPath = join(__dirname, "native", "capture-window");

					// If the captureUtilPath doesn't exist, we might be running via tsx
					// so we need to adjust to __dirname/../dist/native/capture-window
					if (!existsSync(captureUtilPath)) {
						captureUtilPath = join(__dirname, "../dist/native", "capture-window");
					}

					execSync(`"${captureUtilPath}" ${targetWindow.cgWindowID} "${filepath}"`, { stdio: "pipe" });
				} else {
					execSync(`screencapture -x -t png "${filepath}"`, { stdio: "pipe" });
				}
				break;

			case "linux":
				// Try gnome-screenshot first, fall back to scrot
				try {
					execSync(`gnome-screenshot --file="${filepath}"`, { stdio: "pipe" });
				} catch {
					execSync(`scrot "${filepath}"`, { stdio: "pipe" });
				}
				break;

			case "win32": // Windows
				// Use PowerShell to take screenshot
				const psScript = `
          Add-Type -AssemblyName System.Windows.Forms;
          Add-Type -AssemblyName System.Drawing;
          $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds;
          $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height;
          $graphics = [System.Drawing.Graphics]::FromImage($bitmap);
          $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size);
          $bitmap.Save("${filepath.replace(/\\/g, "\\\\")}", [System.Drawing.Imaging.ImageFormat]::Png);
          $graphics.Dispose();
          $bitmap.Dispose();
        `;
				execSync(`powershell -Command "${psScript}"`, { stdio: "pipe" });
				break;

			default:
				throw new Error(`Unsupported platform: ${currentPlatform}`);
		}

		// Verify the file was created
		if (!existsSync(filepath)) {
			throw new Error("Screenshot file was not created");
		}

		return filepath;
	} catch (error) {
		throw new Error(`Failed to take screenshot: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/**
 * Finds and returns the path to the most recent screenshot in the directory
 * Searches for PNG files and sorts by modification time
 * @param screenshotPath - Directory to search for screenshots
 * @returns Path to the most recent screenshot, or null if none found
 * @throws Error if directory doesn't exist or cannot be read
 */
export function getLastScreenshot(screenshotPath: string): string | null {
	try {
		if (!existsSync(screenshotPath)) {
			throw new Error(`Screenshot directory does not exist: ${screenshotPath}`);
		}

		const files = readdirSync(screenshotPath)
			.filter((file) => file.endsWith(".png"))
			.map((file) => ({
				name: file,
				path: join(screenshotPath, file),
				mtime: statSync(join(screenshotPath, file)).mtime,
			}))
			.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

		return files.length > 0 ? files[0].path : null;
	} catch (error) {
		throw new Error(`Failed to get last screenshot: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/**
 * Converts an image file to base64 encoded string
 * @param imagePath - Path to the image file to convert
 * @returns Base64 encoded string representation of the image
 * @throws Error if file cannot be read or converted
 */
export function imageToBase64(imagePath: string): string {
	try {
		const imageBuffer = readFileSync(imagePath);
		return imageBuffer.toString("base64");
	} catch (error) {
		throw new Error(`Failed to convert image to base64: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/**
 * Reads configuration from environment variables
 * Uses SNAP_HAPPY_SCREENSHOT_PATH environment variable
 * Falls back to ~/Desktop/snaphappy if no environment variable is set
 * @returns Screenshot configuration object
 */
export function getScreenshotConfig(): ScreenshotConfig {
	let screenshotPath = process.env.SNAP_HAPPY_SCREENSHOT_PATH;

	if (!screenshotPath) {
		// Default to ~/Desktop/snaphappy if no environment variable is set
		const homeDir = process.env.HOME || process.env.USERPROFILE || "/tmp";
		screenshotPath = join(homeDir, "Desktop", "snaphappy");
	}

	return { screenshotPath };
}

/**
 * Lists all visible windows on macOS using native utility
 * Returns window information including position and size for use with screencapture -R
 * @returns Array of window information (id, title, app, position, size)
 * @throws Error if not on macOS or native utility fails
 */
export function listWindows(): WindowInfo[] {
	if (platform() !== "darwin") {
		throw new Error("Window listing is only supported on macOS");
	}

	try {
		// Use the native Swift utility to get window information
		const __filename = fileURLToPath(import.meta.url);
		const __dirname = dirname(__filename);
		let nativeUtilPath = join(__dirname, "native", "list-windows");

		// If the nativeUtilPath doesn't exist, we might be running via tsx
		// so we need to adjust to __dirname/../dist/native/list-windows
		if (!existsSync(nativeUtilPath)) {
			nativeUtilPath = join(__dirname, "../dist/native", "list-windows");
		}

		const result = execSync(nativeUtilPath, {
			encoding: "utf8",
			stdio: "pipe",
		});

		if (!result.trim()) {
			throw new Error("No windows found");
		}

		const windows: WindowInfo[] = JSON.parse(result.trim());

		if (windows.length === 0) {
			throw new Error(
				"No windows found. This may require granting Screen Recording permissions in System Preferences → Security & Privacy → Privacy → Screen Recording",
			);
		}

		return windows;
	} catch (error) {
		if (error instanceof SyntaxError) {
			throw new Error("Failed to parse window information from native utility");
		}
		throw new Error(
			`Failed to list windows: ${error instanceof Error ? error.message : String(error)}. This may require granting Screen Recording permissions in System Preferences → Security & Privacy → Privacy → Screen Recording`,
		);
	}
}
