LIST_WINDOWS_BINARY = list-windows
CAPTURE_WINDOW_BINARY = capture-window
BUILD_DIR = ../dist/native

.PHONY: all clean install test

all: $(BUILD_DIR)/$(LIST_WINDOWS_BINARY) $(BUILD_DIR)/$(CAPTURE_WINDOW_BINARY)

$(BUILD_DIR)/$(LIST_WINDOWS_BINARY): list-windows.swift
	@mkdir -p $(BUILD_DIR)
	swiftc -O -o $(BUILD_DIR)/$(LIST_WINDOWS_BINARY) list-windows.swift
	@echo "Built native utility: $(BUILD_DIR)/$(LIST_WINDOWS_BINARY)"

$(BUILD_DIR)/$(CAPTURE_WINDOW_BINARY): capture-window.swift
	@mkdir -p $(BUILD_DIR)
	swiftc -O -o $(BUILD_DIR)/$(CAPTURE_WINDOW_BINARY) capture-window.swift
	@echo "Built native utility: $(BUILD_DIR)/$(CAPTURE_WINDOW_BINARY)"

clean:
	rm -f $(BUILD_DIR)/$(LIST_WINDOWS_BINARY) $(BUILD_DIR)/$(CAPTURE_WINDOW_BINARY)

install: all
	cp $(BUILD_DIR)/$(LIST_WINDOWS_BINARY) /usr/local/bin/
	cp $(BUILD_DIR)/$(CAPTURE_WINDOW_BINARY) /usr/local/bin/
	@echo "Installed to /usr/local/bin/"

test: $(BUILD_DIR)/$(LIST_WINDOWS_BINARY)
	$(BUILD_DIR)/$(LIST_WINDOWS_BINARY)