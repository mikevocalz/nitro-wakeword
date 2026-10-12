import Foundation

/// Resolves a model reference to a file URL.
///
/// Order: absolute path -> app main bundle -> `NitroWakeWordModels.bundle`
/// shipped with this library.
enum ModelResolver {
  static func resolve(_ reference: String) -> URL? {
    if reference.hasPrefix("/") {
      return existingFile(URL(fileURLWithPath: reference))
    }
    if let components = URLComponents(string: reference), components.scheme != nil {
      guard let url = localFileURL(components) else { return nil }
      return existingFile(url)
    }

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
    if let components = URLComponents(string: reference), let url = localFileURL(components) {
      path = url.path
    } else {
      path = reference
    }
    let file = (path as NSString).lastPathComponent as NSString
    return file.pathExtension.isEmpty ? String(file) : file.deletingPathExtension
  }

  private static func localFileURL(_ input: URLComponents) -> URL? {
    guard input.scheme?.lowercased() == "file",
          input.host == nil || input.host == "",
          input.user == nil, input.password == nil, input.port == nil,
          input.query == nil, input.fragment == nil else { return nil }
    var components = input
    components.scheme = "file"
    guard let url = components.url, url.isFileURL, url.path.hasPrefix("/") else { return nil }
    return url
  }

  private static func existingFile(_ url: URL) -> URL? {
    var isDirectory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory),
          !isDirectory.boolValue else { return nil }
    return url
  }

  private static func candidateBundles() -> [Bundle] {
    var bundles: [Bundle] = []
    let hosts = [Bundle(for: HybridWakeWord.self), Bundle.main]
    for host in hosts {
      if let url = host.url(forResource: "NitroWakeWordModels", withExtension: "bundle"),
         let bundle = Bundle(url: url) {
        bundles.append(bundle)
      }
    }
    return bundles
  }
}
