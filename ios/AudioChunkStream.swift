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
    var consumed = false
    var error: NSError?
    let status = converter.convert(to: output, error: &error) { _, outStatus in
      guard !consumed else {
        outStatus.pointee = .noDataNow
        return nil
      }
      consumed = true
      outStatus.pointee = .haveData
      return buffer
    }
    guard status != .error else {
      throw WakeWordError("Audio conversion failed: \(error?.localizedDescription ?? "unknown")")
    }
    guard let channel = output.floatChannelData?[0] else { return }
    let samples = (0..<Int(output.frameLength)).map { index -> Float in
      return WakeWordAudioFormat.int16ScaledSample(channel[index])
    }
    frames.append(samples, onFrame: onChunk)
  }
}
