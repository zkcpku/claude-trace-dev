/**
 * Simple types matching the original markdown porting matrix structure
 */

/** Porting order item with status and cross-references */
export interface PortingOrderItem {
	simpleName: string;
	fullName: string; // Fully qualified name like com.esotericsoftware.spine.Animation
	javaSourcePath: string; // Relative path to Java source file
	portingState?: "pending" | "skipped" | "incomplete" | "done";
	filesModified?: string[]; // List of C++ files that were actually modified
	portingNotes?: string; // Complete porting notes including key changes, failure reason, remaining work, etc.
}

/** Complete porting matrix for tracking Java-to-C++ code porting */
export interface PortingMatrix {
	metadata: {
		prevBranch: string;
		currentBranch: string;
		generated: string; // ISO timestamp
		spineRuntimesDir: string; // Full path to spine-runtimes directory
	};
	files: JavaFile[];
	portingOrder?: PortingOrderItem[]; // Ordered list of types in dependency order with porting status
}

/** A Java file that has changed between branches */
export interface JavaFile {
	filePath: string;
	changeType: "added" | "modified" | "deleted";
	javaTypes: JavaType[];
}

/** A Java type (class/interface/enum) and its C++ porting information */
export interface JavaType {
	// Java type info
	name: string;
	type: "class" | "interface" | "enum";
	description: string;
	startLine: number;
	endLine: number;

	// C++ mapping
	cppHeader: string;
	cppSource: string | null; // null for header-only types like enums
	filesExist: boolean;
	action: "update_existing" | "create_new_files" | "delete_files" | "rename_and_update" | "no_action_needed";
}
