const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../../..');
const BENCHMARK_ROOT = path.join(ROOT, 'benchmark');
const CONFIG_DIR = path.join(BENCHMARK_ROOT, 'config');
const RESULTS_DIR = path.join(BENCHMARK_ROOT, 'results');

const RESULT_SUBDIRS = [
  'seed',
  'queries',
  'load',
  'db-metrics',
  'profiling',
  'failure',
  'race',
  'observability',
  'reports',
];

function ensureResultsDirs() {
  for (const sub of RESULT_SUBDIRS) {
    fs.mkdirSync(path.join(RESULTS_DIR, sub), { recursive: true });
  }
}

function configPath(name) {
  return path.join(CONFIG_DIR, name);
}

function resultPath(...parts) {
  return path.join(RESULTS_DIR, ...parts);
}

function loadJson(relativePath) {
  const full = path.isAbsolute(relativePath)
    ? relativePath
    : path.join(CONFIG_DIR, relativePath);
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

function writeJson(relativeResultPath, data) {
  const full = resultPath(relativeResultPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(data, null, 2));
}

function writeText(relativeResultPath, text) {
  const full = resultPath(relativeResultPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
}

function readManifest() {
  const manifestFile = resultPath('seed', 'manifest.json');
  if (!fs.existsSync(manifestFile)) return null;
  return JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
}

module.exports = {
  ROOT,
  BENCHMARK_ROOT,
  CONFIG_DIR,
  RESULTS_DIR,
  ensureResultsDirs,
  configPath,
  resultPath,
  loadJson,
  writeJson,
  writeText,
  readManifest,
};
