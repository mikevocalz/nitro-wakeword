import AVFoundation
import Foundation

func syntheticPCM(sampleRate: Double, channels: AVAudioChannelCount, frames: Int) throws -> AVAudioPCMBuffer {
  guard let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: sampleRate, channels: channels, interleaved: false),
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)),
        let samples = buffer.floatChannelData else { throw WakeWordError("Cannot allocate PCM fixture") }
  buffer.frameLength = AVAudioFrameCount(frames)
  for channel in 0..<Int(channels) {
    for index in 0..<frames {
      samples[channel][index] = Float(sin(Double(index) * 2 * .pi * 400 / sampleRate)) * 0.25
    }
  }
  return buffer
}

func runAudioConversionChecks() throws {
  try test("AVAudioConverter resamples 48 kHz stereo into bounded 16 kHz mono chunks") {
    let input = try syntheticPCM(sampleRate: 48000, channels: 2, frames: 48000)
    let stream = try AudioChunkStream(chunkSize: 1280)
    var chunks: [[Float]] = []
    try stream.process(input) { chunks.append($0) }
    let firstCount = chunks.count
    for _ in 1...4 {
      try stream.process(input) { chunks.append($0) }
    }
    try expect(firstCount == 12, "Unexpected one-second converted frame count: \(firstCount)")
    try expect(chunks.count == 62, "Repeated conversion drifted: \(chunks.count) chunks")
    try expect(chunks.allSatisfy { $0.count == 1280 && $0.allSatisfy(\.isFinite) }, "Invalid converted chunks")
    let peak = chunks.flatMap { $0 }.map { abs($0) }.max() ?? 0
    try expect(peak > 1000 && peak < 16000, "Resampling lost or amplified the synthetic tone")
  }

  try test("AVAudioConverter frames partial same-rate input without dropping samples") {
    let stream = try AudioChunkStream(chunkSize: 1280)
    var samples: [Float] = []
    for part in 0..<8 {
      let input = try syntheticPCM(sampleRate: 16000, channels: 1, frames: 320)
      guard let channel = input.floatChannelData?[0] else { throw WakeWordError("Missing fixture channel") }
      for index in 0..<320 { channel[index] = Float(part * 320 + index) / 8192 }
      try stream.process(input) { samples.append(contentsOf: $0) }
    }
    let expected = (0..<2560).map { Float($0 * 4) }
    try expect(samples.count == expected.count, "Same-rate partial buffers drifted: \(samples.count)")
    try expect(zip(samples, expected).allSatisfy { abs($0 - $1) < 0.001 }, "Samples were dropped, replayed, reordered or rescaled")
  }

  try test("resampling preserves output across irregular input boundaries") {
    let input = try syntheticPCM(sampleRate: 48000, channels: 2, frames: 96000)
    let whole = try AudioChunkStream(chunkSize: 1280)
    let split = try AudioChunkStream(chunkSize: 1280)
    var expected: [Float] = []
    var actual: [Float] = []
    try whole.process(input) { expected.append(contentsOf: $0) }
    let sizes = [73, 4096, 127, 3000, 512]
    var offset: AVAudioFrameCount = 0
    var part = 0
    while offset < input.frameLength {
      let count = min(AVAudioFrameCount(sizes[part % sizes.count]), input.frameLength - offset)
      guard let chunk = input.ownedCopy(fromFrame: offset, frameCount: count) else {
        throw WakeWordError("Cannot slice streaming fixture")
      }
      try split.process(chunk) { actual.append(contentsOf: $0) }
      offset += count
      part += 1
    }
    try expect(actual.count == expected.count, "Input boundaries changed output count: \(actual.count) vs \(expected.count)")
    try expect(zip(actual, expected).allSatisfy { abs($0 - $1) < 0.01 }, "Input boundaries dropped, duplicated or reordered samples")
  }

  try test("PCM input slices preserve channel offsets and ownership") {
    let input = try syntheticPCM(sampleRate: 48000, channels: 2, frames: 100)
    guard let original = input.floatChannelData else { throw WakeWordError("Missing fixture channels") }
    for index in 0..<100 {
      original[0][index] = Float(index)
      original[1][index] = Float(index + 100)
    }
    guard let slice = input.ownedCopy(fromFrame: 17, frameCount: 41),
          let copied = slice.floatChannelData else { throw WakeWordError("Slice failed") }
    try expect(slice.frameLength == 41, "Slice returned wrong frame count")
    try expect((0..<41).allSatisfy { copied[0][$0] == Float($0 + 17) && copied[1][$0] == Float($0 + 117) }, "Channel slice changed samples")
    original[0][17] = -1
    try expect(copied[0][0] == 17, "Slice aliases input")
    try expect(input.ownedCopy(fromFrame: 99, frameCount: 2) == nil, "Out-of-range slice accepted")
    try expect(input.ownedCopy(fromFrame: 101, frameCount: 1) == nil, "Offset beyond buffer accepted")
  }

  try test("AVAudioPCMBuffer handoff copies borrowed samples") {
    let input = try syntheticPCM(sampleRate: 16000, channels: 2, frames: 1280)
    guard let copy = input.ownedCopy(), let original = input.floatChannelData,
          let copied = copy.floatChannelData else { throw WakeWordError("Copy failed") }
    let first = copied[0][10]
    let second = copied[1][10]
    original[0][10] = 0.9
    original[1][10] = 0.8
    try expect(copied[0][10] == first && copied[1][10] == second, "Copied buffer aliases tap memory")
  }

  try test("input format changes signal a discontinuity before emitting new audio") {
    let stream = try AudioChunkStream(chunkSize: 1280)
    let first = try syntheticPCM(sampleRate: 16000, channels: 1, frames: 640)
    var resets = 0
    try stream.process(first, onDiscontinuity: { resets += 1 }) { _ in }
    try expect(resets == 0, "First format unexpectedly signaled a gap")
    let changed = try syntheticPCM(sampleRate: 48000, channels: 2, frames: 48000)
    var count = 0
    try stream.process(changed, onDiscontinuity: { resets += 1 }) { _ in
      count += 1
      precondition(resets == 1, "New-format audio escaped before state reset")
    }
    try expect(resets == 1 && count == 12, "Format transition did not reset once")
  }
}
