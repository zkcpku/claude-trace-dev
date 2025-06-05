# Java-to-C++ Type Porting

## Overview

We are working on the Spine Runtime, a skeletal animation library for loading, manipulating and rendering Spine skeletons, porting Java code changes to C++. The Spine project maintains parallel implementations in multiple languages, and we need to keep the C++ version synchronized with Java updates.

**What we're doing:** Take a single Java type (class, interface, or enum) that potentially has changes between two git branches/commits/tags and port those changes to the corresponding C++ files.

**Build verification:** Build verification is available but should only be used when explicitly requested by the user. Due to circular dependencies between Java types, there is no clean porting order where the code compiles after every individual type is ported.

**The porting plan:** All work is tracked in a porting plan JSON file called `porting-plan.json` - a structured file containing metadata about git branches, lists of deleted Java files, and a priority-ordered porting sequence.

```typescript
/** Porting order item with complete denormalized information */
interface PortingOrderItem {
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

/** Final porting plan with priority-ordered items */
interface PortingPlan {
	metadata: {
		prevBranch: string;
		currentBranch: string;
		generated: string; // ISO timestamp
		spineRuntimesDir: string; // Absolute path to spine-runtimes directory
		spineCppDir: string; // Absolute path to spine-cpp directory
	};
	deletedFiles: DeletedJavaFile[]; // Deleted files with tracking status
	portingOrder: PortingOrderItem[]; // Priority-ordered list with complete denormalized data
}

/** Deleted Java file entry for cleanup tracking */
interface DeletedJavaFile {
	filePath: string; // Absolute path to deleted Java file
	status: "pending" | "done"; // Cleanup status
}
```

**Working Directory:** Read the `spineRuntimesDir` from porting plan metadata

- **Spine Java sources:** `spine-libgdx/spine-libgdx/src/com/esotericsoftware/spine/` (relative to spine runtimes dir)
- **Spine C++ sources:** `spine-cpp/spine-cpp/src/spine/` and `spine-cpp/spine-cpp/include/spine/` (relative to spine runtimes dir)

## Step-by-Step Workflow

### 0. Locate the Porting Plan

If `porting-plan.json` doesn't exist in the current working directory, ask the user for the file's location.

### 1. Find the Next Type to Port

Use the priority-ordered `portingOrder` array to find the next type to port:

```bash
# Find the next pending type in priority order
jq -r '.portingOrder[] | select(.portingState == "pending") | . | @json' porting-plan.json | head -1 | jq .
```

This finds the first `PortingOrderItem` where `portingState` is "pending". The `portingOrder` array is sorted by priority:

1. **Zero dependencies first** - interfaces and enums with no dependencies
2. **New files (added)** - get slight priority boost for fresh implementation
3. **Interfaces and enums** - foundational types get priority boost
4. **Classes by dependency count** - fewer dependencies first

### 2. Confirm with User

**STOP HERE** and ask the user if this is the type they want to work on. Show them the complete `PortingOrderItem` JSON.

### 3. Extract Type Information

Each `PortingOrderItem` is completely denormalized and contains all the information you need:

- `simpleName` - Type name (e.g. "Animation", "Pose")
- `fullName` - Fully qualified Java name (e.g. "com.esotericsoftware.spine.Animation")
- `type` - "class", "interface", or "enum"
- `javaSourcePath` - **Absolute path** to Java source file
- `startLine`/`endLine` - Location in the Java file
- `dependencyCount` - Number of dependencies this type has (for debugging dependency analysis)
- `targetFiles[]` - **Absolute paths** to suggested C++ files to modify/create
- `filesExist` - Whether the C++ files already exist (`true` = update existing, `false` = create new files)
- `portingState` - Current status ("pending", "skipped", "incomplete", "done")

### 4. Read the Java Source Code

Use the Read tool to examine the Java type at the specified file path and line range. **IMPORTANT:** Always use the exact `startLine` and `endLine` from the `PortingOrderItem` to read the complete type definition - use `offset=startLine` and `limit=(endLine-startLine+1)` to capture the entire type.

### 5. Check if Git Changes Affect This Type

Use git diff between `prevBranch` and `currentBranch` (from porting plan metadata) to see if changes actually touch this type's lines.

### 6. Port to C++

- **First, read the complete existing C++ files** (both header and source if they exist) to understand the current implementation
- **CRITICAL: Check for missing dependencies FIRST**
   - If the Java class extends/implements types that don't exist in C++, **STOP IMMEDIATELY**
   - Tell the user: "Cannot port [ClassName] because it depends on [MissingType] which doesn't exist in C++ yet. We need to port [MissingType] first."
   - Do NOT attempt to port with placeholder inheritance - this creates incorrect implementations
- **Only proceed if all dependencies exist**
- **NOTE:** Due to circular dependencies in the codebase, some types may have dependencies that create compilation errors until multiple related types are ported together
- **CRITICAL: Always do a complete mechanical translation** - never just add documentation comments and call it "done". The Java source must be ported faithfully and exhaustively.
- **Compare EVERY aspect** of the Java class with the C++ version:
   - Class structure and inheritance (must match Java exactly)
   - All member variables (with proper C++ naming: `_underscore` prefix for private)
   - All constants (static final → static const)
   - All method signatures
   - All method implementations (translate Java logic to C++ following spine-cpp patterns and container classes like Vector instead of Java's Array.)
   - Documentation comments
- **If C++ files don't exist:** Create them from scratch using spine-cpp conventions
- **If C++ files exist:**
   - Compare line-by-line with Java implementation
   - Add any missing members, methods, or logic
   - Update any incorrect implementations
   - Ensure C++ version has 100% functional parity with Java
- **Never mark as "done" unless the C++ implementation is functionally complete AND has correct inheritance**

### 7. Verify Build Compilation (When Requested)

**ONLY when explicitly requested by the user,** verify compilation using the CMake build system:

```bash
# Get spine runtimes directory from porting plan
SPINE_DIR=$(jq -r '.metadata.spineRuntimesDir' porting-plan.json)
SPINE_CPP_DIR="$SPINE_DIR/spine-cpp"
BUILD_DIR="$SPINE_CPP_DIR/build"

# For new files: Clean build to ensure CMake picks up new files
if [[ "$filesExist" == "false" ]]; then
    rm -rf "$BUILD_DIR"
fi

# Configure and build only the main spine-cpp target (not spine-cpp-lite)
mkdir -p "$BUILD_DIR"
cmake -G Ninja -S "$SPINE_CPP_DIR" -B "$BUILD_DIR"
cmake --build "$BUILD_DIR" --target spine-cpp

# Check for compilation errors
if [ $? -eq 0 ]; then
    echo "✅ Build successful - porting verified"
else
    echo "❌ Build failed - compilation errors exist"
    echo "Note: Due to circular dependencies, some errors may be expected until related types are ported"
fi
```

**Important Notes:**

- **Build failures are often expected** due to circular dependencies between types
- A failed build after porting one type does NOT mean the porting was incorrect
- Multiple related types may need to be ported before the code compiles cleanly
- **For new files:** Always clean the build directory (`rm -rf build/`) to force CMake to regenerate since CMake uses `file(GLOB ...)` to discover source files

### 8. Update the Porting Plan

Update the `PortingOrderItem` in the porting plan with your results:

```bash
# Update porting status for a completed type
TYPE_NAME="Animation"  # Replace with the type you just ported
jq --arg name "$TYPE_NAME" --arg state "done" --arg notes "Successfully ported Animation class..." \
   '(.portingOrder[] | select(.simpleName == $name) | .portingState) |= $state |
    (.portingOrder[] | select(.simpleName == $name) | .portingNotes) |= $notes' \
   porting-plan.json > tmp.json && mv tmp.json porting-plan.json
```

Return a structured JSON report with your results.

### 9. STOP and Ask for Confirmation

- **MANDATORY:** After completing any type, you MUST STOP immediately
- Tell the user exactly what you accomplished
- Tell the user what you would work on next and why
- **WAIT for user confirmation** before proceeding to the next type
- This ensures proper pacing and prevents rushing through incomplete work

## Spine-C++ Conventions

### File Structure

- **Java:** `spine-libgdx/spine-libgdx/src/com/esotericsoftware/spine/ClassName.java`
- **C++ Header:** `spine-cpp/spine-cpp/include/spine/ClassName.h`
- **C++ Source:** `spine-cpp/spine-cpp/src/spine/ClassName.cpp`

### Code Patterns

**All Classes:**

```cpp
class ClassName : public SpineObject {
    RTTI_DECL
private:
    int _privateField;  // underscore prefix
public:
    void publicMethod();  // camelCase, same as Java
};
```

**Source Files:**

```cpp
RTTI_IMPL(ClassName, SpineObject)  // or RTTI_IMPL_NOPARENT(ClassName)

ClassName::ClassName() {
    _field = new (__FILE__, __LINE__) SomeClass();  // memory allocation
}
```

**Key Rules:**

- Inherit from `SpineObject`
- Use `RTTI_DECL` in headers, `RTTI_IMPL` in source
- Private fields: `_underscore` prefix
- Public methods: exact Java names (camelCase)
- Memory: `new (__FILE__, __LINE__)`
- Collections: `Vector<T>` not `std::vector<T>`

### Type Translations

- **Java class** → C++ class inheriting SpineObject + RTTI
- **Java interface** → C++ abstract class with pure virtual methods + RTTI
- **Java enum** → C++ enum in namespace spine (header-only, no .cpp)

## Expected Output

After porting, return JSON:

```json
{
	"state": "done|incomplete|skipped|pending",
	"filesModified": ["list", "of", "modified", "files"],
	"portingNotes": "What was done, issues encountered, remaining work"
}
```
