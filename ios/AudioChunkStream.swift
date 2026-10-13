import AVFoundation
import Foundation

/// Conversion and accumulation belong to one stream generation on the engine
/// owner queue. Restart creates a new stream rather than clearing tap-thread
/// state concurrently.
final class AudioChunkStream {
  private let frames: PcmFrameAccumulator
  private var converter: AVAudioConverter?
  private let targetFormat = AVAudioFormat(
    commonFormat: .pcmFormatFloat32,
    sampleRate: Double(WakeWordAudioFormat.sampleRate),
    channels: 1,
    interleaved: false
  )!

  init(chunkSize: Int) throws { frames = try PcmFrameAccumulator(frameSize: chunkSize) }

  func reset() {
    converter = nil
    frames.reset()
  }

  func process(
    _ buffer: AVAudioPCMBuffer,
    onDiscontinuity: () throws -> Void = {},
    onChunk: ([Float]) -> Void
  ) throws {
    let inputFormat = buffer.format
    guard inputFormat.sampleRate.isFinite, inputFormat.sampleRate > 0, buffer.frameLength > 0 else { return }
    if converter == nil || converter?.inputFormat != inputFormat {
      if converter != nil { try onDiscontinuity() }
      guard let fresh = AVAudioConverter(from: inputFormat, to: targetFormat) else {
        throw WakeWordError("Cannot convert \(inputFormat) to 16 kHz mono")
      }
      converter = fresh
      frames.reset()
    }
    guard let converter else { return }
    let capacity = ceil(Double(buffer.frameLength) * targetFormat.sampleRate / inputFormat.sampleRate) + 32
    guard capacity < Double(UInt32.max),
          let output = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: AVAudioFrameCount(capacity)) else {
      throw WakeWordError("Cannot allocate converted microphone buffer")
    }
    var offset: AVAudioFrameCount = 0
    var status: AVAudioConverterOutputStatus
    repeat {
      var error: NSError?
      var inputCopyFailed = false
      output.frameLength = 0
      status = converter.convert(to: output, error: &error) { requested, outStatus in
        let count = min(requested, buffer.frameLength - offset)
        guard count > 0 else {
          outStatus.pointee = .noDataNow
          return nil
        }
        guard let input = buffer.ownedCopy(fromFrame: offset, frameCount: count) else {
          inputCopyFailed = true
          outStatus.pointee = .noDataNow
          return nil
        }
        offset += count
        outStatus.pointee = .haveData
        return input
      }
      guard !inputCopyFailed else { throw WakeWordError("Cannot copy converter input frames") }
      guard status != .error else {
        throw WakeWordError("Audio conversion failed: \(error?.localizedDescription ?? "unknown")")
      }
      guard status != .haveData || output.frameLength > 0 else {
        throw WakeWordError("Audio converter produced no frames while reporting available data")
      }
      guard let channel = output.floatChannelData?[0] else {
        throw WakeWordError("Converted microphone buffer has no float channel")
      }
      let samples = (0..<Int(output.frameLength)).map { index in
        WakeWordAudioFormat.int16ScaledSample(channel[index])
      }
      frames.append(samples, onFrame: onChunk)
    } while status == .haveData
  }
}
