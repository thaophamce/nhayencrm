-- P1-02: serve the chat thread's exact ordering directly from a B-tree.
--
-- The existing (conversation_id, zalo_msg_id_num DESC) index stores NULL values
-- first for DESC. Chat requests explicitly use DESC NULLS LAST and then sent_at
-- DESC, so PostgreSQL otherwise reads and sorts the entire conversation before
-- applying LIMIT 100.
--
-- CONCURRENTLY avoids blocking message reads/writes while this index is built.
-- Keep this migration to exactly one executable statement: PostgreSQL forbids
-- CREATE INDEX CONCURRENTLY inside a transaction block. See README.md in this
-- directory for preflight, failed-build recovery, verification, and rollback.
CREATE INDEX CONCURRENTLY
  "messages_conversation_zalo_num_sent_at_order_idx"
  ON "messages" (
    "conversation_id",
    "zalo_msg_id_num" DESC NULLS LAST,
    "sent_at" DESC
  );
