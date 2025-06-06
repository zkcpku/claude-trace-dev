// Unique file identity based on filepath and branch context for tracking files
class FileIdentity {
	constructor(filepath, prevBranch = null, currBranch = null) {
		this.filepath = filepath;
		this.prevBranch = prevBranch;
		this.currBranch = currBranch;
	}

	// Generate unique key for this file+branch combination
	getKey() {
		const prev = this.prevBranch || "working";
		const curr = this.currBranch || (this.prevBranch ? "working" : "HEAD");
		return `${this.filepath}@${prev}->${curr}`;
	}

	// Create WebSocket watch request for this file identity
	toWatchRequest() {
		return {
			type: "watch",
			absolutePath: this.filepath,
			...(this.prevBranch && { prevBranch: this.prevBranch }),
			...(this.currBranch && { currBranch: this.currBranch }),
		};
	}

	// Create WebSocket unwatch request for this file identity
	toUnwatchRequest() {
		return {
			type: "unwatch",
			absolutePath: this.filepath,
			...(this.prevBranch && { prevBranch: this.prevBranch }),
			...(this.currBranch && { currBranch: this.currBranch }),
		};
	}

	// Get display name for UI (just filename)
	getDisplayName() {
		return this.filepath.split("/").pop();
	}

	// Get branch display info for UI
	getBranchInfo() {
		const prev = this.prevBranch || "working";
		const curr = this.currBranch || (this.prevBranch ? "working" : "HEAD");
		return `${prev} → ${curr}`;
	}

	// Check if this represents the same file+branch combination
	equals(other) {
		return (
			other instanceof FileIdentity &&
			this.filepath === other.filepath &&
			this.prevBranch === other.prevBranch &&
			this.currBranch === other.currBranch
		);
	}
}
