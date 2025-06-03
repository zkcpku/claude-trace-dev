import fs from "fs";
import path from "path";

export interface Logger {
	log(message: string): void;
	error(message: string): void;
}

/**
 * No-op logger that discards all log messages
 */
export class NullLogger implements Logger {
	log(message: string): void {
		// No-op
	}

	error(message: string): void {
		// No-op
	}
}

/**
 * File-based logger that writes timestamped messages to a log file
 */
export class FileLogger implements Logger {
	private logFile: string;

	constructor(logDir: string) {
		this.logFile = path.join(logDir, "log.txt");
		fs.writeFileSync(this.logFile, `[${new Date().toISOString()}] Claude Bridge Logger Started\n`);
	}

	log(message: string): void {
		try {
			const timestamp = new Date().toISOString();
			fs.appendFileSync(this.logFile, `[${timestamp}] ${message}\n`);
		} catch {
			// Silently ignore logging errors
		}
	}

	error(message: string): void {
		try {
			const timestamp = new Date().toISOString();
			fs.appendFileSync(this.logFile, `[${timestamp}] ERROR: ${message}\n`);
		} catch {
			// Silently ignore logging errors
		}
	}
}
