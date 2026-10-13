import Foundation

func runModelIntegrityChecks() throws {
  let abc = Data("abc".utf8)
  let hash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
  try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  defer { try? FileManager.default.removeItem(at: directory) }
  let file = directory.appendingPathComponent("model.onnx")
  try test("SHA-256 accepts exact bytes and uppercase digests") {
    try abc.write(to: file)
    let lower = try ModelIntegrity.load(file, sha256: hash)
    let upper = try ModelIntegrity.load(file, sha256: hash.uppercased())
    try expect(lower == abc && upper == abc, "Verified bytes changed")
  }
  try test("model integrity rejects mismatched and malformed hashes") {
    for bad in [String(repeating: "0", count: 64), String(repeating: "g", count: 64), String(hash.dropLast()), " " + hash] {
      try expectFailure { _ = try ModelIntegrity.load(file, sha256: bad) }
    }
  }
  try test("model reads reject empty and oversized files") {
    try expectFailure { _ = try ModelIntegrity.load(file, sha256: nil, limit: 2) }
    let exact = try ModelIntegrity.load(file, sha256: nil, limit: 3)
    try expect(exact == abc, "Exact size limit failed")
    try Data().write(to: file)
    try expectFailure { _ = try ModelIntegrity.load(file, sha256: nil) }
  }
  try test("verified bytes do not change after file replacement") {
    try abc.write(to: file)
    let verified = try ModelIntegrity.load(file, sha256: hash)
    try Data("different model".utf8).write(to: file)
    try expect(verified == abc, "Verified bytes alias replaced file")
  }
  try test("local references decode once and reject remote or traversal forms") {
    let decoded = try ModelReference.localFileURL("file:///tmp/hey%20deca.onnx")
    try expect(decoded?.path == "/tmp/hey deca.onnx", "URI decoding changed")
    let bundled = try ModelReference.localFileURL("models/deca.onnx")
    try expect(bundled == nil, "Bundled reference treated as file URL")
    for bad in ["https://example.com/model.onnx", "file://server/a", "file:///a?b", "file:///a#b", "../a", "models//a", "", "file:relative"] {
      try expectFailure { _ = try ModelReference.localFileURL(bad) }
    }
  }
  try test("per-keyword cooldowns stay independent and reset") {
    let short = try KeywordCooldown(milliseconds: 100)
    let long = try KeywordCooldown(milliseconds: 2000)
    try expect(short.accept(at: 10) && long.accept(at: 10), "Initial detections suppressed")
    try expect(short.accept(at: 10.2) && !long.accept(at: 10.2), "Per-keyword cooldown ignored")
    try expect(long.accept(at: 12), "Cooldown did not expire")
    long.reset()
    try expect(long.accept(at: 12.1), "Reset did not clear cooldown")
    let zero = try KeywordCooldown(milliseconds: 0)
    try expect(zero.accept(at: 1) && zero.accept(at: 1), "Zero cooldown suppressed detection")
  }
  try test("invalid keyword cooldowns fail") {
    for bad in [-1, Double.nan, Double.infinity] {
      try expectFailure { _ = try KeywordCooldown(milliseconds: bad) }
    }
  }
}
