import AVFoundation
import Foundation

extension AVAudioPCMBuffer {
  /// A tap's buffer is borrowed only for the callback. Copy it before crossing
  /// into the owner queue; retaining the original does not establish ownership.
  func ownedCopy() -> AVAudioPCMBuffer? {
    guard frameLength > 0,
          let copy = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameLength) else { return nil }
    copy.frameLength = frameLength
    let source = UnsafeMutableAudioBufferListPointer(mutableAudioBufferList)
    let destination = UnsafeMutableAudioBufferListPointer(copy.mutableAudioBufferList)
    guard source.count == destination.count else { return nil }
    for index in 0..<source.count {
      let count = Int(source[index].mDataByteSize)
      guard count <= Int(destination[index].mDataByteSize),
            let input = source[index].mData, let output = destination[index].mData else { return nil }
      memcpy(output, input, count)
    }
    return copy
  }
}
