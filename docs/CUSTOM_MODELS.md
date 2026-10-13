# Custom local models

`createWakeWord` accepts an optional `baseModels` object for feature/VAD assets,
plus a `sha256` and `refractoryMs` on each classifier. Omit `baseModels` to keep
using the host's bundled `melspectrogram.onnx`, `embedding_model.onnx` and enabled
`silero_vad.onnx`.

```ts
import {createWakeWord} from 'nitro-wakeword';

// Paths and digests come from the host's reviewed asset manifest.
const session = await createWakeWord({
  baseModels: {
    melspectrogram: {model: assets.mel.path, sha256: assets.mel.sha256},
    embedding: {model: assets.embedding.path, sha256: assets.embedding.sha256},
  },
  models: [
    {model: assets.deca.path, sha256: assets.deca.sha256,
      keyword: 'hey-deca', threshold: 0.6, patience: 2, refractoryMs: 1500},
    {model: assets.cancel.path, sha256: assets.cancel.sha256,
      keyword: 'cancel', threshold: 0.7, refractoryMs: 300},
  ],
  vadThreshold: 0,
});
try {
  // Request microphone permission explicitly before starting capture.
  if (await session.requestMicrophonePermission()) await session.start();
  // The host retains this session while listening is needed.
} finally {
  await session.unload();
}
```

The names and tuning values above are configuration examples, not trained models
or recommended accuracy thresholds. When VAD is enabled, provide
`baseModels.vad` or bundle the compatible legacy Silero model described in
[provenance](PROVENANCE.md).

## Loading and failure behavior

- References are absolute device paths, local `file://` URIs, or bundled names.
  Network URLs and file URIs with authorities, queries or fragments fail.
  Relative bundled names reject empty, `.` and `..` path components.
- Each model must be nonempty, at most 256 MiB and self-contained. ONNX external
  tensor-data sidecars are unsupported. Several models can still consume
  substantial memory; the size limit is per file, not a device memory budget.
- A supplied SHA-256 must contain exactly 64 hexadecimal characters. The native
  loader verifies it before giving the same owned bytes to ONNX. It does not
  reopen the file after checking. Replacing a path afterward cannot replace the
  verified bytes used by that session. No hash means no integrity assertion.
- Missing, invalid, oversized or mismatched assets reject session creation.
  `createWakeWord` waits for cleanup before rejecting. It does not start capture.
- A classifier's `refractoryMs` overrides the session value. If both are absent,
  the interval is 1,000 ms. Zero is valid; negative/nonfinite values fail. Each
  keyword keeps its own monotonic cooldown, cleared on capture reset.

SHA-256 detects changes relative to the expected digest. It does not establish
that a model is safe, accurate, licensed or from a trustworthy source. Review
model provenance before choosing the expected digest. Native parsers still need
supported, up-to-date ONNX runtimes.

## Local manifest verification

A repository development command checks a JSON manifest without downloading,
executing or training models:

```sh
npm run models:verify -- path/to/manifest.json
```

Use `schemaVersion: 1`, `config` in the `WakeWordConfig` shape, and `provenance`
keyed by each exact model reference. Every manifest asset requires `sha256`;
classifiers require explicit unique keywords. Specify both base models and,
when VAD is enabled, its model too. Relative paths resolve from the manifest's
directory for this host-side check. Device paths and bundled-resource layout
must be set for the target app separately.

Each provenance entry requires a declared `license` and an HTTPS `source` URL.
Record immutable version, redistribution terms, tensor contracts, training-data
consent and evaluation evidence alongside them. The checker validates the
presence of provenance, numeric options, paths, file sizes and hashes. It does
not decide whether a license permits your use or rewrite the app's config.
No URL in the manifest is fetched.

A manifest's structure is:

```json
{
  "schemaVersion": 1,
  "config": {
    "baseModels": {
      "melspectrogram": {"model": "mel.onnx", "sha256": "REPLACE_WITH_ACTUAL_SHA256"},
      "embedding": {"model": "embedding.onnx", "sha256": "REPLACE_WITH_ACTUAL_SHA256"}
    },
    "models": [{"model": "custom.onnx", "sha256": "REPLACE_WITH_ACTUAL_SHA256", "keyword": "hey-example"}],
    "vadThreshold": 0
  },
  "provenance": {
    "mel.onnx": {"license": "REVIEW_EXACT_ASSET_TERMS", "source": "https://example.com/replace-with-actual-source"},
    "embedding.onnx": {"license": "REVIEW_EXACT_ASSET_TERMS", "source": "https://example.com/replace-with-actual-source"},
    "custom.onnx": {"license": "REVIEW_EXACT_ASSET_TERMS", "source": "https://example.com/replace-with-actual-source"}
  }
}
```

This is a template, deliberately rejected until real digests replace the markers.
Do not treat placeholder license text as a license grant.

## Evidence and remaining work

Host tests cover manifest errors and unchanged forwarding to the native API.
Native helper tests cover digest validation, wrong/missing/empty/oversized data,
local URI handling, immutable verified bytes and independent keyword cooldowns.
macOS CI also typechecks Swift inference and the Objective-C++ bridge against
real iOS SDK and pinned Microsoft ONNX Runtime headers. Header typechecking is
not an ONNX runtime or full React Native app integration test.

No model weights, recordings, voice datasets or biometric data are included.
Custom training, model downloads, ONNX speech inference fixtures, full app builds,
physical devices, false accepts/hour and false-rejection evaluation remain open.
See [training requirements](TRAINING.md) and [model licensing](PROVENANCE.md).
