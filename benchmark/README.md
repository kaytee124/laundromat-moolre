# Bubblebytes Production Benchmark Suite

Performance and scalability testing for the laundry management API. All generated artifacts are written to `benchmark/results/` (gitignored).

## Prerequisites

- **Node.js** 18+
- **MySQL** 8.0+ with ~15–20 GB free disk for full-tier seed
- **k6** — [install](https://k6.io/docs/get-started/installation/) (`choco install k6` on Windows)
- Copy `.env.example` to `.env` and configure MySQL credentials

## Quick Start

```bash
# 1. Setup benchmark database and schema
npm run benchmark:setup

# 2. Seed production-scale data (~5M orders, 2–6 hours)
npm run benchmark:seed

# 3. Run individual phases
npm run benchmark:queries      # EXPLAIN ANALYZE on critical queries
npm run benchmark:load         # k6 endpoint benchmarks (server must be running)
npm run benchmark:concurrency  # k6 ramp 10 → 10K VUs (stress; server must be running)
npm run benchmark:capacity     # stepped capacity probe (server must be running)
npm run benchmark:race         # Race / contention scenarios (server required)
npm run benchmark:profile      # CPU/memory/request breakdown
npm run benchmark:failure      # Failure injection scenarios
npm run benchmark:reports      # Generate bottleneck + capacity reports

# 4. Full suite (orchestrated)
npm run benchmark:all

# Recommended re-run when seed already exists (quick k6 load + server restart before race tests)
npm run benchmark:all:quick

# Capacity probe when seed already exists (finds max sustainable VUs on this machine)
npm run benchmark:all:capacity

# Run EVERYTHING: Jest + full benchmark (4–10 hours)
npm run test:all

# Quick validation (~10K orders, ~5 min benchmark)
node benchmark/scripts/run-all.js --quick
node scripts/run-all-tests.js --quick

# Skip seed or load phases
node benchmark/scripts/run-all.js --skip-seed          # defaults to quick k6 load (10 → 200 VUs)
node benchmark/scripts/run-all.js --skip-seed --quick  # explicit quick load + reduced seed if re-seeding
node benchmark/scripts/run-all.js --skip-seed --full-load  # capacity probe (stepped VU discovery)
node benchmark/scripts/run-all.js --skip-seed --stress     # stress test: blind 10K VU ramp (expect failure)
node benchmark/scripts/run-all.js --skip-load
```

### Load profiles

| Flag | Behavior |
|------|----------|
| `--quick` / `--skip-seed` (default) | Quick concurrency ramp (10 → 200 VUs) |
| `--full-load` | **Capacity probe** — stepped VUs (50 → 5000), stops before server dies |
| `--stress` | Blind 10K VU ramp (documents absolute breaking point; expect high error rate) |

Override probe steps: `CAPACITY_STEPS=100,250,500,1000 node benchmark/scripts/load/run-capacity-probe.js`

## Starting the server for load tests

```bash
# Use benchmark database
set NODE_ENV=benchmark
set DB_NAME=laundry_management_system_benchmark
npm start
```

## Data volumes (full tier)

| Entity | Count |
|--------|-------|
| Users | 100,000 |
| Customers | 95,000 |
| Services | 50 |
| Orders | 5,000,000 |
| Order items | ~12,500,000 |
| Payments | 4,000,000 |
| Order status history | 15,000,000 |
| Refresh tokens | 500,000 |

Edit `benchmark/config/volumes.json` to adjust counts.

## Benchmark credentials

| Role | Username | Password |
|------|----------|----------|
| Superadmin | bench_superadmin | BenchPass123! |
| Admin | bench_admin | BenchPass123! |
| Employee | bench_employee | BenchPass123! |
| Client | bench_client | BenchClient123! |

## Seed options

```bash
node benchmark/scripts/seed/seed.js --resume    # Continue from checkpoint
node benchmark/scripts/seed/seed.js --truncate  # Reset and reseed
node benchmark/scripts/seed/seed.js --seed 42   # Deterministic RNG seed
```

## Results layout

```
benchmark/results/
├── seed/manifest.json
├── queries/summary.md, slow-query-log.txt
├── load/summary.md, concurrency-report.md, capacity-probe.json
├── db-metrics/summary.md
├── profiling/request-breakdown.md
├── failure/scenarios.md
├── race/summary.md
└── reports/bottlenecks.md, capacity-estimates.md, coverage-matrix.md
```

## Expected runtime

| Phase | Duration |
|-------|----------|
| Seed (5M orders) | 2–6 hours |
| Query analysis | 5–15 min |
| Load tests (quick) | 5–10 min |
| Capacity probe | 10–20 min |
| Load tests (stress 10K) | 15–30 min |
| Profiling | 10–20 min |
| Full suite | 3–8 hours |

## Notes

- Benchmark scripts do **not** modify application code.
- Uses a separate database (`laundry_management_system_benchmark`).
- Write endpoints are skipped during load tests to avoid polluting data.

### Load / race troubleshooting

- **Always restart the server** after k6 load before running race tests manually. The orchestrator does this in Step 7b (`npm run benchmark:all:quick`).
- **Do not pipe** race output through `Select-Object -First N` in PowerShell — it kills the Node process mid-run and causes `ECONNRESET`.
- **First login** on the 5M-row benchmark DB can take 1–5 minutes under load — wait for it; do not assume the server is hung.
- **`401` responses at ~30s** during race tests usually mean DB pool exhaustion, not invalid tokens. Restart the server and retry.
- **Do not run** `benchmark:race` on the same server process that just finished k6 without a restart.
- **Connection refused during load** — use `--full-load` (capacity probe) instead of `--stress`; the probe stops before the server dies. For manual runs, ensure the server is running with `NODE_ENV=benchmark npm start`.
