import AVFoundation
import Foundation
import NitroModules

enum MicrophonePermission {
  static var isGranted: Bool {
    if #available(iOS 17.0, *) {
      return AVAudioApplication.shared.recordPermission == .granted
    }
    return AVAudioSession.sharedInstance().recordPermission == .granted
  }

  static func requireGranted() throws {
    try requireUsageDescription()
    guard isGranted else { throw WakeWordError("Microphone permission not granted") }
  }

  static func request() throws -> Promise<Bool> {
    try requireUsageDescription()
    // AVFoundation's completion is the native callback bridge that owns this
    // Promise's exactly-once resolution.
    let promise = Promise<Bool>()
    if #available(iOS 17.0, *) {
      AVAudioApplication.requestRecordPermission { promise.resolve(withResult: $0) }
    } else {
      AVAudioSession.sharedInstance().requestRecordPermission { promise.resolve(withResult: $0) }
    }
    return promise
  }

  private static func requireUsageDescription() throws {
    let description = Bundle.main.object(forInfoDictionaryKey: "NSMicrophoneUsageDescription") as? String
    guard let description, !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw WakeWordError("Add NSMicrophoneUsageDescription to your app's Info.plist")
    }
  }
}
