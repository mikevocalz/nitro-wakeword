import type {createWakeWord} from './createWakeWord';
import type {WakeWord} from './WakeWord.nitro';

/**
 * A loaded, independently owned session returned by {@linkcode createWakeWord}.
 * Request microphone permission before starting. Await `stop()` to release capture
 * while keeping models loaded, or await `unload()` to release capture and models.
 * After unloading, create a new session to load models again.
 *
 * Each listener setter replaces that session's single callback for the event.
 * Clearing a listener, stopping, or unloading cannot retract callbacks already
 * queued for delivery to JavaScript.
 */
export type WakeWordSession = Pick<
  WakeWord,
  | 'isLoaded'
  | 'isListening'
  | 'start'
  | 'stop'
  | 'unload'
  | 'setThreshold'
  | 'setDetectionListener'
  | 'clearDetectionListener'
  | 'setScoreListener'
  | 'clearScoreListener'
  | 'setErrorListener'
  | 'clearErrorListener'
  | 'hasMicrophonePermission'
  | 'requestMicrophonePermission'
>;
