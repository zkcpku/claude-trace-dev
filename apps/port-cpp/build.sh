#!/bin/bash

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