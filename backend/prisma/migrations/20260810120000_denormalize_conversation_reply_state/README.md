# P1-03 deployment runbook

These migrations remove the unbounded `Conversation.id IN (...)` round trip used
by the message reply-state filter:

1. `20260810120000_denormalize_conversation_reply_state` adds/backfills the
   stored state and installs statement-level maintenance triggers.
2. `20260810121000_index_conversation_reply_state` builds the read index with
   `CREATE INDEX CONCURRENTLY`.

Run this in a low-traffic window. The first migration is explicitly transactional:
it scans `messages` once, updates every `conversations` row, and briefly pauses
message writes while trigger installation/backfill becomes atomic. The second
migration does not block normal writes but still adds I/O to the database. Deploy
migrations before starting an application build that reads `message_reply_state`.

## Preflight

Confirm neither migration is partially applied:

```sql
SELECT migration_name, finished_at, rolled_back_at, logs
FROM _prisma_migrations
WHERE migration_name IN (
  '20260810120000_denormalize_conversation_reply_state',
  '20260810121000_index_conversation_reply_state'
)
ORDER BY migration_name;

SELECT i.indisvalid, i.indisready, pg_get_indexdef(i.indexrelid)
FROM pg_index i
WHERE i.indexrelid = to_regclass('conversations_reply_state_scope_order_idx');
```

If the index exists but is invalid or not ready, remove it outside a transaction
before retrying the migration:

```sql
DROP INDEX CONCURRENTLY conversations_reply_state_scope_order_idx;
```

## Apply

```bash
npx prisma migrate deploy
```

Do not use `prisma db push` to deploy these custom migrations.

## Postflight

Verify the index and all three triggers:

```sql
SELECT i.indisvalid, i.indisready, pg_get_indexdef(i.indexrelid)
FROM pg_index i
WHERE i.indexrelid = 'conversations_reply_state_scope_order_idx'::regclass;

SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'messages'::regclass
  AND NOT tgisinternal
  AND tgname LIKE 'messages_reply_state_after_%'
ORDER BY tgname;
```

Validate the backfill against the original `MAX/FILTER` definition. The result
must be `0`:

```sql
WITH aggregate_state AS (
  SELECT cv.id,
         MAX(m.sent_at) FILTER (WHERE m.sender_type = 'contact') AS last_inbound,
         MAX(m.sent_at) FILTER (WHERE m.sender_type = 'self') AS last_self,
         MAX(m.sent_at) FILTER (
           WHERE m.sender_type = 'self'
             AND m.sent_via IN ('user', 'user_native')
         ) AS last_sale
  FROM conversations cv
  LEFT JOIN messages m ON m.conversation_id = cv.id
  GROUP BY cv.id
)
SELECT COUNT(*) AS mismatches
FROM conversations cv
JOIN aggregate_state agg ON agg.id = cv.id
WHERE cv.message_reply_state IS DISTINCT FROM
  calculate_conversation_message_reply_state(
    agg.last_inbound,
    agg.last_self,
    agg.last_sale
  );
```

Finally run `EXPLAIN (ANALYZE, BUFFERS)` for a representative organization,
account, tab and state. The page query should use
`conversations_reply_state_scope_order_idx`, have no `Sort`, and stop at its
`Limit`.

## Rollback

Rollback changes data shape and must be coordinated with an application rollback.
Stop using `message_reply_state` in the application first, then run outside an
explicit transaction where required:

```sql
DROP INDEX CONCURRENTLY IF EXISTS conversations_reply_state_scope_order_idx;

DROP TRIGGER IF EXISTS messages_reply_state_after_insert ON messages;
DROP TRIGGER IF EXISTS messages_reply_state_after_update ON messages;
DROP TRIGGER IF EXISTS messages_reply_state_after_delete ON messages;
DROP FUNCTION IF EXISTS sync_conversation_reply_state_after_message_insert();
DROP FUNCTION IF EXISTS refresh_conversation_reply_state_after_message_update();
DROP FUNCTION IF EXISTS refresh_conversation_reply_state_after_message_delete();
DROP FUNCTION IF EXISTS calculate_conversation_message_reply_state(
  timestamp without time zone,
  timestamp without time zone,
  timestamp without time zone
);

ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_message_reply_state_check,
  DROP COLUMN IF EXISTS last_inbound_message_at,
  DROP COLUMN IF EXISTS last_self_message_at,
  DROP COLUMN IF EXISTS last_sale_message_at,
  DROP COLUMN IF EXISTS message_reply_state;
```

Do not edit an already-applied migration. If a correction is needed, create a
new migration.
