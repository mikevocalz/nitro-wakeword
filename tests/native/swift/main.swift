import Foundation

var passed = 0

func expect(_ condition: @autoclosure () -> Bool, _ message: String) throws {
  if !condition() { throw WakeWordError(message) }
}

func expectFailure(_ operation: () throws -> Void) throws {
  do { try operation() } catch { return }
  throw WakeWordError("Expected failure")
}

func test(_ name: String, _ operation: () throws -> Void) throws {
  try operation()
  passed += 1
  print("PASS \(name)")
}

try test("partial PCM frames retain exact sample order") {
  let accumulator = try PcmFrameAccumulator(frameSize: 4)
  var frames: [[Float]] = []
  accumulator.append([1, 2, 3]) { frames.append($0) }
  try expect(frames.isEmpty && accumulator.pendingCount == 3, "Partial frame escaped")
  accumulator.append([4, 5, 6, 7, 8, 9]) { frames.append($0) }
  try expect(frames == [[1, 2, 3, 4], [5, 6, 7, 8]], "Sample order changed")
  try expect(accumulator.pendingCount == 1, "Wrong remainder")
}

try test("retained PCM frames are independently owned") {
  let accumulator = try PcmFrameAccumulator(frameSize: 2)
  var frames: [[Float]] = []
  accumulator.append([1, 2, 3, 4]) { frames.append($0) }
  accumulator.append([5, 6]) { _ in }
  try expect(frames == [[1, 2], [3, 4]], "A retained frame was mutated")
}

try test("PCM reset discards partial pre-interruption audio") {
  let accumulator = try PcmFrameAccumulator(frameSize: 4)
  accumulator.append([9, 9, 9]) { _ in }
  accumulator.reset()
  var frames: [[Float]] = []
  accumulator.append([1, 2, 3, 4]) { frames.append($0) }
  try expect(frames == [[1, 2, 3, 4]], "Old samples survived reset")
}

try test("80 ms chunks alternate two and three complete VAD frames") {
  let accumulator = try PcmFrameAccumulator(frameSize: 512)
  var counts: [Int] = []
  for _ in 0..<4 {
    var count = 0
    accumulator.append([Float](repeating: 0, count: 1280)) { _ in count += 1 }
    counts.append(count)
  }
  try expect(counts == [2, 3, 2, 3], "VAD framing drifted")
  try expect(accumulator.pendingCount == 0, "Unexpected remaining samples")
}

try test("warmup reset starts real VAD audio on its own frame boundary") {
  let accumulator = try PcmFrameAccumulator(frameSize: 512)
  accumulator.append([Float](repeating: 0, count: 1280)) { _ in }
  try expect(accumulator.pendingCount == 256, "Fixture must contain an odd chunk")
  accumulator.reset()
  var frame: [Float] = []
  accumulator.append([Float](repeating: 1, count: 512)) { frame = $0 }
  try expect(frame == [Float](repeating: 1, count: 512), "Synthetic silence leaked")
}

try test("long split PCM input stays bounded and lossless") {
  let accumulator = try PcmFrameAccumulator(frameSize: 512)
  let input = (0..<16384).map { Float($0) }
  var output: [Float] = []
  for offset in stride(from: 0, to: input.count, by: 73) {
    accumulator.append(Array(input[offset..<min(offset + 73, input.count)])) {
      output.append(contentsOf: $0)
    }
    try expect(accumulator.pendingCount < 512, "Pending storage grew without bound")
  }
  try expect(output == input && accumulator.pendingCount == 0, "PCM samples lost")
}

try test("PCM callback failure cannot leave a full frame pending") {
  let accumulator = try PcmFrameAccumulator(frameSize: 2)
  try expectFailure { try accumulator.append([1, 2]) { _ in throw WakeWordError("fixture") } }
  try expect(accumulator.pendingCount == 0, "Full failed frame retained")
  var frames: [[Float]] = []
  accumulator.append([3, 4]) { frames.append($0) }
  try expect(frames == [[3, 4]], "Failed frame was replayed")
}

try test("invalid PCM frame sizes fail") {
  for size in [0, -1] { try expectFailure { _ = try PcmFrameAccumulator(frameSize: size) } }
}

try test("VAD preserves speech before the last subframe") {
  let gate = try VadGate(historySize: 12, threshold: 0.5)
  try gate.recordChunk([0.9, 0.1, 0.0])
  try expect(gate.isSpeech, "Earlier speech peak was discarded")
}

try test("VAD silence and history expiration follow capture chunks") {
  let gate = try VadGate(historySize: 12, threshold: 0.5)
  try expect(!gate.isSpeech, "Silence opened the gate")
  try gate.recordChunk([0.5, 0.1])
  for _ in 0..<11 { try gate.recordChunk([0, 0, 0]) }
  try expect(gate.isSpeech, "Speech expired too early")
  try gate.recordChunk([0, 0])
  try expect(!gate.isSpeech, "Speech survived beyond the history window")
}

try test("VAD reset drops pre-interruption speech") {
  let gate = try VadGate(historySize: 12, threshold: 0.5)
  try gate.recordChunk([1])
  gate.reset()
  try expect(!gate.isSpeech, "VAD history survived reset")
}

try test("invalid VAD scores do not mutate history") {
  let gate = try VadGate(historySize: 1, threshold: 0.5)
  try gate.recordChunk([1])
  for score in [Float.nan, .infinity, -.infinity, -0.1, 1.1] {
    try expectFailure { try gate.recordChunk([0, score]) }
    try expect(gate.isSpeech, "Invalid scores changed gate state")
  }
}

try test("empty VAD score chunks age out history") {
  let gate = try VadGate(historySize: 1, threshold: 1)
  try gate.recordChunk([1])
  try expect(gate.isSpeech, "Inclusive upper threshold failed")
  try gate.recordChunk([])
  try expect(!gate.isSpeech, "An empty chunk retained old speech")
}

try test("invalid VAD configuration fails") {
  try expectFailure { _ = try VadGate(historySize: 0, threshold: 0.5) }
  for threshold in [Float.nan, .infinity, -0.1, 1.1] {
    try expectFailure { _ = try VadGate(historySize: 1, threshold: threshold) }
  }
}

try test("microphone ownership rejects another session until release") {
  let first = UUID()
  let second = UUID()
  try MicrophoneOwnership.claim(first)
  defer { MicrophoneOwnership.release(first); MicrophoneOwnership.release(second) }
  try MicrophoneOwnership.claim(first)
  try expectFailure { try MicrophoneOwnership.claim(second) }
  MicrophoneOwnership.release(second)
  try expectFailure { try MicrophoneOwnership.claim(second) }
  MicrophoneOwnership.release(first)
  try MicrophoneOwnership.claim(second)
}

try test("normalized PCM matches signed int16 scale and clamps invalid samples") {
  let input: [Float] = [.nan, .infinity, -2, -1, -0.5, 0, 0.5, 1, 2]
  let expected: [Float] = [0, 0, -32768, -32768, -16384, 0, 16384, 32767, 32767]
  try expect(input.map(WakeWordAudioFormat.int16ScaledSample) == expected, "Wrong PCM scaling")
}

#if canImport(AVFoundation)
try runAudioConversionChecks()
try runModelIntegrityChecks()
#endif

try test("saturated audio backlog marks exactly the next accepted buffer discontinuous") {
  let backlog = try AudioBufferBacklog(capacity: 2)
  try expect(backlog.acquire() == .contiguous, "First buffer rejected")
  try expect(backlog.acquire() == .contiguous, "Second buffer rejected")
  try expect(backlog.acquire() == .dropped, "Backlog exceeded capacity")
  try expect(backlog.acquire() == .dropped, "Repeated overload was not dropped")
  backlog.release()
  try expect(backlog.acquire() == .discontinuous, "Dropped audio was stitched into prior history")
  backlog.release()
  try expect(backlog.acquire() == .contiguous, "Gap was repeated after consumption")
  backlog.release()
  backlog.release()
}

try test("failed tap-buffer copy preserves the gap for the next admitted buffer") {
  let backlog = try AudioBufferBacklog(capacity: 1)
  try expect(backlog.acquire() == .contiguous, "First buffer rejected")
  backlog.markDropped()
  backlog.release()
  try expect(backlog.acquire() == .discontinuous, "Copy failure did not invalidate audio history")
  backlog.release()
}

try test("invalid audio backlog capacity fails") {
  try expectFailure { _ = try AudioBufferBacklog(capacity: 0) }
}
print("Swift native audio tests: \(passed) passed")
