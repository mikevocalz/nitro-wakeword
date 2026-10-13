import {NitroModules} from 'react-native-nitro-modules';
import type {WakeWord} from '../../WakeWord.nitro';
import type {WakeWordConfig} from '../../WakeWordConfig';
import type {WakeWordDetection} from '../../WakeWordDetection';

type FakeNative = Omit<jest.Mocked<WakeWord>, 'isLoaded' | 'isListening'> & {
  isLoaded: boolean;
  isListening: boolean;
};

export function makeFakeNative() {
  let detectionListener: ((detection: WakeWordDetection) => void) | undefined;
  let scoreListener: ((keyword: string, score: number) => void) | undefined;
  let errorListener: ((message: string) => void) | undefined;

  const native: FakeNative = {
    name: 'WakeWord',
    isLoaded: false,
    isListening: false,
    load: jest.fn(async (_config: WakeWordConfig) => {
      native.isLoaded = true;
    }),
    unload: jest.fn(async () => {
      native.isLoaded = false;
      native.isListening = false;
      detectionListener = undefined;
      scoreListener = undefined;
      errorListener = undefined;
    }),
    start: jest.fn(async () => {
      native.isListening = true;
    }),
    stop: jest.fn(async () => {
      native.isListening = false;
    }),
    setThreshold: jest.fn(async (_keyword: string, _threshold: number) => {}),
    setDetectionListener: jest.fn(
      (listener: (detection: WakeWordDetection) => void) => {
        detectionListener = listener;
      },
    ),
    clearDetectionListener: jest.fn(() => {
      detectionListener = undefined;
    }),
    setScoreListener: jest.fn(
      (listener: (keyword: string, score: number) => void) => {
        scoreListener = listener;
      },
    ),
    clearScoreListener: jest.fn(() => {
      scoreListener = undefined;
    }),
    setErrorListener: jest.fn((listener: (message: string) => void) => {
      errorListener = listener;
    }),
    clearErrorListener: jest.fn(() => {
      errorListener = undefined;
    }),
    hasMicrophonePermission: jest.fn(() => true),
    requestMicrophonePermission: jest.fn(async () => true),
    equals: jest.fn(
      (other: Parameters<WakeWord['equals']>[0]): boolean => other === native,
    ),
    dispose: jest.fn(),
    toString: jest.fn(() => '[FakeWakeWord]'),
  };

  return Object.assign(native, {
    emitDetection: (detection: WakeWordDetection) =>
      detectionListener?.(detection),
    emitScore: (keyword: string, score: number) =>
      scoreListener?.(keyword, score),
    emitError: (message: string) => errorListener?.(message),
  });
}

export function installFakeNative(native = makeFakeNative()) {
  jest.mocked(NitroModules.createHybridObject).mockReturnValueOnce(native);
  return native;
}
