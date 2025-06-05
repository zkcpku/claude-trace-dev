/**
 * Types for Java-to-C++ porting workflow
 */

/** Deleted Java file entry for cleanup tracking */
export interface DeletedJavaFile {
	filePath: string; // Absolute path to deleted Java file
	status: "pending" | "done"; // Cleanup status
}

/** A Java file that has changed between branches */
export interface JavaFile {
	filePath: string; // Absolute path to Java file
	changeType: "added" | "modified"; // Deleted files are tracked separately
	javaTypes: JavaType[];
}

/** A Java type (class/interface/enum) and its C++ porting information */
export interface JavaType {
	// Java type info
	name: string;
	type: "class" | "interface" | "enum";
	startLine: number;
	endLine: number;

	// C++ mapping
	targetFiles: string[]; // Absolute paths to suggested C++ files to modify/create
	filesExist: boolean; // true = update existing, false = create new files
}

/** ChangeSet represents the working data through phases 1-3 */
export interface ChangeSet {
	metadata: {
		prevBranch: string;
		currentBranch: string;
		generated: string; // ISO timestamp
		spineRuntimesDir: string; // Absolute path to spine-runtimes directory
		spineCppDir: string; // Absolute path to spine-cpp directory
	};
	files: JavaFile[]; // Added and modified files only
	deletedFiles: DeletedJavaFile[]; // Deleted files with tracking status
}

/** Simple mapping from Java type name to C++ file path */
export interface CppTypeMapping {
	[typeName: string]: string; // typeName -> absolute path to C++ header file
}

/** Porting order item with complete denormalized information */
export interface PortingOrderItem {
	// Java type info
	simpleName: string;
	fullName: string; // Fully qualified name like com.esotericsoftware.spine.Animation
	type: "class" | "interface" | "enum";
	javaSourcePath: string; // Absolute path to Java source file
	startLine: number;
	endLine: number;

	// Dependency info
	dependencyCount: number; // Number of dependencies this type has

	// C++ mapping
	targetFiles: string[]; // Absolute paths to suggested C++ files to modify/create
	filesExist: boolean; // true = update existing, false = create new files

	// Porting status
	portingState?: "pending" | "skipped" | "incomplete" | "done";
	filesModified?: string[]; // Absolute paths to C++ files that were actually modified
	portingNotes?: string; // Complete porting notes including key changes, failure reason, remaining work, etc.
}

/** Final porting plan with dependency-ordered items */
export interface PortingPlan {
	metadata: {
		prevBranch: string;
		currentBranch: string;
		generated: string; // ISO timestamp
		spineRuntimesDir: string; // Absolute path to spine-runtimes directory
		spineCppDir: string; // Absolute path to spine-cpp directory
	};
	deletedFiles: DeletedJavaFile[]; // Deleted files with tracking status
	portingOrder: PortingOrderItem[]; // Dependency-ordered list with complete denormalized data
}
