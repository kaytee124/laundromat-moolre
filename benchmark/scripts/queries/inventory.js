'use strict';

const { loadJson, writeText, ensureResultsDirs } = require('../lib/paths');
const fs = require('fs');

function main() {
  ensureResultsDirs();
  const config = loadJson('critical-queries.json');
  const lines = [
    '# Query Inventory',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Total critical queries: ${config.queries.length}`,
    '',
    '| ID | Name | Source | Description |',
    '|----|------|--------|-------------|',
  ];

  for (const q of config.queries) {
    lines.push(`| ${q.id} | ${q.name} | ${q.source} | ${q.description} |`);
  }

  lines.push('');
  lines.push('## SQL Statements');
  lines.push('');

  for (const q of config.queries) {
    lines.push(`### ${q.id}: ${q.name}`);
    lines.push('');
    lines.push('```sql');
    lines.push(q.sql);
    lines.push('```');
    if (q.params?.length) {
      lines.push('');
      lines.push(`Parameters: ${q.params.join(', ')}`);
    }
    lines.push('');
  }

  const out = lines.join('\n');
  writeText('reports/query-inventory.md', out);
  console.log('Wrote benchmark/results/reports/query-inventory.md');
}

main();
