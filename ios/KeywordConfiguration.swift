import Foundation

struct KeywordConfiguration {
  let keyword: String
  let asset: ResolvedModelAsset
  let threshold: Float
  let patience: Int
  let refractoryMs: Double
}
