/**
 * Represents a unique file identity based on filepath and branch context
 * Handles the combination of filepath + branch comparison for proper file tracking
 */
class FileIdentity {
	constructor(filepath, prevBranch = null, currBranch = null) {
		this.filepath = filepath;
		this.prevBranch = prevBranch;
		this.currBranch = currBranch;
	}

	/**
	 * Generate unique key for this file+branch combination
	 * Cases:
	 * 1. Both null: working vs HEAD
	 * 2. Only prevBranch: prevBranch vs working
	 * 3. Both defined: prevBranch vs currBranch
	 * 4. Only currBranch: working vs currBranch
	 */
	getKey() {
		// Case 1: Both null - working vs HEAD (default git diff)
		if (!this.prevBranch && !this.currBranch) {
			return `${this.filepath}@working->HEAD`;
		}

		// Case 2: Only prevBranch defined - prevBranch vs working directory
		if (this.prevBranch && !this.currBranch) {
			return `${this.filepath}@${this.prevBranch}->working`;
		}

		// Case 3: Both defined - prevBranch vs currBranch
		if (this.prevBranch && this.currBranch) {
			return `${this.filepath}@${this.prevBranch}->${this.currBranch}`;
		}

		// Case 4: Only currBranch defined - working vs currBranch
		if (!this.prevBranch && this.currBranch) {
			return `${this.filepath}@working->${this.currBranch}`;
		}
	}

	/**
	 * Create WebSocket watch request for this file identity
	 */
	toWatchRequest() {
		const request = {
			type: "watch",
			absolutePath: this.filepath,
		};

		// Only add branch info if defined
		if (this.prevBranch) {
			request.prevBranch = this.prevBranch;
		}
		if (this.currBranch) {
			request.currBranch = this.currBranch;
		}

		return request;
	}

	/**
	 * Create WebSocket unwatch request for this file identity
	 */
	toUnwatchRequest() {
		const request = {
			type: "unwatch",
			absolutePath: this.filepath,
		};

		// Include branch info if defined (for server to identify correct subscription)
		if (this.prevBranch) {
			request.prevBranch = this.prevBranch;
		}
		if (this.currBranch) {
			request.currBranch = this.currBranch;
		}

		return request;
	}

	/**
	 * Get display name for UI (just filename)
	 */
	getDisplayName() {
		return this.filepath.split("/").pop();
	}

	/**
	 * Get branch display info for UI
	 */
	getBranchInfo() {
		if (!this.prevBranch && !this.currBranch) {
			return "working → HEAD";
		}
		if (this.prevBranch && !this.currBranch) {
			return `${this.prevBranch} → working`;
		}
		if (this.prevBranch && this.currBranch) {
			return `${this.prevBranch} → ${this.currBranch}`;
		}
		if (!this.prevBranch && this.currBranch) {
			return `working → ${this.currBranch}`;
		}
	}

	/**
	 * Check if this represents the same file+branch combination
	 */
	equals(other) {
		return (
			other instanceof FileIdentity &&
			this.filepath === other.filepath &&
			this.prevBranch === other.prevBranch &&
			this.currBranch === other.currBranch
		);
	}
}
