# Nitro Wakeword

A standalone React Native Nitro package for app-supplied ONNX wake-word models.
This is a draft package. Native Android and iOS simulator builds pass in the
[documented test fixture](docs/NATIVE_HOST_BUILDS.md); physical-device behavior
is unverified, and the package is not published to npm.

The native source implements microphone capture, a shared mel/embedding pipeline
per session, multiple keyword classifiers, and an optional Silero VAD gate.
The host supplies the model files. No pretrained models or private app data are
included. “Hey Deca” is a configurable example phrase, not a built-in classifier.

## Scope

The initial slice covers independent sessions, native lifecycle ownership,
input validation, model loading, and Expo configuration. A
[typed local command router](docs/COMMANDS.md) matches app-supplied transcripts
and gates app-owned handlers. Optional [static navigation adapters](docs/NAVIGATION.md)
connect authorized commands to Expo Router or React Navigation. Optional
[app-owned list search](docs/SEARCH.md) adds ranked providers, pagination and
guarded selection bound to an exact result page. STT, TTS, speaker
verification, Q&A, dialogue, and example UI remain separate planned work. Optional ExecuTorch reasoning is not a dependency of this package.
See [the dependency review](docs/PLAN_REVIEW.md).

## Models and permissions

Supply compatible `melspectrogram.onnx` and `embedding_model.onnx` alongside your
classifier. Also supply `silero_vad.onnx` unless `vadThreshold` is `0`.
Classifiers must match the openWakeWord `[1, N, 96]` input contract with a window
from 1 through 1024 frames and one finite float32 output score. Symbolic windows
are probed against bounded supported sizes. Missing or invalid files reject
session creation.

For custom local paths, integrity hashes and per-keyword cooldowns, see
[custom model loading](docs/CUSTOM_MODELS.md). The default bundled names remain
supported when `baseModels` is omitted.

Read [model provenance and licensing](docs/PROVENANCE.md) first. A source-code
license does not establish the license of pretrained weights. This port does not
download models, train a “Hey Deca” classifier, or establish detection accuracy.

Microphone access is requested explicitly. Raw audio stays native; the API emits
keyword detections, optional scores, and error messages. There is no telemetry,
cloud service, or network model downloader in the core.

## Session API

```ts
import {createWakeWord} from 'nitro-wakeword';

const session = await createWakeWord({
  models: [{model: 'my_keyword.onnx', keyword: 'my-assistant', threshold: 0.6}],
  vadThreshold: 0,
});

try {
  const granted = await session.requestMicrophonePermission();
  if (!granted) throw new Error('Microphone permission was denied');

  session.setDetectionListener(({keyword, score}) => {
    console.log(keyword, score);
  });
  await session.start();
  // Keep the session while the host needs it. Later:
  await session.stop();
} finally {
  await session.unload();
}
```

`createWakeWord` resolves only after that instance's models load. It creates a
fresh native object each time. Multiple loaded sessions may exist, but only one
may hold the hardware microphone; another `start()` rejects until it is released.
Always await `stop()` or `unload()` before handing capture to another session.

- `start()` acquires capture. Repeated starts while already listening are idempotent.
- `stop()` releases capture and preserves models/listeners for restart.
- `unload()` releases capture, models, and listener references. Create a new
  session to load again; do not use Nitro's low-level `dispose()` as audio cleanup.
- `setThreshold(keyword, threshold)` is asynchronous and rejects an unknown
  keyword or an unloaded session.
- Each listener setter replaces that session's callback for its event. Clearing
  or stopping cannot retract a callback already queued for JavaScript delivery.
- Thresholds and VAD probabilities must be finite numbers in `[0, 1]`. Patience
  must be an integer from `1` through `2147483647`. The refractory interval must
  be finite and nonnegative. Keyword labels must be unique within a session.

The example immediately stops to show cleanup. A host app should retain the
session for its own listening lifecycle and unload it when that owner is done.

## Expo and bare React Native

This package contains custom native code. Use an Expo development build or a
bare React Native app; Expo Go does not include it.

For Expo, place licensed models under `assets/wakeword` and configure:

```json
{
  "expo": {
    "plugins": [
      [
        "nitro-wakeword",
        {
          "microphonePermission": "Allow this app to listen for its wake phrase.",
          "modelsDir": "assets/wakeword",
          "androidForegroundService": false,
          "iosBackgroundAudio": false
        }
      ]
    ]
  }
}
```

The plugin copies regular `.onnx` files into the native app's resources and adds
microphone declarations. When removing or renaming model assets, regenerate the
native projects cleanly so stale copied resources do not remain packaged.

Android foreground listening requires both plugin `androidForegroundService`
and runtime `foregroundService` opt-ins. Bare hosts must declare the service and
foreground microphone permissions themselves. Android background-start and
while-in-use restrictions still apply. iOS background audio must be justified by
the host's supported use case; no always-on or lock-screen detection guarantee
is made. See [verification requirements](docs/VERIFICATION.md).

For a bare host, add `NSMicrophoneUsageDescription` and bundle the model files on
iOS, add model files to Android assets, install Nitro Modules, and run CocoaPods /
Gradle integration for the generated bindings. The package has no bundled-model
fallback. Actual native integration remains to be verified.

## Development

The current toolchain pins Nitro/Nitrogen `0.37.1`, React Native `0.87.1`, React
`19.2.3`, TypeScript `5.9.3`, and Expo config plugins `57.0.10`. These are host-tool
inputs, not a tested cross-platform compatibility matrix.

```sh
npm ci --ignore-scripts
npm run typecheck
npm run lint
npm test
npm run nitrogen
npm run build
```

Generated bindings are checked in. Change the TypeScript specification and
regenerate them rather than editing generated code. No install hook builds,
downloads models, or publishes the package.

See [AGENTS.md](AGENTS.md) for source-verified review skills and
[VERIFICATION.md](docs/VERIFICATION.md) for exact test coverage and remaining
native/device gates. [Audio/VAD checks](docs/AUDIO_VALIDATION.md) cover the native
framing, speech-history and capture recovery slice in PR #3.

## License

Adapted from the MIT-licensed
[FerRiv3ra foundation](https://github.com/FerRiv3ra/react-native-nitro-wakeword/tree/321ec6a5f905ad0c8148213564ae62949653b8b3).
See [LICENSE](LICENSE), [NOTICE](NOTICE), and [provenance](docs/PROVENANCE.md).
