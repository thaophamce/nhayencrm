# Friend sync hot-path benchmark — before/after

Date: 2026-08-11

Branch: `codex/fix-friend-sync-event-storm`

Scope: avatar diff and stable friendship transition during the 15-minute full sync

## Workload

Replay distribution is taken from the verified production backup/current comparison:

- 24,158 common Friend rows
- 22,715 avatar URLs changed only in `key/time`
- 118 avatar path changes
- 1,325 unchanged avatar URLs

The benchmark ran 100 in-memory passes over all 24,158 rows. It compares the old full-URL identity rule with the new pathname identity rule. Stable transition writes use the exact row count for a no-state-change cron pass. Database and Socket.IO latency are not simulated, so the write/event counts are the primary result.

## Result

| Metric | Before | After | Reduction |
|---|---:|---:|---:|
| Avatar writes and `friend:updated` events | 22,833 | 118 | 99.48% |
| Stable transition upserts | 24,158 | 0 | 100% |
| Total hot-path Friend writes | 46,991 | 118 | 99.75% |
| Diff compute p50 for 24,158 rows | 0.175 ms | 15.601 ms | +15.426 ms CPU |
| Diff compute p95 for 24,158 rows | 1.865 ms | 18.365 ms | +16.500 ms CPU |

The additional URL parsing CPU is under 20 ms per full account workload in this replay. It replaces tens of thousands of database writes and Socket.IO broadcasts.

## Verification

- RED reproduced both defects before implementation.
- Targeted regression tests: 15/15 passed across the two affected suites.
- Full backend suite: 502 passed, 3 skipped, 0 failed.
- TypeScript build: passed.

## Production acceptance gate

This replay predicts the effect; it does not claim production end-to-end latency. After deployment, observe one complete friend-sync cron cycle and record:

- `friend:updated` emitted count
- Friend-row update delta
- cron duration
- app and PostgreSQL CPU during and after the cycle
- authenticated browser responsiveness during the cycle

Rollback if true avatar path changes stop propagating, friendship transitions fail, or the app does not return healthy after cutover.
