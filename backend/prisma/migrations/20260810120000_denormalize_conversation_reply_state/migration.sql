-- P1-03: keep the per-conversation reply state in conversations so list
-- filtering composes with Prisma pagination/count without a large UUID IN list.
-- The timestamps preserve the existing MAX(sent_at) semantics, including
-- out-of-order Zalo events.

-- Keep trigger installation and backfill atomic. In particular, CREATE TRIGGER
-- waits for in-flight Message writes before the backfill snapshot is taken, so
-- no message can commit in a gap without either being backfilled or triggering
-- the incremental state update.
BEGIN;

ALTER TABLE "conversations"
  ADD COLUMN "last_inbound_message_at" TIMESTAMP(3),
  ADD COLUMN "last_self_message_at" TIMESTAMP(3),
  ADD COLUMN "last_sale_message_at" TIMESTAMP(3),
  ADD COLUMN "message_reply_state" TEXT;

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_message_reply_state_check"
  CHECK (
    "message_reply_state" IS NULL
    OR "message_reply_state" IN ('unanswered', 'bot_no_sale', 'sale_replied')
  );

CREATE OR REPLACE FUNCTION "calculate_conversation_message_reply_state"(
  last_inbound TIMESTAMP(3),
  last_self TIMESTAMP(3),
  last_sale TIMESTAMP(3)
) RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN last_inbound IS NULL THEN NULL
    WHEN last_self IS NULL OR last_self < last_inbound THEN 'unanswered'
    WHEN last_sale IS NOT NULL AND last_sale >= last_inbound THEN 'sale_replied'
    ELSE 'bot_no_sale'
  END
$$;

-- Fast path for the hot write path: aggregate only rows in the current INSERT
-- statement and merge their maxima into the locked Conversation row. This is
-- concurrency-safe and avoids rescanning long message threads on every insert.
CREATE OR REPLACE FUNCTION "sync_conversation_reply_state_after_message_insert"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  WITH delta AS (
    SELECT n."conversation_id",
           MAX(n."sent_at") FILTER (WHERE n."sender_type" = 'contact') AS last_inbound,
           MAX(n."sent_at") FILTER (WHERE n."sender_type" = 'self') AS last_self,
           MAX(n."sent_at") FILTER (
             WHERE n."sender_type" = 'self'
               AND n."sent_via" IN ('user', 'user_native')
           ) AS last_sale
    FROM new_message_rows n
    GROUP BY n."conversation_id"
  )
  UPDATE "conversations" cv
  SET "last_inbound_message_at" = GREATEST(cv."last_inbound_message_at", d.last_inbound),
      "last_self_message_at" = GREATEST(cv."last_self_message_at", d.last_self),
      "last_sale_message_at" = GREATEST(cv."last_sale_message_at", d.last_sale),
      "message_reply_state" = "calculate_conversation_message_reply_state"(
        GREATEST(cv."last_inbound_message_at", d.last_inbound),
        GREATEST(cv."last_self_message_at", d.last_self),
        GREATEST(cv."last_sale_message_at", d.last_sale)
      )
  FROM delta d
  WHERE cv."id" = d."conversation_id";

  RETURN NULL;
END
$$;

-- Slow repair path for the rare case where a message's state-defining columns
-- change. Recompute only conversations touched by that UPDATE statement.
CREATE OR REPLACE FUNCTION "refresh_conversation_reply_state_after_message_update"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  WITH affected AS (
    SELECT DISTINCT old_row."conversation_id" AS id
    FROM old_message_rows old_row
    JOIN new_message_rows new_row ON new_row."id" = old_row."id"
    WHERE (
      old_row."conversation_id",
      old_row."sent_at",
      old_row."sender_type",
      old_row."sent_via"
    ) IS DISTINCT FROM (
      new_row."conversation_id",
      new_row."sent_at",
      new_row."sender_type",
      new_row."sent_via"
    )
    UNION
    SELECT DISTINCT new_row."conversation_id" AS id
    FROM old_message_rows old_row
    JOIN new_message_rows new_row ON new_row."id" = old_row."id"
    WHERE (
      old_row."conversation_id",
      old_row."sent_at",
      old_row."sender_type",
      old_row."sent_via"
    ) IS DISTINCT FROM (
      new_row."conversation_id",
      new_row."sent_at",
      new_row."sender_type",
      new_row."sent_via"
    )
  ), aggregate_state AS (
    SELECT a.id,
           MAX(m."sent_at") FILTER (WHERE m."sender_type" = 'contact') AS last_inbound,
           MAX(m."sent_at") FILTER (WHERE m."sender_type" = 'self') AS last_self,
           MAX(m."sent_at") FILTER (
             WHERE m."sender_type" = 'self'
               AND m."sent_via" IN ('user', 'user_native')
           ) AS last_sale
    FROM affected a
    LEFT JOIN "messages" m ON m."conversation_id" = a.id
    GROUP BY a.id
  )
  UPDATE "conversations" cv
  SET "last_inbound_message_at" = agg.last_inbound,
      "last_self_message_at" = agg.last_self,
      "last_sale_message_at" = agg.last_sale,
      "message_reply_state" = "calculate_conversation_message_reply_state"(
        agg.last_inbound,
        agg.last_self,
        agg.last_sale
      )
  FROM aggregate_state agg
  WHERE cv."id" = agg.id;

  RETURN NULL;
END
$$;

-- Physical deletes are uncommon, but keeping this path correct prevents drift
-- in maintenance scripts and cascading cleanup.
CREATE OR REPLACE FUNCTION "refresh_conversation_reply_state_after_message_delete"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  WITH affected AS (
    SELECT DISTINCT old_row."conversation_id" AS id
    FROM old_message_rows old_row
  ), aggregate_state AS (
    SELECT a.id,
           MAX(m."sent_at") FILTER (WHERE m."sender_type" = 'contact') AS last_inbound,
           MAX(m."sent_at") FILTER (WHERE m."sender_type" = 'self') AS last_self,
           MAX(m."sent_at") FILTER (
             WHERE m."sender_type" = 'self'
               AND m."sent_via" IN ('user', 'user_native')
           ) AS last_sale
    FROM affected a
    LEFT JOIN "messages" m ON m."conversation_id" = a.id
    GROUP BY a.id
  )
  UPDATE "conversations" cv
  SET "last_inbound_message_at" = agg.last_inbound,
      "last_self_message_at" = agg.last_self,
      "last_sale_message_at" = agg.last_sale,
      "message_reply_state" = "calculate_conversation_message_reply_state"(
        agg.last_inbound,
        agg.last_self,
        agg.last_sale
      )
  FROM aggregate_state agg
  WHERE cv."id" = agg.id;

  RETURN NULL;
END
$$;

CREATE TRIGGER "messages_reply_state_after_insert"
AFTER INSERT ON "messages"
REFERENCING NEW TABLE AS new_message_rows
FOR EACH STATEMENT
EXECUTE FUNCTION "sync_conversation_reply_state_after_message_insert"();

CREATE TRIGGER "messages_reply_state_after_update"
AFTER UPDATE ON "messages"
REFERENCING OLD TABLE AS old_message_rows NEW TABLE AS new_message_rows
FOR EACH STATEMENT
EXECUTE FUNCTION "refresh_conversation_reply_state_after_message_update"();

CREATE TRIGGER "messages_reply_state_after_delete"
AFTER DELETE ON "messages"
REFERENCING OLD TABLE AS old_message_rows
FOR EACH STATEMENT
EXECUTE FUNCTION "refresh_conversation_reply_state_after_message_delete"();

-- Backfill after triggers exist so concurrent inserts cannot fall into a gap.
WITH aggregate_state AS (
  SELECT cv."id",
         MAX(m."sent_at") FILTER (WHERE m."sender_type" = 'contact') AS last_inbound,
         MAX(m."sent_at") FILTER (WHERE m."sender_type" = 'self') AS last_self,
         MAX(m."sent_at") FILTER (
           WHERE m."sender_type" = 'self'
             AND m."sent_via" IN ('user', 'user_native')
         ) AS last_sale
  FROM "conversations" cv
  LEFT JOIN "messages" m ON m."conversation_id" = cv."id"
  GROUP BY cv."id"
)
UPDATE "conversations" cv
SET "last_inbound_message_at" = agg.last_inbound,
    "last_self_message_at" = agg.last_self,
    "last_sale_message_at" = agg.last_sale,
    "message_reply_state" = "calculate_conversation_message_reply_state"(
      agg.last_inbound,
      agg.last_self,
      agg.last_sale
    )
FROM aggregate_state agg
WHERE cv."id" = agg.id;

COMMIT;
