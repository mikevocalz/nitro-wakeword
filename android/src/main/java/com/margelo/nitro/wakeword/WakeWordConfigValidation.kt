package com.margelo.nitro.wakeword

/** Validate before opening models or converting Double values to Int/Float. */
internal object WakeWordConfigValidation {
  fun validate(config: WakeWordConfig) {
    require(config.models.isNotEmpty()) { "config.models must contain at least one model" }
    threshold(config.vadThreshold ?: 0.3, "vadThreshold")
    val refractoryMs = config.refractoryMs ?: 1000.0
    require(refractoryMs.isFinite() && refractoryMs >= 0.0) { "refractoryMs must be finite and >= 0" }
    config.baseModels?.let { bases ->
      for (asset in listOfNotNull(bases.melspectrogram, bases.embedding, bases.vad)) {
        require(asset.model.isNotBlank()) { "Base model must be a nonempty local reference" }
        ModelReference.localFile(asset.model)
        ModelIntegrity.validateDigest(asset.sha256)
      }
    }
    val keywords = HashSet<String>()
    for (model in config.models) {
      ModelReference.localFile(model.model)
      ModelIntegrity.validateDigest(model.sha256)
      val cooldown = model.refractoryMs ?: refractoryMs
      require(cooldown.isFinite() && cooldown >= 0.0) { "model.refractoryMs must be finite and >= 0" }
      require(model.model.isNotBlank()) { "model must be a nonempty model reference" }
      val keyword = model.keyword ?: ModelResolver.defaultKeyword(model.model)
      require(keyword.isNotBlank()) { "keyword must be nonempty" }
      require(keywords.add(keyword)) { "Duplicate keyword: $keyword" }
      threshold(model.threshold ?: 0.5, "threshold for $keyword")
      val patience = model.patience ?: 1.0
      require(patience.isFinite() && patience >= 1.0 && patience <= Int.MAX_VALUE.toDouble() && patience % 1.0 == 0.0) {
        "patience for $keyword must be an integer in [1, ${Int.MAX_VALUE}]"
      }
    }
  }

  fun threshold(value: Double, name: String = "threshold") {
    require(value.isFinite() && value in 0.0..1.0) { "$name must be finite and in [0, 1]" }
  }
}
