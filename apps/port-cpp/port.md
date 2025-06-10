# Java-to-C++ Type Porting

## Overview

Collaborative porting of Spine Runtime skeletal animation library from Java to C++. Work tracked in `porting-plan.json` (types in src/types.ts relative to this port.md file).

**Paths (relative to spine-runtimes):**

- Java: `spine-libgdx/spine-libgdx/src/com/esotericsoftware/spine/`
- C++: `spine-cpp/spine-cpp/{src,include}/spine/`

## Tools

### File Viewer

Web interface with two tabbed panels for collaborative porting review - Java source in right panel, C++ targets in left panel.

**Start server:**

```bash
pkill -f "npx tsx src/dev-server.ts" || true; nohup npx tsx src/dev-server.ts > dev-server.log 2>&1 & sleep 2; cat dev-server.log
```

**Open in Browser (use port from dev-server.log):**

```javascript
mcp__puppeteer__puppeteer_navigate("http://localhost:PORT", {
	launchOptions: { headless: false, args: ["--start-maximized"], defaultViewport: null },
});
```

**Examples (chain multiple API calls to reduce round trips):**

```javascript
// Open multiple files at once
mcp__puppeteer__puppeteer_evaluate(`
  fileViewer.open("/abs/path/Animation.java", 1, "4.2", "4.3-beta"); // Java in right panel (diff basis: 4.2 vs 4.3-beta)
  fileViewer.open("/abs/path/Animation.h", 0);                       // C++ header in left panel
  fileViewer.open("/abs/path/Animation.cpp", 0);                     // C++ source in left panel
`);

// Highlight and manipulate files
mcp__puppeteer__puppeteer_evaluate(`
  fileViewer.highlight("/abs/path/Animation.java", 100);     // single line
  fileViewer.highlight("/abs/path/Animation.java", 100, 120); // range
  fileViewer.highlight("/abs/path/Animation.java");          // clear
  fileViewer.close("/abs/path/Animation.java");              // close specific file
  fileViewer.closeAll();                                     // close all files
`);
```

**Usage:** Java files in panel 1 (right), all other file types in panel 0 (left). All paths must be absolute.
**Diff basis:** Files can toggle between content and diff view. Branch parameters set diff comparison - both branches = diff between them, one branch = current vs that branch, none = current vs HEAD

### Quick Compile Test

Test single file compilation to catch basic errors:

```bash
# For .cpp files (replace paths with actual spine-runtimes paths)
clang++ -std=c++11 -Wno-inconsistent-missing-override -c -I/path/to/spine-runtimes/spine-cpp/spine-cpp/include /path/to/ClassName.cpp -o /tmp/test.o && echo "OK" || echo "FAILED"

# For .h files
clang++ -std=c++11 -Wno-inconsistent-missing-override -c -I/path/to/spine-runtimes/spine-cpp/spine-cpp/include /path/to/ClassName.h -o /tmp/test.o && echo "OK" || echo "FAILED"
```

**Note:** Compilation failures due to missing dependencies are expected during porting. The `-Wno-inconsistent-missing-override` flag disables warnings about RTTI declarations missing `override` keywords, which is a codebase-wide pattern.

## Step-by-Step Workflow

### 0. Load Metadata

Load metadata into context for later reference:

```bash
jq '.metadata' porting-plan.json
```

**Output:** spineRuntimesDir (for absolute paths), prevBranch/currentBranch (for diffs). If file missing, ask user for location.

### 1. Start File Viewer

Start dev server and open file viewer with puppeteer (see Tools section for commands).

### 2. Find Next Type and Open Files

1. Get the next pending type from porting plan:

```bash
jq -r '.portingOrder[] | select(.portingState == "pending") | . | @json' porting-plan.json | head -1 | jq .
```

2. **Batch operation:** Open Java file in right panel + C++ files in left panel (if they exist) with single puppeteer call.

### 3. Confirm with User

1. Play a ping sound: `afplay /System/Library/Sounds/Ping.aiff`
2. STOP HERE: Show the complete `PortingOrderItem` JSON and ask if this is the type to work on.
3. ONLY AFTER CONFIRMATION, proceed to step 4.

### 4. Read Source Files

Read complete contents of Java source + existing C++ files into context simultaneously with multiple Read tool calls.

### 5. Port to C++

**CRITICAL:** Complete mechanical translation required following spine-cpp conventions (see below) - never just add comments and call it "done".

**Process:**

1. **Read inheritance hierarchy:** Batch read all Java parent types (extends/implements) and their C++ equivalents (if they exist) to understand complete inheritance context. Skip SpineObject as it's just memory management. Note: C++ parent types may be outdated since they come later in porting order, but still provide structural insights.
2. **If C++ files don't exist:** Create both .h/.cpp files using spine-cpp conventions, open in left panel
3. **If C++ files exist:** RETAIN all unaffected code - only modify what needs updating
4. **Compare line-by-line:** Java vs C++ for class structure, members, methods, inheritance, documentation
5. **Update systematically:** Add missing pieces, fix incorrect implementations, ensure 100% functional parity
6. **Use MultiEdit** for multiple changes per file, **open new files** in left panel immediately

**Never mark "done" unless C++ matches Java completely.** Add header includes to `spine.h` for new types.

### 6. Test Compilation (Optional)

Use Quick Compile Test commands from Tools section to catch basic errors. Missing dependency failures are expected. Always use the `-Wno-inconsistent-missing-override` flag to suppress RTTI override warnings.

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

1. Play a ping sound: `afplay /System/Library/Sounds/Ping.aiff`
2. STOP HERE: After completing any type, you MUST STOP immediately, and ask and wait for the user to confirm moving on to the next type.
3. ONLY AFTER CONFIRMATION, close all open files in the file viewer, and continue

## Spine-C++ Conventions

**File Mapping:** Java `TypeName.java` → C++ `TypeName.h` + `TypeName.cpp` (single Java file may contain multiple types)

**Type Translations:**

- Java class → C++ class + RTTI (`spine/RTTI.h`)
- Java interface → C++ pure abstract class, no RTTI (`spine/dll.h`) + .cpp file with empty constructor/destructor
- Java generic interface → C++ template class + SpineObject inheritance, no RTTI (`spine/SpineObject.h`) + header-only implementation
- Java enum → C++ enum in spine namespace (header-only)

**Class Structure:**

- Concrete classes: Inherit from base + RTTI (`RTTI_DECL` in header, `RTTI_IMPL(Class, Parent)` or `RTTI_IMPL_NOPARENT(Class)` in source)
- Multiple inheritance: `class BonePose : public BoneLocal, public Update`
- Template interfaces: `class SlotPose : public Pose<SlotPose>`
- Interface classes: Pure abstract, no inheritance, no RTTI, separate .cpp file
- Generic interface classes: Template, inherit from SpineObject, no RTTI, header-only
- Private fields: `_underscore` prefix, public methods: exact Java names

**RTTI Hierarchy:** Timeline (root, `RTTI_IMPL_NOPARENT`) → subclasses (`RTTI_IMPL(Class, Timeline)`). SpineObject = memory only, no RTTI. Interfaces = no RTTI.

**Containers:** Java Array → `spine::Vector<T>`, String → `spine::String`. Operations: `clear()`, `addAll()`, cache `size()` in loops.

**Constructors:** Initialize in declaration order: `Class() : Parent(), _field(value) {}`. Colors: `_color(1,1,1,1)`, `_darkColor(0,0,0,0)`. Output params: `void method(float& outX, float& outY)`. **DO NOT port copy constructors from Java.**

**Nullable References:** Java null → C++ object + boolean. `Color darkColor` → `Color _darkColor; bool _hasDarkColor;` + `hasDarkColor()` getter.

**Memory:** Use `SpineExtension::calloc<T>()` or `new (__FILE__, __LINE__)` for tracking. SpineObject provides custom operators.

**Ownership:** Follow Java ownership patterns. Template classes like `PosedData<T>` that take pointers in constructors own those objects and must delete them in destructors. When Java creates objects with `new` in constructors (e.g., `super(name, new BoneLocal())`), C++ should match this with `new (__FILE__, __LINE__) Type()` and ensure proper cleanup.

**Math Functions:** NEVER use `<cmath>` or `std::` math functions. Always use `spine/MathUtil.h` functions: `MathUtil::sqrt()`, `MathUtil::sin()`, `MathUtil::cos()`, `MathUtil::atan2()`, etc.

**Organization:** Forward declarations, `spine` namespace, `using namespace spine;` in sources, follow existing patterns.

**Documentation:** Java `/** */` → C++ `///`. Maintain parity. Javadoc translations: `{@link Class}` → `Class`, `{@link Class#method}` → `Class::method`, `{@code example}` → `example`, remove HTML tags.

**Examples:**

```cpp
// Header: includes, SP_API, RTTI_DECL, _underscore fields
class SP_API ClassName : public ParentClass {
    RTTI_DECL
private: spine::Vector<Type*> _items; float _value;
public: ClassName(float value); void method();
};

// Source: using namespace, RTTI_IMPL, constructor chain
#include <spine/ClassName.h>
using namespace spine;
RTTI_IMPL(ClassName, ParentClass)
ClassName::ClassName(float value) : ParentClass(), _value(value) {}

// Enum: namespace spine, PrefixName pattern
namespace spine {
    enum MixBlend { MixBlend_Setup, MixBlend_First };
}
```

**Advanced Patterns:**

```cpp
// Non-generic interface: dll.h, SP_API, no RTTI, pure virtual methods, separate .cpp file
class SP_API BoneTimeline {
public: BoneTimeline(); virtual ~BoneTimeline(); virtual int getBoneIndex() = 0; };

// Multiple inheritance: Timeline + interface
class SP_API RotateTimeline : public Timeline, public BoneTimeline {
    RTTI_DECL
public: virtual int getBoneIndex() override;
};

// Generic interface: template, SpineObject inheritance, no RTTI, header-only implementation
template<class P> class SP_API Pose : public SpineObject {
public: Pose(); virtual ~Pose(); virtual void set(P& pose) = 0; };

// Generic interface implementation: inherits from template, gets RTTI + .cpp file
class SP_API IkConstraintPose : public Pose<IkConstraint> {
    RTTI_DECL
public: virtual void set(IkConstraint& pose) override;
};
```

**Interface Rules:** Java interface → C++ pure abstract class (separate .cpp file). Java generic interface → C++ template + SpineObject inheritance (header-only). Java implementing class → C++ with RTTI + .cpp file.
