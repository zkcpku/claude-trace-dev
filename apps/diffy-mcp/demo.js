// Demo JavaScript file for testing Diffy CLI
console.log("Hello from Diffy demo!");

function fibonacci(n) {
	if (n <= 1) return n;
	return fibonacci(n - 1) + fibonacci(n - 2);
}

// Calculate first 10 fibonacci numbers
for (let i = 0; i < 10; i++) {
	console.log(`fib(${i}) = ${fibonacci(i)}`);
}

// This is line 12 - good for highlighting tests
// Line 13
// Line 14
// Line 15 - end of highlight range
