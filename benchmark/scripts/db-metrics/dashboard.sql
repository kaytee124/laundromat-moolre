-- MySQL performance_schema queries for benchmark monitoring
-- Used by benchmark/scripts/db-metrics/collect.js

-- Top statements by total latency
SELECT
  DIGEST_TEXT AS query_pattern,
  COUNT_STAR AS exec_count,
  ROUND(SUM_TIMER_WAIT / 1e12, 3) AS total_latency_sec,
  ROUND(AVG_TIMER_WAIT / 1e12, 6) AS avg_latency_sec,
  SUM_ROWS_EXAMINED AS rows_examined,
  SUM_ROWS_SENT AS rows_sent
FROM performance_schema.events_statements_summary_by_digest
WHERE SCHEMA_NAME = DATABASE()
ORDER BY SUM_TIMER_WAIT DESC
LIMIT 20;
