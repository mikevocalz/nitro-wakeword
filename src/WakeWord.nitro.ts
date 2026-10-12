import type {HybridObject} from 'react-native-nitro-modules';
import type {WakeWordConfig} from './WakeWordConfig';
import type {WakeWordDetection} from './WakeWordDetection';
import type {WakeWordSession} from './WakeWordSession';

/** Native construction contract behind {@linkcode WakeWordSession}. @internal */
export interface WakeWord extends HybridObject<{
  ios: 'swift';
  android: 'kotlin';
}> {
  /** Last observed model state; true after successful setup until unloading completes. */
  readonly isLoaded: boolean;
  /** Last observed capture state; false after stopping or unloading completes. */
  readonly isListening: boolean;

  /** Validates and loads the app-supplied feature models and classifiers. */
  load(config: WakeWordConfig): Promise<void>;
  /** Stops capture and releases models and listeners. Await completion before discarding the session. */
  unload(): Promise<void>;

  /** Starts microphone capture. Rejects if models are unloaded or microphone permission is missing. */
  start(): Promise<void>;
  /** Stops microphone capture while keeping models loaded for a later `start()`. */
  stop(): Promise<void>;

  /** Sets a loaded keyword's threshold to a finite value in `[0, 1]`; rejects invalid values or unknown keywords. */
  setThreshold(keyword: string, threshold: number): Promise<void>;

  /** Replaces this session's detection callback. Already queued callbacks may still finish. */
  setDetectionListener(listener: (detection: WakeWordDetection) => void): void;
  /** Removes this session's detection callback from future native events. */
  clearDetectionListener(): void;

  /**
   * Replaces this session's tuning callback with scores after VAD gating.
   * Called for each keyword every 80 ms while processing audio; clear it when not needed.
   */
  setScoreListener(listener: (keyword: string, score: number) => void): void;
  /** Removes this session's score callback from future native events. */
  clearScoreListener(): void;

  /** Replaces this session's runtime-error callback. Audio capture may have stopped after an error. */
  setErrorListener(listener: (message: string) => void): void;
  /** Removes this session's error callback from future native events. */
  clearErrorListener(): void;

  /** Reports whether the app currently has microphone permission. Does not request permission. */
  hasMicrophonePermission(): boolean;
  /** Requests microphone permission and resolves with the result. Does not start listening. */
  requestMicrophonePermission(): Promise<boolean>;
}
