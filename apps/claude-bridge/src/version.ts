declare const __PACKAGE_VERSION__: string;

let versionString: string;

try {
	// This will be defined during the tsup build and available in the built .js files
	versionString = __PACKAGE_VERSION__;
} catch (error) {
	// This block will be hit when __PACKAGE_VERSION__ is not defined,
	// for example, when running directly with tsx.
	versionString = "dev-tsx-mode"; // Fallback for non-build environments
}

export const VERSION = versionString;
