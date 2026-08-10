# Message thread order index runbook

This migration builds the hot `messages` index concurrently and intentionally
contains one executable SQL statement. Do not add preflight or cleanup statements
to `migration.sql`; multi-statement PostgreSQL migrations can be executed inside a
transaction by the Prisma driver, where `CREATE INDEX CONCURRENTLY` is forbidden.

Do not apply this change with `prisma db push`. Use the normal migration history.

## Preflight

Run this query separately before `prisma migrate deploy`:

```sql
SELECT
  idx.indisvalid,
  idx.indisready,
  pg_get_indexdef(idx.indexrelid) AS definition
FROM pg_index AS idx
JOIN pg_class AS cls ON cls.oid = idx.indexrelid
JOIN pg_namespace AS ns ON ns.oid = cls.relnamespace
WHERE ns.nspname = current_schema()
  AND cls.relname = 'messages_conversation_zalo_num_sent_at_order_idx';
```

- No row: run `prisma migrate deploy`.
- One valid, ready row with the exact definition below: the index is already
  present. Verify why the migration is still pending before marking it applied.
- Invalid, not-ready, or mismatched row: remove it separately, then rerun deploy:

```sql
DROP INDEX CONCURRENTLY IF EXISTS
  "messages_conversation_zalo_num_sent_at_order_idx";
```

Expected definition:

```sql
CREATE INDEX messages_conversation_zalo_num_sent_at_order_idx
ON public.messages USING btree
(conversation_id, zalo_msg_id_num DESC NULLS LAST, sent_at DESC);
```

## Postflight

Repeat the preflight query and require both `indisvalid` and `indisready` to be
true. Then run the representative message-list query with:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id
FROM messages
WHERE conversation_id = '<representative-conversation-id>'
ORDER BY zalo_msg_id_num DESC NULLS LAST, sent_at DESC
LIMIT 100;
```

The accepted plan has an index scan on
`messages_conversation_zalo_num_sent_at_order_idx`, stops after 100 rows, and has
no explicit `Sort` node.

## Rollback

The index is performance-only. Emergency rollback is online:

```sql
DROP INDEX CONCURRENTLY IF EXISTS
  "messages_conversation_zalo_num_sent_at_order_idx";
```

After a successful migration, record any rollback as a new forward migration;
do not edit an already-applied migration file.
