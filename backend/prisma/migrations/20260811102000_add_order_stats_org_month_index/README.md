# Order statistics organization/month index runbook

This migration intentionally contains one executable statement because PostgreSQL
does not allow `CREATE INDEX CONCURRENTLY` inside a transaction block.

Before `prisma migrate deploy`, check for a leftover failed concurrent build:

```sql
SELECT idx.indisvalid, idx.indisready, pg_get_indexdef(idx.indexrelid) AS definition
FROM pg_index AS idx
JOIN pg_class AS cls ON cls.oid = idx.indexrelid
JOIN pg_namespace AS ns ON ns.oid = cls.relnamespace
WHERE ns.nspname = current_schema()
  AND cls.relname = 'orders_org_id_created_at_idx';
```

If the row exists but is invalid, not ready, or has a different definition, run
this separately before retrying the migration:

```sql
DROP INDEX CONCURRENTLY IF EXISTS "orders_org_id_created_at_idx";
```

Then clear Prisma's failed-migration marker before retrying:

```bash
npx prisma migrate resolve --rolled-back 20260811102000_add_order_stats_org_month_index
```

If the preflight instead finds a valid, ready index with the exact expected
definition after an interrupted deploy, keep the index and reconcile history:

```bash
npx prisma migrate resolve --applied 20260811102000_add_order_stats_org_month_index
```

After deploy, repeat the check and require both flags to be true. Expected columns
are `org_id, created_at`. Emergency rollback is the same concurrent `DROP INDEX`;
record rollback as a new forward migration after a successful deploy.
