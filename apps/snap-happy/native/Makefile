LIST_WINDOWS_BINARY = list-windows
CAPTURE_WINDOW_BINARY = capture-window
BUILD_DIR = ../dist/native

# Minimum deployment targets
MACOS_X64_TARGET = x86_64-apple-macos10.15
MACOS_ARM64_TARGET = arm64-apple-macos11.0

.PHONY: all clean install test universal dev

# Development build (current architecture only)
dev: $(BUILD_DIR)/$(LIST_WINDOWS_BINARY) $(BUILD_DIR)/$(CAPTURE_WINDOW_BINARY)

# Universal binaries for distribution
all: universal

universal: $(BUILD_DIR)/$(LIST_WINDOWS_BINARY) $(BUILD_DIR)/$(CAPTURE_WINDOW_BINARY)

$(BUILD_DIR)/$(LIST_WINDOWS_BINARY): list-windows.swift
	@mkdir -p $(BUILD_DIR)
	@echo "Building universal binary: $(LIST_WINDOWS_BINARY)"
	@# Build for x86_64
	swiftc -target $(MACOS_X64_TARGET) -O -o $(BUILD_DIR)/$(LIST_WINDOWS_BINARY)-x64 list-windows.swift
	@# Build for arm64
	swiftc -target $(MACOS_ARM64_TARGET) -O -o $(BUILD_DIR)/$(LIST_WINDOWS_BINARY)-arm64 list-windows.swift
	@# Create universal binary
	lipo -create $(BUILD_DIR)/$(LIST_WINDOWS_BINARY)-x64 $(BUILD_DIR)/$(LIST_WINDOWS_BINARY)-arm64 -output $(BUILD_DIR)/$(LIST_WINDOWS_BINARY)
	@# Clean up intermediate files
	rm -f $(BUILD_DIR)/$(LIST_WINDOWS_BINARY)-x64 $(BUILD_DIR)/$(LIST_WINDOWS_BINARY)-arm64
	@echo "Built universal binary: $(BUILD_DIR)/$(LIST_WINDOWS_BINARY)"

$(BUILD_DIR)/$(CAPTURE_WINDOW_BINARY): capture-window.swift
	@mkdir -p $(BUILD_DIR)
	@echo "Building universal binary: $(CAPTURE_WINDOW_BINARY)"
	@# Build for x86_64
	swiftc -target $(MACOS_X64_TARGET) -O -o $(BUILD_DIR)/$(CAPTURE_WINDOW_BINARY)-x64 capture-window.swift
	@# Build for arm64
	swiftc -target $(MACOS_ARM64_TARGET) -O -o $(BUILD_DIR)/$(CAPTURE_WINDOW_BINARY)-arm64 capture-window.swift
	@# Create universal binary
	lipo -create $(BUILD_DIR)/$(CAPTURE_WINDOW_BINARY)-x64 $(BUILD_DIR)/$(CAPTURE_WINDOW_BINARY)-arm64 -output $(BUILD_DIR)/$(CAPTURE_WINDOW_BINARY)
	@# Clean up intermediate files
	rm -f $(BUILD_DIR)/$(CAPTURE_WINDOW_BINARY)-x64 $(BUILD_DIR)/$(CAPTURE_WINDOW_BINARY)-arm64
	@echo "Built universal binary: $(BUILD_DIR)/$(CAPTURE_WINDOW_BINARY)"

clean:
	rm -f $(BUILD_DIR)/$(LIST_WINDOWS_BINARY)* $(BUILD_DIR)/$(CAPTURE_WINDOW_BINARY)*

install: all
	cp $(BUILD_DIR)/$(LIST_WINDOWS_BINARY) /usr/local/bin/
	cp $(BUILD_DIR)/$(CAPTURE_WINDOW_BINARY) /usr/local/bin/
	@echo "Installed to /usr/local/bin/"

test: $(BUILD_DIR)/$(LIST_WINDOWS_BINARY)
	$(BUILD_DIR)/$(LIST_WINDOWS_BINARY)
	@echo "Testing architecture compatibility:"
	file $(BUILD_DIR)/$(LIST_WINDOWS_BINARY)
	file $(BUILD_DIR)/$(CAPTURE_WINDOW_BINARY)