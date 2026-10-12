import type {WakeWordSession} from './WakeWordSession';

/** A classifier detection delivered by {@linkcode WakeWordSession.setDetectionListener}. */
export interface WakeWordDetection {
  /** Keyword label supplied by the model configuration or derived from its file name. */
  keyword: string;
  /** Classifier score at detection time, in `[0, 1]`. */
  score: number;
  /** Detection time as Unix epoch milliseconds. */
  timestamp: number;
}
