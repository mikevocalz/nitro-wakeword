enum WakeWordAudioFormat {
  static let sampleRate = 16000
  static let chunkSize = 1280

  static func int16ScaledSample(_ sample: Float) -> Float {
    return sample.isFinite ? max(-32768, min(32767, sample * 32768)) : 0
  }
}
