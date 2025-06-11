// Simple test to verify basic functionality
import { GitUtils } from "./packages/server/dist/index.js";

console.log("🧪 Testing Git utilities...");

const gitUtils = new GitUtils();
const testFile = "/Users/badlogic/workspaces/lemmy/apps/diffy-mcp/test-sample.txt";

console.log("Test file:", testFile);
console.log("Is in git repo:", gitUtils.isInGitRepo(testFile));

if (gitUtils.isInGitRepo(testFile)) {
	const gitRoot = gitUtils.findGitRoot(testFile);
	console.log("Git root:", gitRoot);

	const currentBranch = gitUtils.getCurrentBranch(testFile);
	console.log("Current branch:", currentBranch);

	const fileStatus = gitUtils.getFileStatus(testFile);
	console.log("File status:", fileStatus);
}
