/** One app-supplied classifier in `WakeWordConfig.models`. */
export interface WakeWordModel {
  /**
   * Absolute file path, local `file://` URI, or app-bundled model file name.
   * The classifier must accept an openWakeWord `[1, N, 96]` float tensor.
   * This package does not include model files; the app supplies them and their licenses.
   */
  model: string;
  /** Optional 64-character SHA-256 hex digest, checked before ONNX loads the same bytes. */
  sha256?: string;
  /** Per-keyword cooldown in milliseconds. Overrides config.refractoryMs; finite and nonnegative. */
  refractoryMs?: number;
  /** Detection label. Defaults to the model file name without its extension. */
  keyword?: string;
  /** Finite detection score in `[0, 1]`. @default 0.5 */
  threshold?: number;
  /** Consecutive 80 ms frames required above the threshold; a positive integer. @default 1 */
  patience?: number;
}
