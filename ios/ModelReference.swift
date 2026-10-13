import Foundation

enum ModelReference {
  static func localFileURL(_ reference: String) throws -> URL? {
    guard !reference.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw WakeWordError("Model reference must be nonempty")
    }
    if reference.hasPrefix("/") { return URL(fileURLWithPath: reference) }
    guard var components = URLComponents(string: reference), components.scheme != nil else {
      guard reference.range(of: "^[A-Za-z][A-Za-z0-9+.-]*:", options: .regularExpression) == nil,
            !reference.contains("\\"),
            !reference.split(separator: "/", omittingEmptySubsequences: false).contains(where: { $0.isEmpty || $0 == "." || $0 == ".." }) else {
        throw WakeWordError("Bundled model names cannot contain empty or parent path components")
      }
      return nil
    }
    guard components.scheme?.lowercased() == "file", components.host == nil || components.host == "",
          components.user == nil, components.password == nil, components.port == nil,
          components.query == nil, components.fragment == nil, components.path.hasPrefix("/") else {
      throw WakeWordError("Only local file URIs without authority, query or fragment are supported")
    }
    components.scheme = "file"
    guard let url = components.url, url.isFileURL else { throw WakeWordError("Invalid model file URI") }
    return url
  }
}
