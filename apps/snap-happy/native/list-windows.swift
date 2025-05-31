#!/usr/bin/env swift

import Cocoa
import CoreGraphics
import Foundation

struct WindowInfo: Codable {
    let id: Int
    let cgWindowID: UInt32  // Actual Core Graphics window ID
    let title: String
    let app: String
    let position: Position
    let size: Size
    
    struct Position: Codable {
        let x: Int
        let y: Int
    }
    
    struct Size: Codable {
        let width: Int
        let height: Int
    }
}

func listWindows() -> [WindowInfo] {
    var windows: [WindowInfo] = []
    
    // Get all windows from all applications
    guard let windowList = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else {
        return windows
    }
    
    var windowIdCounter = 1
    
    for windowDict in windowList {
        // Extract window information
        guard let ownerName = windowDict[kCGWindowOwnerName as String] as? String,
              let windowName = windowDict[kCGWindowName as String] as? String,
              let boundsDict = windowDict[kCGWindowBounds as String] as? [String: CGFloat],
              let cgWindowID = windowDict[kCGWindowNumber as String] as? UInt32 else {
            continue
        }
        
        // Skip windows without names or from system processes
        if windowName.isEmpty || ownerName.isEmpty {
            continue
        }
        
        // Skip certain system windows
        if ownerName == "WindowServer" || ownerName == "Dock" || ownerName == "SystemUIServer" {
            continue
        }
        
        // Extract position and size from bounds
        guard let x = boundsDict["X"],
              let y = boundsDict["Y"],
              let width = boundsDict["Width"],
              let height = boundsDict["Height"] else {
            continue
        }
        
        // Skip windows that are too small (likely not user windows)
        if width < 50 || height < 50 {
            continue
        }
        
        let windowInfo = WindowInfo(
            id: windowIdCounter,
            cgWindowID: cgWindowID,
            title: windowName,
            app: ownerName,
            position: WindowInfo.Position(x: Int(x), y: Int(y)),
            size: WindowInfo.Size(width: Int(width), height: Int(height))
        )
        
        windows.append(windowInfo)
        windowIdCounter += 1
    }
    
    return windows
}

// Main execution
do {
    let windows = listWindows()
    let encoder = JSONEncoder()
    encoder.outputFormatting = .prettyPrinted
    let jsonData = try encoder.encode(windows)
    
    if let jsonString = String(data: jsonData, encoding: .utf8) {
        print(jsonString)
    }
} catch {
    print("Error: \(error)", to: &standardError)
    exit(1)
}

// Helper to write to stderr
var standardError = FileHandle.standardError

extension FileHandle: TextOutputStream {
    public func write(_ string: String) {
        let data = Data(string.utf8)
        self.write(data)
    }
}