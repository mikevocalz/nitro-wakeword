import Foundation

/// Resolves a model reference to a file URL.
///
/// Order: absolute path -> app main bundle -> an optional host-supplied `NitroWakeWordModels.bundle`.
enum ModelResolver {
  static func resolve(_ reference: String) -> URL? {
    do {
      if let file = try ModelReference.localFileURL(reference) { return existingFile(file) }
    } catch { return nil }

    let nsRef = reference as NSString
    let ext = nsRef.pathExtension.isEmpty ? "onnx" : nsRef.pathExtension
    let name = nsRef.pathExtension.isEmpty ? reference : nsRef.deletingPathExtension

    if let url = Bundle.main.url(forResource: name, withExtension: ext) {
      return url
    }
    for bundle in candidateBundles() {
      if let url = bundle.url(forResource: name, withExtension: ext) {
        return url
      }
    }
    return nil
  }

  /// Display label derived from the reference: `hey_jarvis_v0.1.onnx` -> `hey_jarvis_v0.1`.
  static func defaultKeyword(for reference: String) -> String {
    let path: String
    if let url = try? ModelReference.localFileURL(reference) {
      path = url.path
    } else {
      path = reference
    }
    let file = (path as NSString).lastPathComponent as NSString
    return file.pathExtension.isEmpty ? String(file) : file.deletingPathExtension
  }

  private static func existingFile(_ url: URL) -> URL? {
    var isDirectory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory),
          !isDirectory.boolValue else { return nil }
    return url
  }

  private static func candidateBundles() -> [Bundle] {
    var bundles: [Bundle] = []
    let hosts = [Bundle(for: OnnxSession.self), Bundle.main]
    for host in hosts {
      if let url = host.url(forResource: "NitroWakeWordModels", withExtension: "bundle"),
         let bundle = Bundle(url: url) {
        bundles.append(bundle)
      }
    }
    return bundles
  }
}
