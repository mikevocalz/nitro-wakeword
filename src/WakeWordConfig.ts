import type {WakeWordBaseModels} from './WakeWordBaseModels';
import type {WakeWordModel} from './WakeWordModel';

/** Model and capture options for `createWakeWord`. */
export interface WakeWordConfig {
  /** Classifiers to load. Requires at least one model with a unique keyword. */
  models: WakeWordModel[];
  /** Local feature models. Omit to resolve the conventional bundled file names. */
  baseModels?: WakeWordBaseModels;
  /**
   * Speech probability in `[0, 1]` required by the Silero VAD gate.
   * `0` disables VAD. Otherwise the app must provide `silero_vad.onnx`.
   * @default 0.3
   */
  vadThreshold?: number;
  /** Finite, nonnegative minimum interval in milliseconds between detections of the same keyword. @default 1000 */
  refractoryMs?: number;
  /**
   * Keep microphone capture in an Android foreground service while listening.
   * Requires the microphone foreground-service permissions in the manifest.
   * Ignored on iOS.
   * @default false
   */
  foregroundService?: boolean;
  /** Android foreground-service notification title. Ignored on iOS. */
  notificationTitle?: string;
  /** Android foreground-service notification text. Ignored on iOS. */
  notificationText?: string;
  /**
   * Configure the iOS audio session for recording and playback before starting.
   * Set to `false` when the app owns audio-session configuration. Ignored on Android.
   * @default true
   */
  manageAudioSession?: boolean;
}
