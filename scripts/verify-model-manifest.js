const {Buffer} = require('node:buffer');
const {createHash} = require('node:crypto');
const {
  readFileSync,
  openSync,
  closeSync,
  fstatSync,
  readSync,
} = require('node:fs');
const {dirname, resolve} = require('node:path');
const {fileURLToPath} = require('node:url');

const maximumBytes = 256 * 1024 * 1024;

function requireValue(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function localPath(reference, directory) {
  requireValue(
    typeof reference === 'string' && reference.trim(),
    'Missing model reference',
  );
  if (/^[a-z][a-z0-9+.-]*:/i.test(reference)) {
    const url = new URL(reference);
    requireValue(
      url.protocol === 'file:' &&
        !/^file:\/\/[^/]/i.test(reference) &&
        !url.hostname &&
        !url.search &&
        !url.hash,
      'Only local model files are supported',
    );
    return fileURLToPath(url);
  }
  requireValue(
    reference.startsWith('/') ||
      (!reference.includes('\\') &&
        reference
          .split('/')
          .every(part => part && part !== '.' && part !== '..')),
    'Invalid bundled model path',
  );
  return resolve(directory, reference);
}

/** Verifies local artifacts only. Provenance is a declaration, not a license opinion. */
function verifyModelManifest(manifest, directory) {
  requireValue(
    manifest?.schemaVersion === 1,
    'Unsupported model manifest version',
  );
  const config = manifest.config;
  requireValue(
    Array.isArray(config?.models) && config.models.length > 0,
    'Manifest requires classifiers',
  );
  requireValue(
    config.baseModels?.melspectrogram && config.baseModels?.embedding,
    'Manifest requires explicit base models',
  );
  const probability = (value, name) =>
    requireValue(
      Number.isFinite(value) && value >= 0 && value <= 1,
      `${name} must be in [0, 1]`,
    );
  const cooldown = value =>
    requireValue(
      Number.isFinite(value) && value >= 0,
      'refractoryMs must be finite and nonnegative',
    );
  probability(config.vadThreshold ?? 0.3, 'vadThreshold');
  cooldown(config.refractoryMs ?? 1000);
  requireValue(
    (config.vadThreshold ?? 0.3) === 0 || config.baseModels.vad,
    'Enabled VAD requires an explicit model',
  );
  const labels = new Set();
  for (const model of config.models) {
    requireValue(
      typeof model.keyword === 'string' && model.keyword.trim(),
      'Manifest classifiers require explicit keywords',
    );
    requireValue(!labels.has(model.keyword), 'Duplicate keyword');
    labels.add(model.keyword);
    probability(model.threshold ?? 0.5, 'threshold');
    cooldown(model.refractoryMs ?? config.refractoryMs ?? 1000);
    requireValue(
      Number.isInteger(model.patience ?? 1) &&
        (model.patience ?? 1) >= 1 &&
        (model.patience ?? 1) <= 2147483647,
      'Invalid patience',
    );
  }
  const assets = [
    config.baseModels.melspectrogram,
    config.baseModels.embedding,
    ...config.models,
  ];
  if (config.baseModels.vad) {
    assets.push(config.baseModels.vad);
  }
  for (const asset of assets) {
    requireValue(
      typeof asset?.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(asset.sha256),
      'Every manifest asset requires SHA-256',
    );
    const provenance = manifest.provenance?.[asset.model];
    requireValue(
      typeof provenance?.license === 'string' && provenance.license.trim(),
      'Every asset requires a declared license',
    );
    requireValue(
      typeof provenance?.source === 'string' &&
        provenance.source.startsWith('https://'),
      'Every asset requires an HTTPS provenance URL',
    );
    const path = localPath(asset.model, directory);
    const descriptor = openSync(path, 'r');
    let actual;
    try {
      const size = fstatSync(descriptor);
      requireValue(
        size.isFile() && size.size > 0 && size.size <= maximumBytes,
        'Model must be a nonempty file no larger than 256 MiB',
      );
      const digest = createHash('sha256');
      const buffer = Buffer.alloc(65536);
      let total = 0;
      for (;;) {
        const count = readSync(
          descriptor,
          buffer,
          0,
          Math.min(buffer.length, maximumBytes - total + 1),
          null,
        );
        if (count === 0) {
          break;
        }
        total += count;
        requireValue(
          total <= maximumBytes,
          'Model size changed outside limits',
        );
        digest.update(buffer.subarray(0, count));
      }
      requireValue(total > 0, 'Model file became empty');
      actual = digest.digest('hex');
    } finally {
      closeSync(descriptor);
    }
    requireValue(
      actual === asset.sha256.toLowerCase(),
      `SHA-256 mismatch: ${asset.model}`,
    );
  }
  return {assets: assets.length, keywords: [...labels]};
}

module.exports = {verifyModelManifest};

if (require.main === module) {
  try {
    requireValue(
      process.argv.length === 3,
      'Usage: node scripts/verify-model-manifest.js path/to/manifest.json',
    );
    const path = resolve(process.argv[2]);
    const result = verifyModelManifest(
      JSON.parse(readFileSync(path, 'utf8')),
      dirname(path),
    );
    process.stdout.write(
      `Verified ${result.assets} local assets for ${result.keywords.join(', ')}. License declarations still need review.\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
