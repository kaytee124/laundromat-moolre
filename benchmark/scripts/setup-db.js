'use strict';

const { ensureBenchmarkDatabase, runMigrateBenchmark } = require('./lib/db');
const { ensureResultsDirs } = require('./lib/paths');

async function main() {
  console.log('Creating benchmark database if not exists...');
  const dbName = await ensureBenchmarkDatabase();
  console.log(`Database: ${dbName}`);

  console.log('Running migrations...');
  runMigrateBenchmark();

  ensureResultsDirs();
  console.log('Benchmark database setup complete.');
  console.log('Next: npm run benchmark:seed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
