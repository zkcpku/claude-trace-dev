#!/bin/bash

# Spine C++ Runtime - Compile All Modified Files
# This script compiles all modified C++ files from the spine-cpp runtime
# with the specific cmake flags used for the project

# Note: We don't use 'set -e' so compilation continues through all files even if some fail

# Configuration
SPINE_ROOT="/Users/badlogic/workspaces/spine-runtimes/spine-cpp/spine-cpp"
INCLUDE_DIR="$SPINE_ROOT/include"
SRC_DIR="$SPINE_ROOT/src/spine"
OUTPUT_DIR="/tmp/spine_objects"
CMAKE_FLAGS="-Wall -Wextra -Wnon-virtual-dtor -pedantic -Wno-unused-parameter -std=c++11 -fno-exceptions -fno-rtti"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo -e "${BLUE}=== SPINE C++ RUNTIME - COMPILATION REPORT ===${NC}"
echo -e "${BLUE}Spine Root: $SPINE_ROOT${NC}"
echo -e "${BLUE}Include Dir: $INCLUDE_DIR${NC}"
echo -e "${BLUE}Source Dir: $SRC_DIR${NC}"
echo -e "${BLUE}Output Dir: $OUTPUT_DIR${NC}"
echo ""

# List of all modified C++ source files
files=(
    # Constraint System
    "Constraint.cpp"
    "IkConstraint.cpp"
    "PathConstraint.cpp"
    "PhysicsConstraint.cpp"
    "TransformConstraint.cpp"
    "Slider.cpp"
    
    # Constraint Poses
    "IkConstraintPose.cpp"
    "PathConstraintPose.cpp"
    "PhysicsConstraintPose.cpp"
    "TransformConstraintPose.cpp"
    "SliderPose.cpp"
    
    # Timeline System
    "AttachmentTimeline.cpp"
    "ColorTimeline.cpp"
    "CurveTimeline.cpp"
    "DeformTimeline.cpp"
    "SequenceTimeline.cpp"
    "SlotCurveTimeline.cpp"
    "SlotTimeline.cpp"
    
    # Pose System
    "BoneData.cpp"
    "BoneLocal.cpp"
    "BonePose.cpp"
    "SlotData.cpp"
    "SlotPose.cpp"
    
    # Attachment System
    "AtlasAttachmentLoader.cpp"
    "AttachmentLoader.cpp"
    "Sequence.cpp"
)

# Counters
total_files=0
successful_files=0
failed_files=0
warning_files=0

echo -e "${YELLOW}Compiling ${#files[@]} modified files...${NC}"
echo ""

# Compile each file
for file in "${files[@]}"; do
    total_files=$((total_files + 1))
    source_file="$SRC_DIR/$file"
    object_file="$OUTPUT_DIR/${file%.cpp}.o"
    
    echo -n "[$total_files/${#files[@]}] Compiling $file... "
    
    # Check if source file exists
    if [ ! -f "$source_file" ]; then
        echo -e "${RED}❌ Source file not found${NC}"
        failed_files=$((failed_files + 1))
        continue
    fi
    
    # Compile the file and capture output
    compile_output=$(g++ -c "$source_file" \
        -I"$INCLUDE_DIR" \
        $CMAKE_FLAGS \
        -o "$object_file" 2>&1)
    
    compile_result=$?
    
    if [ $compile_result -eq 0 ]; then
        if [ -n "$compile_output" ]; then
            # Compiled successfully but with warnings
            echo -e "${YELLOW}⚠️ Warnings${NC}"
            warning_files=$((warning_files + 1))
            successful_files=$((successful_files + 1))
            
            # Always show warnings
            echo -e "${YELLOW}$compile_output${NC}"
            echo ""
        else
            # Clean compilation
            echo -e "${GREEN}✅ Success${NC}"
            successful_files=$((successful_files + 1))
        fi
    else
        # Compilation failed
        echo -e "${RED}❌ Failed${NC}"
        failed_files=$((failed_files + 1))
        
        # Show errors
        echo -e "${RED}$compile_output${NC}"
        echo ""
    fi
done

echo ""
echo -e "${BLUE}=== COMPILATION SUMMARY ===${NC}"
echo -e "Total files:      $total_files"
echo -e "${GREEN}Successful:       $successful_files${NC}"
echo -e "${YELLOW}With warnings:    $warning_files${NC}"
echo -e "${RED}Failed:           $failed_files${NC}"
echo ""

# Calculate success rate
success_rate=$(( (successful_files * 100) / total_files ))
echo -e "${BLUE}Success rate:     ${success_rate}%${NC}"

# Show object files created
echo ""
echo -e "${BLUE}Object files created in: $OUTPUT_DIR${NC}"
if [ $successful_files -gt 0 ]; then
    ls -la "$OUTPUT_DIR"/*.o 2>/dev/null | wc -l | xargs echo "Total object files:"
fi

echo ""
if [ $failed_files -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL FILES COMPILED SUCCESSFULLY!${NC}"
    exit 0
else
    echo -e "${RED}⚠️  $failed_files files failed to compile${NC}"
    echo -e "${YELLOW}Note: Failed files are likely due to missing Skeleton API methods${NC}"
    echo -e "${YELLOW}that are part of the broader skeleton porting effort.${NC}"
    exit 1
fi