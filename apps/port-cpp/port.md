# Java-to-C++ Type Porting

## Overview

We are working collaboratively on the Spine Runtime, a skeletal animation library for loading, manipulating and rendering Spine skeletons, porting Java code changes to C++. The Spine project maintains parallel implementations in multiple languages, and we need to keep the C++ version synchronized with Java updates.

Our work is tracked in `porting-plan.json` which contains git branches, deleted files, the spine runtimes directory, and a priority-ordered porting sequence. The types in the porting-plan.json file (PortingPlan, PortingOrderItem, DeletedJavaFile) are described in src/types.ts (relative to this file).

**Working Directory:** Paths are relative to the spine-runtimes directory:

- **Java sources:** `spine-libgdx/spine-libgdx/src/com/esotericsoftware/spine/`
- **C++ sources:** `spine-cpp/spine-cpp/src/spine/` and `spine-cpp/spine-cpp/include/spine/`

You are provided with tools to collaborate on the porting with the user, as well as a step by step workflow you execute together with the user.

## Tools

### File Viewer

The user might want to view changes for review, question asking, or advice giving. For this, use the file viewer - a web-based interface that shows Java and C++ files side-by-side with syntax highlighting, diff views, and real-time updates. You can load different files, toggle between content and diff views, and take screenshots to show the user your progress.

**Start the dev server first (from the folder where port.md is located):**

```bash
nohup npx tsx src/dev-server.ts /path/to/spine-runtimes > dev-server.log 2>&1 &
sleep 2
cat dev-server.log
```

**Then use puppeteer to navigate and control the viewer:**

```javascript
// Navigate to the viewer (find the port number in dev-server.log output)
mcp__puppeteer__puppeteer_navigate("http://localhost:PORT");

// Load files using the portingAPI
mcp__puppeteer__puppeteer_evaluate(`
  portingAPI.setJavaFile("spine-libgdx/spine-libgdx/src/com/esotericsoftware/spine/Animation.java");
  portingAPI.setTargetFiles(["spine-cpp/spine-cpp/include/spine/Animation.h", "spine-cpp/spine-cpp/src/spine/Animation.cpp"]);
`);

// Toggle diff views
mcp__puppeteer__puppeteer_evaluate("portingAPI.toggleJavaDiff()");
mcp__puppeteer__puppeteer_evaluate("portingAPI.toggleTargetDiff(0)"); // 0 = first target file, 1 = second, etc.
```

This allows the user to visually observe the changes you make during porting and provides a collaborative review interface. Can also be used if the user requests to view a specific file.

### Build Tool

**ONLY when explicitly requested by the user,** verify compilation using the CMake build system:

```bash
./build.sh  # Located in the same folder as this port.md file
```

**Important Notes:**

- **Build failures are often expected** due to circular dependencies between types
- A failed build after porting one type does NOT mean the porting was incorrect
- Multiple related types may need to be ported before the code compiles cleanly

## Step-by-Step Workflow

### 0. Load Porting Plan

If `porting-plan.json` doesn't exist in the current working directory, ask the user for the file's location. Load the porting plan and extract the spine runtimes directory from `metadata.spineRuntimesDir`.

### 1. Start Dev Server and Spin Up Puppeteer

Start the development server with the extracted spine runtimes directory and open the file viewer using puppeteer for collaborative viewing.

### 2. Find the Next Type to Port

Use jq to extract the next item to port from "porting-plan.json":

```bash
# Find the next pending type in priority order
jq -r '.portingOrder[] | select(.portingState == "pending") | . | @json' porting-plan.json | head -1 | jq .
```

This finds the first `PortingOrderItem` where `portingState` is "pending". The `portingOrder` array is sorted by priority:

1. **Zero dependencies first** - interfaces and enums with no dependencies
2. **New files (added)** - get slight priority boost for fresh implementation
3. **Interfaces and enums** - foundational types get priority boost
4. **Classes by dependency count** - fewer dependencies first

Open the Java file of the type and the candidate target files in the viewer using puppeteer.

### 3. Confirm with User

**STOP HERE** and ask the user if this is the type they want to work on. Show them the complete `PortingOrderItem` JSON.

### 4. Read the Java Source Code

Use the Read tool to examine the Java type at the specified file path and line range. **IMPORTANT:** Always use the exact `startLine` and `endLine` from the `PortingOrderItem` to read the complete type definition - use `offset=startLine` and `limit=(endLine-startLine+1)` to capture the entire type.

If the file is too large and the Read tool returns an error or truncated content, read it in chunks using multiple Read calls with different offset and limit parameters.

### 5. Check if Git Changes Affect This Type

Use git diff between `prevBranch` and `currentBranch` (from porting plan metadata) to see if changes actually touch this type's lines. If the git diff shows no changes for this type, you MUST ask the user what to do next.

### 6. Port to C++

In this step you are encouraged to collaborate with the user, ask them questions in case something is unclear.

- Read the complete existing C++ files (both header and source if they exist) to understand the current implementation. Use the Read tool and read in chunks if files are large.
- **CRITICAL: Always do a complete mechanical translation** - never just add documentation comments and call it "done". The Java source must be ported faithfully and exhaustively.
- **Compare EVERY aspect** of the Java class with the C++ version:
   - Class structure and inheritance (must match Java exactly)
   - All member variables (with proper C++ naming: `_underscore` prefix for private)
   - All constants (static final → static const)
   - All method signatures
   - All method implementations (translate Java logic to C++ following spine-cpp patterns and container classes like Vector instead of Java's Array.)
   - Documentation comments
- If there are missing dependencies, infer their methods and fields from the corresponding Java type(s) and perform a mechanical translation, translating from Java to likely C++ signatures using the spine-cpp conventions detailed below.
- **If C++ files don't exist:** Create them from scratch using spine-cpp conventions
- **If C++ files exist:**
   - Retain unaffected code in it
   - Compare line-by-line with Java implementation
   - Add any missing members, methods, or logic
   - Update any incorrect implementations
   - Ensure C++ version has 100% functional parity with Java
- **Never mark as "done" unless the C++ implementation is functionally complete and matches the Java type**
- **For new types or types whose name and thus .h files have changed:** Add the header include to `spine.h`

### 7. Update the Porting Plan

Update the `PortingOrderItem` in the porting plan with your results:

```bash
# Update porting status for a completed type
TYPE_NAME="Animation"  # Replace with the type you just ported
jq --arg name "$TYPE_NAME" --arg state "done" --arg notes "Successfully ported Animation class..." \
   '(.portingOrder[] | select(.simpleName == $name) | .portingState) |= $state |
    (.portingOrder[] | select(.simpleName == $name) | .portingNotes) |= $notes' \
   porting-plan.json > tmp.json && mv tmp.json porting-plan.json
```

Output the resulting JSON to the user.

### 8. STOP and Ask for Confirmation

- **MANDATORY:** After completing any type, you MUST STOP immediately
- Tell the user exactly what you accomplished
- Tell the user what you would work on next and why
- **WAIT for user confirmation** before proceeding to the next type
- This ensures proper pacing and prevents rushing through incomplete work

## Spine-C++ Conventions

### Mapping File Names

Each Java type typically maps to two C++ files: a header (.h) and source (.cpp) file.

- **Java:** `spine-libgdx/spine-libgdx/src/com/esotericsoftware/spine/TypeName.java`
- **C++ Header:** `spine-cpp/spine-cpp/include/spine/TypeName.h`
- **C++ Source:** `spine-cpp/spine-cpp/src/spine/TypeName.cpp`

Note: A single Java file may contain multiple types, so you cannot rely on file names alone for mapping.

### Type Translations

- **Java class** → C++ class inheriting SpineObject + RTTI (include `spine/RTTI.h`)
- **Java interface** → C++ abstract class with pure virtual methods + RTTI (include `spine/RTTI.h`)
- **Java enum** → C++ enum in namespace spine (header-only, no .cpp)

### Code Patterns

**Class Structure:**

- All classes inherit from `SpineObject` (provides custom memory management)
- Use `RTTI_DECL` in header and `RTTI_IMPL(ClassName, ParentClass)` in source
- Private fields have `_underscore` prefix
- Public methods use exact Java names (camelCase)

**Container Types:**

- Java `Array` → `spine::Vector<T>` (not `std::vector`)
- Java `String` → `spine::String` (not `std::string`)
- Use spine's custom containers for consistency and memory management

**Memory Management:**

- Allocate using `SpineExtension::calloc<T>()` or `new (__FILE__, __LINE__)`
- All allocations track file/line for debugging
- Objects inherit SpineObject's custom new/delete operators

**Header Example:**

```cpp
#include <spine/SpineObject.h>
#include <spine/RTTI.h>
#include <spine/Vector.h>

class SP_API ClassName : public ParentClass {
    RTTI_DECL
private:
    spine::Vector<SomeType*> _items;
    spine::String _name;
    float _value;
public:
    ClassName(float value);
    void someMethod();
};
```

**Source Example:**

```cpp
#include <spine/ClassName.h>
using namespace spine;

RTTI_IMPL(ClassName, ParentClass)

ClassName::ClassName(float value) : ParentClass(), _value(value) {
    // Constructor body
}
```
