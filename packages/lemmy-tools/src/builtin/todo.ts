import { z } from "zod";
import { defineTool } from "@mariozechner/lemmy";
import type { LemmyTool } from "../types.js";

// In-memory todo storage (in a real implementation, this might be persistent)
let todoList: Array<{
	id: string;
	content: string;
	status: "pending" | "in_progress" | "completed";
	priority: "high" | "medium" | "low";
	created: string;
	updated: string;
}> = [];

/**
 * TodoRead tool for reading the todo list
 */
export const todoReadTool: LemmyTool = defineTool({
	name: "TodoRead",
	description: `Use this tool to read the current to-do list for the session. This tool should be used proactively and frequently to ensure that you are aware of
the status of the current task list. You should make use of this tool as often as possible, especially in the following situations:
- At the beginning of conversations to see what's pending
- Before starting new tasks to prioritize work
- When the user asks about previous tasks or plans
- Whenever you're uncertain about what to do next
- After completing tasks to update your understanding of remaining work
- After every few messages to ensure you're on track

Usage:
- This tool takes in no parameters. So leave the input blank or empty. DO NOT include a dummy object, placeholder string or a key like "input" or "empty". LEAVE IT BLANK.
- Returns a list of todo items with their status, priority, and content
- Use this information to track progress and plan next steps
- If no todos exist yet, an empty list will be returned`,
	category: "productivity",
	schema: z.object({}),
	execute: async (args, signal) => {
		if (signal?.aborted) {
			throw new Error("Todo read was cancelled");
		}

		return {
			total_todos: todoList.length,
			pending: todoList.filter((t) => t.status === "pending").length,
			in_progress: todoList.filter((t) => t.status === "in_progress").length,
			completed: todoList.filter((t) => t.status === "completed").length,
			todos: todoList.map((todo) => ({
				id: todo.id,
				content: todo.content,
				status: todo.status,
				priority: todo.priority,
				created: todo.created,
				updated: todo.updated,
			})),
		};
	},
}) as LemmyTool;

/**
 * TodoWrite tool for managing the todo list
 */
export const todoWriteTool: LemmyTool = defineTool({
	name: "TodoWrite",
	description: `Use this tool to create and manage a structured task list for your current coding session. This helps you track progress, organize complex tasks, and demonstrate thoroughness to the user.
It also helps the user understand the progress of the task and overall progress of their requests.

## When to Use This Tool
Use this tool proactively in these scenarios:

1. Complex multi-step tasks - When a task requires 3 or more distinct steps or actions
2. Non-trivial and complex tasks - Tasks that require careful planning or multiple operations
3. User explicitly requests todo list - When the user directly asks you to use the todo list
4. User provides multiple tasks - When users provide a list of things to be done (numbered or comma-separated)
5. After receiving new instructions - Immediately capture user requirements as todos. Feel free to edit the todo list based on new information.
6. After completing a task - Mark it complete and add any new follow-up tasks
7. When you start working on a new task, mark the todo as in_progress. Ideally you should only have one todo as in_progress at a time. Complete existing tasks before starting new ones.

## When NOT to Use This Tool

Skip using this tool when:
1. There is only a single, straightforward task
2. The task is trivial and tracking it provides no organizational benefit
3. The task can be completed in less than 3 trivial steps
4. The task is purely conversational or informational

NOTE that you should not use this tool if there is only one trivial task to do. In this case you are better off just doing the task directly.

## Task States and Management

1. **Task States**: Use these states to track progress:
   - pending: Task not yet started
   - in_progress: Currently working on (limit to ONE task at a time)
   - completed: Task finished successfully
   - cancelled: Task no longer needed

2. **Task Management**:
   - Update task status in real-time as you work
   - Mark tasks complete IMMEDIATELY after finishing (don't batch completions)
   - Only have ONE task in_progress at any time
   - Complete current tasks before starting new ones
   - Cancel tasks that become irrelevant

3. **Task Breakdown**:
   - Create specific, actionable items
   - Break complex tasks into smaller, manageable steps
   - Use clear, descriptive task names

When in doubt, use this tool. Being proactive with task management demonstrates attentiveness and ensures you complete all requirements successfully.`,
	category: "productivity",
	schema: z.object({
		todos: z
			.array(
				z.object({
					content: z.string().min(1),
					status: z.enum(["pending", "in_progress", "completed"]),
					priority: z.enum(["high", "medium", "low"]),
					id: z.string(),
				}),
			)
			.describe("The updated todo list"),
	}),
	execute: async (args, signal) => {
		const { todos } = args;

		if (signal?.aborted) {
			throw new Error("Todo write was cancelled");
		}

		const now = new Date().toISOString();

		// Update the todo list
		const updatedTodos = todos.map((todo) => {
			const existing = todoList.find((t) => t.id === todo.id);
			return {
				id: todo.id,
				content: todo.content,
				status: todo.status,
				priority: todo.priority,
				created: existing?.created || now,
				updated: now,
			};
		});

		// Replace the entire todo list
		todoList = updatedTodos;

		return {
			message: "Todo list updated successfully",
			total_todos: todoList.length,
			pending: todoList.filter((t) => t.status === "pending").length,
			in_progress: todoList.filter((t) => t.status === "in_progress").length,
			completed: todoList.filter((t) => t.status === "completed").length,
			updated_at: now,
		};
	},
}) as LemmyTool;
