import type {WakeWordAsset} from './WakeWordAsset';

/** App-supplied replacements for the default bundled feature and VAD models. */
export interface WakeWordBaseModels {
  /** Converts int16-scaled PCM into the openWakeWord mel features. */
  melspectrogram: WakeWordAsset;
  /** Converts mel features into 96-dimensional embeddings. */
  embedding: WakeWordAsset;
  /** Required when VAD is enabled unless silero_vad.onnx is bundled by the host. */
  vad?: WakeWordAsset;
}
