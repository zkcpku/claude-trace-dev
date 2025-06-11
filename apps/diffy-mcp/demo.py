#!/usr/bin/env python3
"""
Demo Python file for testing Diffy CLI
"""

def factorial(n):
    """Calculate factorial of n"""
    if n <= 1:
        return 1
    return n * factorial(n - 1)

def main():
    """Main function"""
    print("Factorial demo:")
    for i in range(1, 6):
        print(f"{i}! = {factorial(i)}")

if __name__ == "__main__":
    main()