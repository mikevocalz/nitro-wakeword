import AVFoundation
import Foundation

/// Conversion and accumulation belong to one stream generation on the engine
/// owner queue. Restart creates a new stream rather than clearing tap-thread
/// state concurrently.
final class AudioChunkStream {
  private let chunkSize: Int
  private var converter: AVAudioConverter?
  private var pending: [Float] = []
  private let targetFormat = AVAudioFormat(
    commonFormat: .pcmFormatFloat32,
    sampleRate: Double(OpenWakeWordEngine.sampleRate),
    channels: 1,
    interleaved: false
  )!

  init(chunkSize: Int) { self.chunkSize = chunkSize }

  func process(_ buffer: AVAudioPCMBuffer, onChunk: ([Float]) -> Void) throws {
    let inputFormat = buffer.format
    guard inputFormat.sampleRate.isFinite, inputFormat.sampleRate > 0, buffer.frameLength > 0 else { return }
    if converter == nil || converter?.inputFormat != inputFormat {
      guard let fresh = AVAudioConverter(from: inputFormat, to: targetFormat) else {
        throw WakeWordError("Cannot convert \(inputFormat) to 16 kHz mono")
      }
      converter = fresh
      pending.removeAll()
    }
    guard let converter else { return }
    let frames = ceil(Double(buffer.frameLength) * targetFormat.sampleRate / inputFormat.sampleRate) + 32
    guard frames < Double(UInt32.max),
          let output = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: AVAudioFrameCount(frames)) else {
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
    for index in 0..<Int(output.frameLength) {
      let sample = channel[index]
      pending.append(sample.isFinite ? max(-32768, min(32767, sample * 32767)) : 0)
    }
    while pending.count >= chunkSize {
      let chunk = Array(pending.prefix(chunkSize))
      pending.removeFirst(chunkSize)
      onChunk(chunk)
    }
  }
}
