# Custom models

Custom model training is planned in PR #4. The foundation accepts compatible app-supplied ONNX classifiers; it does not include a trained “Hey Deca” model or a training service.

Start with [openWakeWord's training documentation](https://github.com/dscripka/openWakeWord#training-new-models). Verify the exact training tools, datasets, synthetic voices, and output-model license before use. Obtain consent for recordings and keep training/evaluation sets separate.

For every model, record its provenance, checksum, tensor contract, threshold, patience, language/voice coverage, false accepts per hour, false rejects, and the devices/noise conditions tested. Do not infer multilingual performance from a model loading successfully.

See `PROVENANCE.md` before distributing weights. Training or downloading models is outside the initial foundation port.
