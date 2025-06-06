/**
 * Configurable logging system for the file viewer frontend
 * By default, all logging is disabled
 */

class Logger {
	constructor() {
		// Default configuration - all logging disabled
		this.config = {
			enabled: false,
			levels: {
				log: false,
				error: false,
				warn: false,
				info: false,
				debug: false,
			},
		};

		// Check for URL parameters to enable logging
		this.initFromUrlParams();

		// Check localStorage for persistent config
		this.loadFromStorage();
	}

	initFromUrlParams() {
		const params = new URLSearchParams(window.location.search);

		// Enable all logging with ?debug=true
		if (params.get("debug") === "true") {
			this.enableAll();
		}

		// Enable specific levels with ?log=error,warn
		const logParam = params.get("log");
		if (logParam) {
			const levels = logParam.split(",");
			levels.forEach((level) => {
				if (this.config.levels.hasOwnProperty(level.trim())) {
					this.config.levels[level.trim()] = true;
					this.config.enabled = true;
				}
			});
		}
	}

	loadFromStorage() {
		try {
			const stored = localStorage.getItem("fileviewer-logging");
			if (stored) {
				const config = JSON.parse(stored);
				this.config = { ...this.config, ...config };
			}
		} catch (e) {
			// Ignore storage errors
		}
	}

	saveToStorage() {
		try {
			localStorage.setItem("fileviewer-logging", JSON.stringify(this.config));
		} catch (e) {
			// Ignore storage errors
		}
	}

	enableAll() {
		this.config.enabled = true;
		Object.keys(this.config.levels).forEach((level) => {
			this.config.levels[level] = true;
		});
		this.saveToStorage();
	}

	disableAll() {
		this.config.enabled = false;
		Object.keys(this.config.levels).forEach((level) => {
			this.config.levels[level] = false;
		});
		this.saveToStorage();
	}

	enable(level) {
		if (this.config.levels.hasOwnProperty(level)) {
			this.config.levels[level] = true;
			this.config.enabled = true;
			this.saveToStorage();
		}
	}

	disable(level) {
		if (this.config.levels.hasOwnProperty(level)) {
			this.config.levels[level] = false;
			// Check if any level is still enabled
			const anyEnabled = Object.values(this.config.levels).some((enabled) => enabled);
			if (!anyEnabled) {
				this.config.enabled = false;
			}
			this.saveToStorage();
		}
	}

	log(...args) {
		if (this.config.enabled && this.config.levels.log) {
			console.log(...args);
		}
	}

	error(...args) {
		if (this.config.enabled && this.config.levels.error) {
			console.error(...args);
		}
	}

	warn(...args) {
		if (this.config.enabled && this.config.levels.warn) {
			console.warn(...args);
		}
	}

	info(...args) {
		if (this.config.enabled && this.config.levels.info) {
			console.info(...args);
		}
	}

	debug(...args) {
		if (this.config.enabled && this.config.levels.debug) {
			console.debug(...args);
		}
	}

	// Global API for runtime configuration
	configure(options) {
		this.config = { ...this.config, ...options };
		this.saveToStorage();
	}

	getConfig() {
		return { ...this.config };
	}
}

// Create global logger instance
const logger = new Logger();

// Expose logger configuration API globally
window.fileViewerLogger = {
	enableAll: () => logger.enableAll(),
	disableAll: () => logger.disableAll(),
	enable: (level) => logger.enable(level),
	disable: (level) => logger.disable(level),
	configure: (options) => logger.configure(options),
	getConfig: () => logger.getConfig(),
};

export default logger;
