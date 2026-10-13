/** One local, self-contained ONNX model. External tensor-data files are unsupported. */
export interface WakeWordAsset {
  /** Absolute path, local file:// URI, or app-bundled model name. No network URLs. */
  model: string;
  /** Optional 64-character SHA-256 hex digest, verified before ONNX loads the same bytes. */
  sha256?: string;
}
