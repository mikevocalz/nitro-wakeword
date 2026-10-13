import {NitroModules} from 'react-native-nitro-modules';
import type {WakeWord} from './WakeWord.nitro';
import type {WakeWordConfig} from './WakeWordConfig';
import type {WakeWordSession} from './WakeWordSession';

/**
 * Loads an independent {@linkcode WakeWordSession} without starting microphone capture.
 * Passes {@linkcode WakeWordConfig} unchanged to native validation and model loading.
 * The app must bundle `melspectrogram.onnx`, `embedding_model.onnx`, and any
 * enabled VAD model, as well as supply classifiers. No model files are bundled.
 *
 * Await `session.unload()` when finished to release its capture and models.
 * Failed setup awaits cleanup before rejecting with the original setup error.
 */
export async function createWakeWord(
  config: WakeWordConfig,
): Promise<WakeWordSession> {
  const native = NitroModules.createHybridObject<WakeWord>('WakeWord');
  try {
    await native.load(config);
    return native;
  } catch (error) {
    try {
      await native.unload();
    } catch {
      // A cleanup failure must not hide the error that prevented setup.
    }
    throw error;
  }
}
