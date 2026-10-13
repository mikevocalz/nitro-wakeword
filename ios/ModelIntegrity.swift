import CryptoKit
import Foundation

/// Own the bytes that were hashed; the ONNX initializer receives this value,
/// never a path that another writer could replace after verification.
enum ModelIntegrity {
  static let maximumBytes = 256 * 1024 * 1024

  static func validateDigest(_ expected: String?) throws {
    guard let expected else { return }
    guard expected.utf8.count == 64,
          expected.utf8.allSatisfy({ (48...57).contains($0) || (65...70).contains($0) || (97...102).contains($0) }) else {
      throw WakeWordError("sha256 must contain exactly 64 hexadecimal characters")
    }
  }

  static func load(_ url: URL, sha256: String?, limit: Int = maximumBytes) throws -> Data {
    try validateDigest(sha256)
    guard url.isFileURL, limit > 0 else { throw WakeWordError("Model must be a local file") }
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    var data = Data()
    while let chunk = try handle.read(upToCount: min(65536, limit - data.count + 1)), !chunk.isEmpty {
      guard chunk.count <= limit - data.count else { throw WakeWordError("Model exceeds the 256 MiB size limit") }
      data.append(chunk)
    }
    guard !data.isEmpty else { throw WakeWordError("Model file is empty") }
    if let sha256 {
      let actual = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
      guard actual == sha256.lowercased() else { throw WakeWordError("Model SHA-256 mismatch") }
    }
    return data
  }
}
