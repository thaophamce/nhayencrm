-- This migration must remain a single statement: PostgreSQL does not allow
-- CREATE INDEX CONCURRENTLY inside an explicit transaction.
CREATE INDEX CONCURRENTLY "conversations_reply_state_scope_order_idx"
ON "conversations"(
  "org_id",
  "threadType",
  "message_reply_state",
  "tab",
  "zalo_account_id",
  "last_message_at" DESC NULLS LAST
);
