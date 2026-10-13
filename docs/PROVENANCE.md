# Foundation source and model licensing

The initial native implementation is adapted from [FerRiv3ra/react-native-nitro-wakeword](https://github.com/FerRiv3ra/react-native-nitro-wakeword/tree/321ec6a5f905ad0c8148213564ae62949653b8b3), commit `321ec6a5f905ad0c8148213564ae62949653b8b3`. Its MIT license is preserved in `LICENSE` and attribution in `NOTICE`.

Imported surfaces are Swift audio capture and ONNX bridging, Kotlin audio capture and ONNX inference, native build integration, TypeScript specification, and the Expo config plugin. The port changes session ownership, lifecycle handling, validation, package metadata, and documentation. It is not an upstream release or an assertion of upstream compatibility.

## No bundled models

This repository and package contain no ONNX models, vendor SDK binaries, recordings, speaker templates, or private app data. The upstream model downloader is not included.

The upstream wrapper describes pretrained openWakeWord models as Apache-2.0. That is not sufficient evidence for model redistribution. The [openWakeWord project license section](https://github.com/dscripka/openWakeWord#license), reviewed on October 12, 2026, distinguishes Apache-2.0 source code from included pretrained models under CC BY-NC-SA 4.0. Noncommercial and share-alike restrictions can matter to a host app. Verify the exact artifact and version before shipping it.

Before accepting a model, record its origin, immutable version, SHA-256, license, redistribution terms, input/output contract, and any training-data or consent restrictions. Review feature-model, classifier, and VAD model licenses separately. Do not infer their terms from one another.

The host must supply compatible `melspectrogram.onnx` and `embedding_model.onnx`, a classifier, and `silero_vad.onnx` when VAD is enabled. Missing files fail loading. Providing a classifier does not establish its accuracy or multilingual support.

This initial engine expects 256 finite mel values for a 1760-sample input,
96 finite embedding values, and one classifier probability in `[0, 1]`. Its
optional VAD adapter targets the legacy Silero `input`/`sr`/`h`/`c` interface,
with 512-sample frames and `hn`/`cn` outputs of 128 values each. Newer stateful
model formats require a separate compatible adapter; a matching filename alone
does not establish compatibility.

## Runtime dependencies

- [ONNX Runtime](https://github.com/microsoft/onnxruntime): MIT; consumed through its native package managers.
- [Nitro Modules](https://github.com/mrousavy/nitro): MIT; JavaScript/native bindings and generated integration.
- [openWakeWord](https://github.com/dscripka/openWakeWord): architecture reference. Model terms are separate from source terms.

No DaVoice or Alan AI implementation, SDK, or weights are copied. Those products inform feature goals only.
