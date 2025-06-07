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
clang++ -std=c++11 -c -I/path/to/spine-runtimes/spine-cpp/spine-cpp/include /path/to/ClassName.cpp -o /tmp/test.o && echo "OK" || echo "FAILED"

# For .h files
clang++ -std=c++11 -c -I/path/to/spine-runtimes/spine-cpp/spine-cpp/include /path/to/ClassName.h -o /tmp/test.o && echo "OK" || echo "FAILED"
```

**Note:** Compilation failures due to missing dependencies are expected during porting.

## Step-by-Step Workflow

### 0. Load Metadata

Load metadata into context for later reference:

```bash
jq '.metadata' porting-plan.json
```

**Output:** spineRuntimesDir (for absolute paths), prevBranch/currentBranch (for diffs). If file missing, ask user for location.

### 1. Start File Viewer

Start dev server and open file viewer with puppeteer (see Tools section for commands).

### 2. Find Next Type

Get the next pending type from porting plan:

```bash
jq -r '.portingOrder[] | select(.portingState == "pending") | . | @json' porting-plan.json | head -1 | jq .
```

Open Java file in right panel, C++ files in left panel using file viewer.

### 3. Confirm with User

1. Play a ping sound: `afplay /System/Library/Sounds/Ping.aiff`
2. STOP HERE: Show the complete `PortingOrderItem` JSON and ask if this is the type to work on.
3. ONLY AFTER CONFIRMATION, proceed to step 4.

### 4. Open and Read Source Files

Batch operations: Open Java file in right panel + C++ files in left panel (if they exist) with single puppeteer call. Read complete contents of Java source + existing C++ files into context simultaneously with multiple Read tool calls.

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

Use Quick Compile Test commands from Tools section to catch basic errors. Missing dependency failures are expected.

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

### Mapping File Names

Each Java type typically maps to two C++ files: a header (.h) and source (.cpp) file.

- **Java:** `spine-libgdx/spine-libgdx/src/com/esotericsoftware/spine/TypeName.java`
- **C++ Header:** `spine-cpp/spine-cpp/include/spine/TypeName.h`
- **C++ Source:** `spine-cpp/spine-cpp/src/spine/TypeName.cpp`

Note: A single Java file may contain multiple types, so you cannot rely on file names alone for mapping.

### Type Translations

- **Java class** → C++ class inheriting from appropriate base class + RTTI (include `spine/RTTI.h`)
- **Java interface** → C++ pure abstract class, no inheritance, no RTTI (include `spine/dll.h` for SP_API)
- **Java enum** → C++ enum in namespace spine (header-only, no .cpp)

### Code Patterns

**Class Structure:**

- **Concrete classes**: Inherit from appropriate base class (e.g., `Timeline`, `SpineObject`)
- **Multiple inheritance**: Classes can inherit from interface + base class: `class BonePose : public BoneLocal, public Update`
- **Interface classes**: Pure abstract classes, no inheritance, no RTTI
- **Template interfaces**: Use `class SlotPose : public Pose<SlotPose>` pattern
- Use `RTTI_DECL` in header and `RTTI_IMPL(ClassName, ParentClass)` or `RTTI_IMPL_NOPARENT(ClassName)` in source
- Private fields have `_underscore` prefix
- Public methods use exact Java names (camelCase)

**RTTI Inheritance Hierarchy:**

- `Timeline` is the root RTTI class for timelines (uses `RTTI_IMPL_NOPARENT`)
- Timeline subclasses inherit from `Timeline` and use `RTTI_IMPL(ClassName, Timeline)`
- `SpineObject` is for memory management only, does NOT have RTTI
- Interface classes do NOT inherit from anything and do NOT use RTTI

**Container Types:**

- Java `Array` → `spine::Vector<T>` (not `std::vector`)
- Java `String` → `spine::String` (not `std::string`)
- Use spine's custom containers for consistency and memory management
- Vector operations: `_deform.clear()`, `_deform.addAll(other._deform)`, cache `size()` in loops

**Constructor Patterns:**

- Initialize all fields in declaration order: `BonePose() : BoneLocal(), _bone(nullptr), _a(0), _b(0) {}`
- Color initialization: `_color(1, 1, 1, 1)`, `_darkColor(0, 0, 0, 0)`
- Use reference parameters for output: `void worldToLocal(float worldX, float worldY, float& outLocalX, float& outLocalY)`

**Nullable Reference Pattern:**

- Java nullable references → C++ object field + boolean flag
- Example: Java `Color darkColor` (can be null) → C++ `Color _darkColor; bool _hasDarkColor;`
- Always instantiate the object field, use boolean to track null state
- Provide `hasDarkColor()` getter and `getDarkColor()` that returns reference to always-valid object

**Memory Management:**

- Allocate using `SpineExtension::calloc<T>()` or `new (__FILE__, __LINE__)`
- All allocations track file/line for debugging
- Objects inherit SpineObject's custom new/delete operators

**Code Organization:**

- Prefer forward declarations of classes in header files
- All code is in the `spine` namespace
- Source files use `using namespace spine;`
- Follow existing patterns in the file you're editing

**Documentation:**

- Use Doxygen-compatible triple-slash comments (`///`) for documentation
- Convert Java `/** */` comments to C++ `///` style
- Document only what's documented in the Java source (maintain parity)

**Javadoc to Doxygen Translation Guide:**

- `/** comment */` → `/// comment`
- `@param name description` → `@param name description` (same)
- `@return description` → `@return description` (same)
- `@throws Exception description` → `@throws Exception description` (same)
- `{@link Class}` → `Class` (remove link markup)
- `{@link Class#method}` → `Class::method`
- `{@link #method}` → `method()` (same class method)
- `Class#method(args)` → `Class::method()`
- `Skeleton#getBones()` → `Skeleton::getBones()`
- `{@code example}` → `example` (remove code markup)
- HTML tags (`<p>`, `<code>`, etc.) → Remove or convert to Doxygen equivalents

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

**Enum Example:**

```cpp
namespace spine {
    enum MixBlend {
        MixBlend_Setup,
        MixBlend_First,
        MixBlend_Replace,
        MixBlend_Add
    };
}
```

**Interface → Pure Abstract Class Example:**

```cpp
// Header: BoneTimeline.h
#include <spine/dll.h>

namespace spine {
    /// An interface for timelines which change the property of a bone.
    class SP_API BoneTimeline {
    public:
        BoneTimeline();
        virtual ~BoneTimeline();

        /// The index of the bone in Skeleton::getBones() that will be changed when this timeline is applied.
        virtual int getBoneIndex() = 0;
    };
}
```

```cpp
// Source: BoneTimeline.cpp
#include <spine/BoneTimeline.h>

using namespace spine;

BoneTimeline::BoneTimeline() {
}

BoneTimeline::~BoneTimeline() {
}
```

**Concrete Class Implementing Interface:**

```cpp
// Concrete timeline class inherits from Timeline AND implements interface
class SP_API RotateTimeline : public Timeline, public BoneTimeline {
    RTTI_DECL
public:
    RotateTimeline(int frameCount, int bezierCount, int boneIndex);
    virtual int getBoneIndex() override;
    // Timeline methods...
};
```

**Generic Interface → Template Class Example:**

```cpp
// Header: Pose.h (Java: interface Pose<P>)
#include <spine/SpineObject.h>

namespace spine {
    template<class P>
    class SP_API Pose : public SpineObject {
        // NO RTTI_DECL - template classes don't need RTTI
    public:
        Pose();
        virtual ~Pose();
        virtual void set(P& pose) = 0;
    };

    template<class P>
    Pose<P>::Pose() {
    }

    template<class P>
    Pose<P>::~Pose() {
    }
}
```

**Template Interface + Concrete Implementation:**

```cpp
// Concrete class implementing template interface
class SP_API IkConstraintPose : public Pose<IkConstraint> {
    RTTI_DECL  // Concrete classes DO get RTTI
public:
    IkConstraintPose();
    virtual ~IkConstraintPose();
    virtual void set(IkConstraint& pose) override;
};
```

```cpp
// Source: IkConstraintPose.cpp
#include <spine/IkConstraintPose.h>
using namespace spine;

RTTI_IMPL(IkConstraintPose, SpineObject)  // RTTI for concrete class

// Implementation...
```

**Template + RTTI Rules:**

- **Java generic interface** → C++ template class (header-only, no RTTI, no .cpp file)
- **Java class implementing generic interface** → C++ class inheriting from template (with RTTI + .cpp file)
- **Template classes are compile-time constructs** - they don't need runtime type information
- **Concrete implementations get RTTI** - for runtime polymorphism and type checking
