import Foundation
import AVFoundation
import CoreImage
import AppKit

if CommandLine.arguments.count < 4 {
  fputs("Usage: extract-video-frame <input> <seconds> <output>\n", stderr)
  exit(1)
}

let input = URL(fileURLWithPath: CommandLine.arguments[1])
let seconds = Double(CommandLine.arguments[2]) ?? 0.5
let output = URL(fileURLWithPath: CommandLine.arguments[3])

let asset = AVAsset(url: input)
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.requestedTimeToleranceAfter = .zero
generator.requestedTimeToleranceBefore = .zero
let time = CMTime(seconds: seconds, preferredTimescale: 600)

do {
  let cgImage = try generator.copyCGImage(at: time, actualTime: nil)
  let rep = NSBitmapImageRep(cgImage: cgImage)
  if let data = rep.representation(using: .png, properties: [:]) {
    try data.write(to: output)
    print("wrote \(output.path)")
  } else {
    throw NSError(domain: "extract", code: 2)
  }
} catch {
  fputs("extract failed: \(error)\n", stderr)
  exit(2)
}
