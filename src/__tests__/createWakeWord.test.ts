import {NitroModules} from 'react-native-nitro-modules';
import {createWakeWord} from '../index';
import type {WakeWordConfig} from '../index';
import {installFakeNative} from './utils/fakeNative';

const config: WakeWordConfig = {
  models: [{model: '/models/custom-keyword.onnx', keyword: 'custom'}],
  vadThreshold: 0,
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise;
  });
  return {promise, resolve};
}

beforeEach(() => {
  jest.mocked(NitroModules.createHybridObject).mockReset();
});

describe('createWakeWord', () => {
  it('returns a loaded session without asking for microphone access or starting it', async () => {
    const native = installFakeNative();

    const session = await createWakeWord(config);

    expect(session.isLoaded).toBe(true);
    expect(session.isListening).toBe(false);
    expect(native.requestMicrophonePermission).not.toHaveBeenCalled();
    expect(native.start).not.toHaveBeenCalled();
  });

  it('does not expose a session before model setup completes', async () => {
    const native = installFakeNative();
    const loading = deferred();
    native.load.mockImplementation(async () => {
      await loading.promise;
      native.isLoaded = true;
    });
    const ready = jest.fn();

    const creation = createWakeWord(config).then(ready);
    await Promise.resolve();
    expect(ready).not.toHaveBeenCalled();

    loading.resolve();
    await creation;
    expect(ready).toHaveBeenCalledWith(
      expect.objectContaining({isLoaded: true}),
    );
  });

  it('passes the exact config to native validation without defaults or mutation', async () => {
    const native = installFakeNative();
    const exactConfig: WakeWordConfig = Object.freeze({
      models: [Object.freeze({model: 'file:///models/custom-keyword.onnx'})],
      vadThreshold: 0,
      refractoryMs: 0,
      foregroundService: false,
      manageAudioSession: false,
      notificationTitle: '',
      notificationText: '',
    });

    await createWakeWord(exactConfig);

    expect(native.load.mock.calls[0]?.[0]).toBe(exactConfig);
    expect(exactConfig.models[0]).toEqual({
      model: 'file:///models/custom-keyword.onnx',
    });
    expect(NitroModules.createHybridObject).toHaveBeenCalledWith('WakeWord');
  });

  it('forwards custom base models, integrity hashes and independent keyword cooldowns unchanged', async () => {
    const native = installFakeNative();
    const custom: WakeWordConfig = {
      baseModels: {
        melspectrogram: {model: '/app/mel.onnx', sha256: 'a'.repeat(64)},
        embedding: {model: '/app/embedding.onnx', sha256: 'b'.repeat(64)},
      },
      models: [
        {
          model: '/app/first.onnx',
          keyword: 'first',
          sha256: 'c'.repeat(64),
          refractoryMs: 100,
        },
        {model: '/app/second.onnx', keyword: 'second', refractoryMs: 2000},
      ],
      vadThreshold: 0,
    };
    const session = await createWakeWord(custom);
    expect(native.load.mock.calls[0]?.[0]).toBe(custom);
    await session.unload();
  });

  it('keeps session lifecycle and listeners independent', async () => {
    const firstNative = installFakeNative();
    const secondNative = installFakeNative();
    const [first, second] = await Promise.all([
      createWakeWord(config),
      createWakeWord(config),
    ]);
    const firstListener = jest.fn();
    const secondListener = jest.fn();
    first.setDetectionListener(firstListener);
    second.setDetectionListener(secondListener);

    await first.start();
    expect(first.isListening).toBe(true);
    expect(second.isListening).toBe(false);
    const detection = {keyword: 'custom', score: 0.8, timestamp: 123};
    firstNative.emitDetection(detection);
    expect(firstListener).toHaveBeenCalledWith(detection);
    expect(secondListener).not.toHaveBeenCalled();

    await first.unload();
    expect(first.isLoaded).toBe(false);
    expect(second.isLoaded).toBe(true);
    secondNative.emitDetection(detection);
    expect(secondListener).toHaveBeenCalledWith(detection);
  });

  it('releases failed setup before rejecting with its original error', async () => {
    const native = installFakeNative();
    const failure = new Error('Model not found: /models/missing.onnx');
    native.load.mockRejectedValue(failure);
    const cleanup = deferred();
    native.unload.mockReturnValue(cleanup.promise);
    const onFailure = jest.fn();

    const creation = createWakeWord(config).catch(onFailure);
    await Promise.resolve();
    expect(native.unload).toHaveBeenCalledTimes(1);
    expect(onFailure).not.toHaveBeenCalled();

    cleanup.resolve();
    await creation;
    expect(onFailure).toHaveBeenCalledWith(failure);
  });

  it('does not let one failed setup unload another session', async () => {
    const firstNative = installFakeNative();
    const first = await createWakeWord(config);
    const failedNative = installFakeNative();
    const failure = new Error('Invalid classifier');
    failedNative.load.mockRejectedValue(failure);

    await expect(createWakeWord(config)).rejects.toBe(failure);

    expect(first.isLoaded).toBe(true);
    expect(firstNative.unload).not.toHaveBeenCalled();
    expect(failedNative.unload).toHaveBeenCalledTimes(1);
  });

  it('preserves the setup error when cleanup also fails', async () => {
    const native = installFakeNative();
    const failure = new Error('Invalid classifier');
    native.load.mockRejectedValue(failure);
    native.unload.mockRejectedValue(new Error('Cleanup failed'));

    await expect(createWakeWord(config)).rejects.toBe(failure);
  });

  it('cleans up a synchronous native setup failure', async () => {
    const native = installFakeNative();
    const failure = new Error('Native setup failed');
    native.load.mockImplementation(() => {
      throw failure;
    });

    await expect(createWakeWord(config)).rejects.toBe(failure);

    expect(native.unload).toHaveBeenCalledTimes(1);
  });

  it('reports native construction failure', async () => {
    const failure = new Error('WakeWord is not registered');
    jest.mocked(NitroModules.createHybridObject).mockImplementationOnce(() => {
      throw failure;
    });

    await expect(createWakeWord(config)).rejects.toBe(failure);
  });
});

describe('WakeWordSession', () => {
  it.each(['start', 'stop', 'unload'] as const)(
    'preserves the native completion promise for %s',
    async method => {
      const native = installFakeNative();
      const session = await createWakeWord(config);
      const operation = deferred();
      native[method].mockReturnValue(operation.promise);

      const result = session[method]();

      expect(result).toBe(operation.promise);
      operation.resolve();
      await expect(result).resolves.toBeUndefined();
    },
  );

  it.each(['start', 'stop', 'unload'] as const)(
    'preserves native failures from %s',
    async method => {
      const native = installFakeNative();
      const session = await createWakeWord(config);
      const failure = new Error(`${method} failed`);
      native[method].mockRejectedValue(failure);

      await expect(session[method]()).rejects.toBe(failure);
    },
  );

  it('applies threshold updates asynchronously without transforming the arguments', async () => {
    const native = installFakeNative();
    const session = await createWakeWord(config);
    const operation = deferred();
    native.setThreshold.mockReturnValue(operation.promise);

    const result = session.setThreshold('custom', 0);

    expect(result).toBe(operation.promise);
    expect(native.setThreshold).toHaveBeenCalledWith('custom', 0);
    operation.resolve();
    await result;

    const failure = new Error('Threshold must be in [0, 1]');
    native.setThreshold.mockRejectedValue(failure);
    await expect(session.setThreshold('custom', Number.NaN)).rejects.toBe(
      failure,
    );
    expect(native.setThreshold).toHaveBeenLastCalledWith('custom', Number.NaN);
  });

  it('replaces and clears a session-owned detection callback', async () => {
    const native = installFakeNative();
    const session = await createWakeWord(config);
    const previous = jest.fn();
    const current = jest.fn();
    const detection = {keyword: 'custom', score: 0.9, timestamp: 456};
    session.setDetectionListener(previous);
    session.setDetectionListener(current);

    native.emitDetection(detection);
    expect(previous).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledWith(detection);
    session.clearDetectionListener();
    native.emitDetection(detection);
    expect(current).toHaveBeenCalledTimes(1);
  });

  it('keeps score and error callbacks separate from the detection callback', async () => {
    const native = installFakeNative();
    const session = await createWakeWord(config);
    const onDetection = jest.fn();
    const onScore = jest.fn();
    const onError = jest.fn();
    session.setDetectionListener(onDetection);
    session.setScoreListener(onScore);
    session.setErrorListener(onError);

    native.emitScore('custom', 0.42);
    native.emitError('Audio capture failed');
    expect(onDetection).not.toHaveBeenCalled();
    expect(onScore).toHaveBeenCalledWith('custom', 0.42);
    expect(onError).toHaveBeenCalledWith('Audio capture failed');

    session.clearScoreListener();
    session.clearErrorListener();
    native.emitScore('custom', 0.9);
    native.emitError('Another error');
    expect(onScore).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('exposes permission results without automatically starting the microphone', async () => {
    const native = installFakeNative();
    native.hasMicrophonePermission.mockReturnValue(false);
    native.requestMicrophonePermission.mockResolvedValue(false);
    const session = await createWakeWord(config);

    expect(session.hasMicrophonePermission()).toBe(false);
    await expect(session.requestMicrophonePermission()).resolves.toBe(false);
    expect(native.start).not.toHaveBeenCalled();
  });
});
