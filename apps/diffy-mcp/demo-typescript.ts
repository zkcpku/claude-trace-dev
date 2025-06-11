// TypeScript Demo File
export interface User {
	id: number;
	name: string;
	email: string;
}

export class UserService {
	private users: User[] = [];

	addUser(user: User): void {
		this.users.push(user);
	}

	findUserById(id: number): User | undefined {
		return this.users.find((user) => user.id === id);
	}

	getAllUsers(): User[] {
		return [...this.users];
	}
}

// Example usage
const userService = new UserService();
userService.addUser({ id: 1, name: "Alice", email: "alice@example.com" });
userService.addUser({ id: 2, name: "Bob", email: "bob@example.com" });

console.log("All users:", userService.getAllUsers());
