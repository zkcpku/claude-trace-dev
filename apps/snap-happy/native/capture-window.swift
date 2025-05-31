#!/usr/bin/env swift

import Cocoa
import CoreGraphics
import Foundation

func captureWindow(cgWindowID: UInt32, outputPath: String) -> Bool {
    // Create the window image using Core Graphics
    guard let windowImage = CGWindowListCreateImage(
        CGRect.null,  // null rect means capture the entire window
        .optionIncludingWindow,
        cgWindowID,
        [.bestResolution, .boundsIgnoreFraming]
    ) else {
        print("Error: Failed to create window image", to: &standardError)
        return false
    }
    
    // Create URL for output file
    guard let url = URL(string: "file://" + outputPath) else {
        print("Error: Invalid output path", to: &standardError)
        return false
    }
    
    // Create image destination
    guard let destination = CGImageDestinationCreateWithURL(url as CFURL, kUTTypePNG, 1, nil) else {
        print("Error: Failed to create image destination", to: &standardError)
        return false
    }
    
    // Add image to destination and finalize
    CGImageDestinationAddImage(destination, windowImage, nil)
    
    if CGImageDestinationFinalize(destination) {
        return true
    } else {
        print("Error: Failed to write image file", to: &standardError)
        return false
    }
}

// Parse command line arguments
guard CommandLine.arguments.count == 3 else {
    print("Usage: capture-window <cgWindowID> <outputPath>", to: &standardError)
    exit(1)
}

guard let cgWindowID = UInt32(CommandLine.arguments[1]) else {
    print("Error: Invalid window ID", to: &standardError)
    exit(1)
}

let outputPath = CommandLine.arguments[2]

if captureWindow(cgWindowID: cgWindowID, outputPath: outputPath) {
    print("Success: Window captured to \(outputPath)")
    exit(0)
} else {
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