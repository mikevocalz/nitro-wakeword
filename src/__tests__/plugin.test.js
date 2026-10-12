const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

jest.mock('@expo/config-plugins', () => ({
  withInfoPlist: (config, action) => ({...config, infoPlistAction: action}),
  withAndroidManifest: (config, action) => ({
    ...config,
    manifestAction: action,
  }),
  withDangerousMod: (config, [platform, action]) => ({
    ...config,
    [`${platform}ModelsAction`]: action,
  }),
  withXcodeProject: (config, action) => ({...config, xcodeAction: action}),
  AndroidConfig: {
    Permissions: {
      ensurePermissions: (manifest, permissions) => {
        manifest.permissions = [
          ...new Set([...(manifest.permissions || []), ...permissions]),
        ];
      },
    },
    Manifest: {
      getMainApplicationOrThrow: manifest => manifest.application,
    },
  },
  IOSConfig: {XcodeUtils: {addResourceFileToGroup: jest.fn()}},
}));

const withNitroWakeWord = require('../../app.plugin');

describe('Expo configuration', () => {
  it('requests microphone access without enabling background recording', () => {
    const config = withNitroWakeWord({});
    const mod = {modResults: {application: {}}};
    config.manifestAction(mod);
    expect(mod.modResults.permissions).toEqual([
      'android.permission.RECORD_AUDIO',
    ]);
    expect(mod.modResults.application.service).toBeUndefined();
    const ios = config.infoPlistAction({modResults: {}});
    expect(ios.modResults.UIBackgroundModes).toBeUndefined();
    expect(ios.modResults.NSMicrophoneUsageDescription).toContain('microphone');
  });

  it('adds the opt-in service and permissions only once', () => {
    const config = withNitroWakeWord({}, {androidForegroundService: true});
    const mod = {modResults: {application: {}}};
    config.manifestAction(mod);
    config.manifestAction(mod);
    expect(mod.modResults.application.service).toEqual([
      {
        $: {
          'android:name':
            'com.margelo.nitro.wakeword.WakeWordForegroundService',
          'android:exported': 'false',
          'android:foregroundServiceType': 'microphone',
        },
      },
    ]);
    expect(mod.modResults.permissions).toEqual([
      'android.permission.RECORD_AUDIO',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
      'android.permission.POST_NOTIFICATIONS',
    ]);
  });

  it('preserves host permission text and background modes', () => {
    const config = withNitroWakeWord({}, {iosBackgroundAudio: true});
    const mod = {
      modResults: {
        NSMicrophoneUsageDescription: 'Host microphone purpose',
        UIBackgroundModes: ['location'],
      },
    };
    config.infoPlistAction(mod);
    config.infoPlistAction(mod);
    expect(mod.modResults.NSMicrophoneUsageDescription).toBe(
      'Host microphone purpose',
    );
    expect(mod.modResults.UIBackgroundModes).toEqual(['location', 'audio']);
  });

  it.each([
    {modelsDir: ''},
    {modelsDir: 123},
    {androidForegroundService: 'false'},
    {iosBackgroundAudio: 1},
  ])('rejects invalid options %p', props => {
    expect(() => withNitroWakeWord({}, props)).toThrow('nitro-wakeword:');
  });

  it('copies only regular ONNX files from the host assets directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wakeword-plugin-'));
    try {
      const assets = path.join(root, 'assets', 'wakeword');
      fs.mkdirSync(assets, {recursive: true});
      fs.writeFileSync(path.join(assets, 'classifier.onnx'), 'test-fixture');
      fs.writeFileSync(path.join(assets, 'notes.txt'), 'not a model');
      fs.mkdirSync(path.join(assets, 'directory.onnx'));
      fs.symlinkSync('classifier.onnx', path.join(assets, 'symlink.onnx'));
      const config = withNitroWakeWord({});
      config.androidModelsAction({
        modRequest: {
          projectRoot: root,
          platformProjectRoot: path.join(root, 'android'),
        },
      });
      const output = path.join(root, 'android', 'app', 'src', 'main', 'assets');
      expect(fs.readdirSync(output)).toEqual(['classifier.onnx']);
      expect(
        fs.readFileSync(path.join(output, 'classifier.onnx'), 'utf8'),
      ).toBe('test-fixture');
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });
});
