import Foundation

/// Validates fixed pipeline contracts before incompatible model output can
/// silently truncate, leave recurrent state stale, or enter feature history.
enum ModelOutputValidation {
  static func values(_ output: [Float]?, count: Int, name: String) throws -> [Float] {
    guard let output, output.count == count, output.allSatisfy(\.isFinite) else {
      throw WakeWordError("\(name) must produce exactly \(count) finite values")
    }
    return output
  }

  static func probability(_ output: [Float]?, name: String) throws -> Float {
    let score = try values(output, count: 1, name: name)[0]
    guard (0...1).contains(score) else {
      throw WakeWordError("\(name) must produce a probability between 0 and 1")
    }
    return score
  }
}
