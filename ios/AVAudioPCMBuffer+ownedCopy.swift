import AVFoundation
import Foundation

extension AVAudioPCMBuffer {
  /// A tap's buffer is borrowed only for the callback. Copy it before crossing
  /// into the owner queue; retaining the original does not establish ownership.
  func ownedCopy() -> AVAudioPCMBuffer? {
    return ownedCopy(fromFrame: 0, frameCount: frameLength)
  }

  func ownedCopy(fromFrame offset: AVAudioFrameCount, frameCount count: AVAudioFrameCount) -> AVAudioPCMBuffer? {
    guard count > 0, offset <= frameLength, count <= frameLength - offset,
          let copy = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: count) else { return nil }
    copy.frameLength = count
    let bytesPerFrame = Int(format.streamDescription.pointee.mBytesPerFrame)
    let byteOffset = Int(offset) * bytesPerFrame
    let byteCount = Int(count) * bytesPerFrame
    let source = UnsafeMutableAudioBufferListPointer(mutableAudioBufferList)
    let destination = UnsafeMutableAudioBufferListPointer(copy.mutableAudioBufferList)
    guard source.count == destination.count else { return nil }
    for index in 0..<source.count {
      guard byteOffset + byteCount <= Int(source[index].mDataByteSize),
            byteCount <= Int(destination[index].mDataByteSize),
            let input = source[index].mData, let output = destination[index].mData else { return nil }
      memcpy(output, input.advanced(by: byteOffset), byteCount)
    }
    return copy
  }
}
