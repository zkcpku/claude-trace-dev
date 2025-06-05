# Java-to-C++ Type Porting

## Overview

We are working on the Spine Runtime, a skeletal animation library for loading, manipulating and rendering Spine skeletons, porting Java code changes to C++. The Spine project maintains parallel implementations in multiple languages, and we need to keep the C++ version synchronized with Java updates.

**What we're doing:** Take a single Java type (class, interface, or enum) that potentially has changes between two git branches/commits/tags and port those changes to the corresponding C++ files.

**Build verification:** We use dependency-ordered porting, you CAN and SHOULD verify your work compiles using the CMake build system. This provides immediate feedback and catches errors early.

**The porting matrix:** All work is tracked in `porting_matrix.json` - a structured file containing metadata about git branches, lists of Java files with their types, and a dependency-ordered porting sequence. **First, read `/Users/badlogic/workspaces/lemmy/apps/port-cpp/src/types.ts` to understand the complete data structure** (`PortingMatrix`, `JavaFile`, `JavaType`, `PortingOrderItem` interfaces).

**Working Directory:** Read the `spineRuntimesDir` from `porting_matrix.json` metadata

- **Spine Java sources:** `spine-libgdx/spine-libgdx/src/com/esotericsoftware/spine/`
- **Spine C++ sources:** `spine-cpp/spine-cpp/src/spine/` and `spine-cpp/spine-cpp/include/spine/`

## Step-by-Step Workflow

### 1. Find the Next Type to Port

**NEW:** Use the dependency-ordered `portingOrder` array to find the next type to port:

```bash
# Find the next pending type in dependency order
jq -r '.portingOrder[] | select(.portingState == "pending") | . | @json' porting_matrix.json | head -1 | jq .
```

This finds the first `PortingOrderItem` where `portingState` is "pending". The `portingOrder` array is sorted by dependencies (leaf types first, complex types last).

### 2. Get Java Type Details and C++ Mapping

Once you have the `PortingOrderItem`, use these commands to get the complete information:

```bash
# Get the Java type details from the files array
TYPE_NAME="Animation"  # Replace with simpleName from PortingOrderItem
jq -r --arg name "$TYPE_NAME" '.files[].javaTypes[] | select(.name == $name)' porting_matrix.json

# Get the Java source file path for this type
jq -r --arg name "$TYPE_NAME" '.files[] | select(.javaTypes[].name == $name) | .filePath' porting_matrix.json
```

The porting matrix tracks all Java types that might have changed between two git branches. All porting state is tracked in the `portingOrder` array and needs to be updated as we work through porting.

### 3. Confirm with User

**STOP HERE** and ask the user if this is the type they want to work on. Show them the full JSON of both the `PortingOrderItem` and the `JavaType` object.

### 4. Extract Type Information

From the selected `JavaType` object, you'll have:

- `name` - Type name (e.g. "Animation", "Bone")
- `type` - "class", "interface", or "enum"
- `description` - What this type does
- `startLine`/`endLine` - Location in the Java file
- `cppHeader` - Path to C++ header file
- `cppSource` - Path to C++ source file (null/undefined for header-only types like enums)
- `filesExist` - Whether the C++ files already exist
- `action` - What to do: "create_new_files", "update_existing", "delete_files", "rename_and_update"

The parent `JavaFile` gives you `filePath` (the Java source file path). `cppHeader` and `cppSource` are best guesses and usually correct, but sometimes wrong. If you find that the mapping does not make sense you MUST STOP and confirm with the user.

### 3. Read the Java Source Code

Use the Read tool to examine the Java type at the specified file path and line range. **IMPORTANT:** Always use the exact `startLine` and `endLine` from the JavaType object to read the complete type definition - use `offset=startLine` and `limit=(endLine-startLine+1)` to capture the entire type.

### 4. Check if Git Changes Affect This Type

Use git diff between `prevBranch` and `currentBranch` to see if changes actually touch this type's lines.

### 5. Port to C++

- **First, read the complete existing C++ files** (both header and source if they exist) to understand the current implementation
- **CRITICAL: Check for missing dependencies FIRST**
   - If the Java class extends/implements types that don't exist in C++, **STOP IMMEDIATELY**
   - Tell the user: "Cannot port [ClassName] because it depends on [MissingType] which doesn't exist in C++ yet. We need to port [MissingType] first."
   - Do NOT attempt to port with placeholder inheritance - this creates incorrect implementations
- **Only proceed if all dependencies exist**
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

### 6. Verify Build Compilation

**MANDATORY:** After porting any type, verify it compiles correctly:

```bash
# Get spine runtimes directory from porting matrix
SPINE_DIR=$(jq -r '.metadata.spineRuntimesDir' porting_matrix.json)
SPINE_CPP_DIR="$SPINE_DIR/spine-cpp"
BUILD_DIR="$SPINE_CPP_DIR/build"

# For new files: Clean build to ensure CMake picks up new files
if [[ "$ACTION" == "create_new_files" ]]; then
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
    echo "❌ Build failed - fix compilation errors before marking as done"
    # You MUST fix compilation errors before proceeding
fi
```

**For new files specifically:**

- Always clean the build directory (`rm -rf build/`) to force CMake to regenerate
- CMake uses `file(GLOB ...)` which needs regeneration to pick up new source files
- Only mark as "done" if the build succeeds after adding new files

### 7. Update the Porting Matrix

Update the `PortingOrderItem` in the porting matrix with your results:

```bash
# Update porting status for a completed type
TYPE_NAME="Animation"  # Replace with the type you just ported
jq --arg name "$TYPE_NAME" --arg state "done" --arg notes "Successfully ported Animation class..." \
   '(.portingOrder[] | select(.simpleName == $name) | .portingState) |= $state |
    (.portingOrder[] | select(.simpleName == $name) | .portingNotes) |= $notes' \
   porting_matrix.json > tmp.json && mv tmp.json porting_matrix.json
```

Return a structured JSON report with your results.

### 8. STOP and Ask for Confirmation

- **MANDATORY:** After completing any type, you MUST STOP immediately
- Tell the user exactly what you accomplished
- Tell the user what you would work on next and why
- **WAIT for user confirmation** before proceeding to the next type
- This ensures proper dependency order and prevents rushing through incomplete work

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

## Success Criteria

✅ Java functionality fully implemented in C++
✅ Public API matches Java exactly
✅ Follows spine-cpp conventions
✅ Files compile without errors (verified with CMake build)
✅ No remaining work needed

## Build System Notes

The spine-cpp project uses CMake with Ninja generator. The CMakeLists.txt uses `file(GLOB ...)` to automatically discover source files, but this requires CMake regeneration when adding new files. The build process should be:

1. **For existing files:** Just build the spine-cpp target normally
2. **For new files:** Clean build directory to force CMake regeneration
3. **Always verify:** Use the build system to catch compilation errors early
4. **Target selection:** Only build `spine-cpp` target, not `spine-cpp-lite` (requires separate porting)

Since we follow dependency order, earlier types should already compile before we work on types that depend on them.
