import {createHash} from 'node:crypto';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const {verifyModelManifest} = require('../../scripts/verify-model-manifest.js');

let directory: string;
const hash = createHash('sha256').update('synthetic test bytes').digest('hex');
function fixture() {
  return {
    schemaVersion: 1,
    config: {
      vadThreshold: 0,
      baseModels: {
        melspectrogram: {model: 'mel.onnx', sha256: hash},
        embedding: {model: 'embedding.onnx', sha256: hash},
      },
      models: [{model: 'keyword.onnx', sha256: hash, keyword: 'hey-example'}],
    },
    provenance: Object.fromEntries(
      ['mel.onnx', 'embedding.onnx', 'keyword.onnx'].map(model => [
        model,
        {license: 'MIT', source: 'https://example.com/synthetic-test-fixture'},
      ]),
    ),
  };
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'nitro-manifest-'));
  for (const name of ['mel.onnx', 'embedding.onnx', 'keyword.onnx']) {
    writeFileSync(join(directory, name), 'synthetic test bytes');
  }
});
afterEach(() => rmSync(directory, {recursive: true, force: true}));

test('checks hashes and provenance for local manifest assets without loading ONNX', () => {
  expect(verifyModelManifest(fixture(), directory)).toEqual({
    assets: 3,
    keywords: ['hey-example'],
  });
});
test('rejects an unknown manifest version', () => {
  expect(() =>
    verifyModelManifest({...fixture(), schemaVersion: 2}, directory),
  ).toThrow('version');
});
test('rejects missing classifiers and base model entries', () => {
  const manifest = fixture();
  manifest.config.models = [];
  expect(() => verifyModelManifest(manifest, directory)).toThrow('classifiers');
  expect(() =>
    verifyModelManifest({schemaVersion: 1, config: {models: [{}]}}, directory),
  ).toThrow('base models');
});
test('rejects duplicate labels and out-of-range thresholds', () => {
  const manifest = fixture();
  manifest.config.models.push({...manifest.config.models[0]!});
  expect(() => verifyModelManifest(manifest, directory)).toThrow('Duplicate');
  manifest.config.models.pop();
  manifest.config.vadThreshold = 2;
  expect(() => verifyModelManifest(manifest, directory)).toThrow(
    'vadThreshold',
  );
});
test('requires an explicit VAD asset when enabled', () => {
  const manifest = fixture();
  manifest.config.vadThreshold = 0.3;
  expect(() => verifyModelManifest(manifest, directory)).toThrow('VAD');
});
test('rejects missing license declarations', () => {
  const manifest = fixture();
  delete manifest.provenance['mel.onnx'];
  expect(() => verifyModelManifest(manifest, directory)).toThrow('license');
});
test('rejects missing and malformed hashes', () => {
  const manifest = fixture();
  manifest.config.models[0]!.sha256 = 'bad';
  expect(() => verifyModelManifest(manifest, directory)).toThrow('SHA-256');
});
test('rejects tampered, empty and missing model files', () => {
  writeFileSync(join(directory, 'keyword.onnx'), 'tampered');
  expect(() => verifyModelManifest(fixture(), directory)).toThrow('mismatch');
  writeFileSync(join(directory, 'keyword.onnx'), '');
  expect(() => verifyModelManifest(fixture(), directory)).toThrow('nonempty');
  rmSync(join(directory, 'keyword.onnx'));
  expect(() => verifyModelManifest(fixture(), directory)).toThrow();
});
test('rejects network model locations without fetching them', () => {
  const manifest = fixture();
  manifest.config.models[0]!.model = 'https://example.com/model.onnx';
  manifest.provenance['https://example.com/model.onnx'] = {
    license: 'MIT',
    source: 'https://example.com/source',
  };
  expect(() => verifyModelManifest(manifest, directory)).toThrow('local');
});

test.each([
  '../mel.onnx',
  'models//mel.onnx',
  'file://localhost/tmp/mel.onnx',
  'file://server/tmp/mel.onnx',
])('rejects invalid model path %s', model => {
  const manifest = fixture();
  manifest.config.models[0]!.model = model;
  manifest.provenance[model] = {
    license: 'MIT',
    source: 'https://example.com/source',
  };
  expect(() => verifyModelManifest(manifest, directory)).toThrow();
});
