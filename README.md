# Bubblebytes

Laundry management REST API (Node.js + Express + Sequelize + MySQL).

## Setup

```bash
npm install
copy .env.example .env   # configure MySQL, JWT, Paystack
npm start                # applies pending migrations automatically
```

`npm run db:migrate` is still available for CI or one-off runs. For Jest, use `npm run db:migrate:test` (test DB is separate and not migrated via `server.js`).

## Testing

### Run everything (Jest + full benchmark)

```powershell
npm run test:all
```

Runs: test DB migrate → all Jest suites (security, integration, concurrency) → benchmark setup → full 5M seed benchmark (k6, race tests, reports). **4–10 hours.**

Quick smoke (~5 min benchmark after Jest):

```powershell
node scripts/run-all-tests.js --quick
```

### Jest only

```powershell
npm run db:migrate:test
npm test                      # all suites
npm run test:security
npm run test:integration
npm run test:concurrency      # race-condition smoke tests
```

### Benchmark only

```powershell
npm run benchmark:setup
npm run benchmark:seed        # ~2–6 hours for 5M orders
npm run benchmark:all         # full pipeline
npm run benchmark:race      # race tests (server on :3000 required)
```

See [benchmark/README.md](benchmark/README.md) for details.

## Databases

| Purpose | Database name |
|---------|---------------|
| Development | `laundry_management_system` |
| Jest tests | `laundry_management_system_test` |
| Benchmarks | `laundry_management_system_benchmark` |

## Reports

After `npm run test:all` or `npm run benchmark:all`:

- `benchmark/results/reports/bottlenecks.md` — primary findings
- `benchmark/results/reports/coverage-matrix.md` — what is tested
- `benchmark/results/race/summary.md` — race / contention results
- `benchmark/results/reports/full-test-run.md` — overall pass/fail
