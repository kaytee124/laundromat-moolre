'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');
const { ensureResultsDirs, loadJson, writeText, ROOT } = require('../lib/paths');
const { generateBottlenecks } = require('./generate-bottlenecks');
const { generateCapacity } = require('./generate-capacity');
const { generate: generateCoverageMatrix } = require('./generate-coverage-matrix');

function generateEndpointInventory() {
  const config = loadJson('endpoints.json');
  const lines = [
    '# Endpoint Inventory',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Total endpoints: ${config.endpoints.length}`,
    '',
    '| ID | Method | Path | Auth | Critical |',
    '|----|--------|------|------|----------|',
  ];

  for (const ep of config.endpoints) {
    lines.push(
      `| ${ep.id} | ${ep.method} | ${ep.path} | ${ep.auth} | ${ep.critical ? 'yes' : ''} |`
    );
  }

  writeText('reports/endpoint-inventory.md', lines.join('\n'));
  console.log('Wrote benchmark/results/reports/endpoint-inventory.md');
}

function main() {
  ensureResultsDirs();
  require('../queries/inventory');
  generateEndpointInventory();
  generateBottlenecks();
  generateCapacity();
  generateCoverageMatrix();
  console.log('All reports generated.');
}

main();
