const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {
  resolvePluginForModule,
} = require('@expo/config-plugins/build/utils/plugin-resolver');

const packageRoot = path.resolve(__dirname, '../..');

describe('Expo plugin package entry points', () => {
  it('resolves the package name to the plugin instead of the native runtime', () => {
    expect(resolvePluginForModule(packageRoot, 'nitro-wakeword')).toEqual({
      isPluginFile: true,
      filePath: path.join(packageRoot, 'app.plugin.js'),
    });
  });

  it('exposes the plugin file to Node package resolution', () => {
    const resolved = execFileSync(
      process.execPath,
      [
        '-e',
        "process.stdout.write(require.resolve('nitro-wakeword/app.plugin.js'))",
      ],
      {cwd: packageRoot, encoding: 'utf8'},
    );
    expect(resolved).toBe(path.join(packageRoot, 'app.plugin.js'));
  });
});
