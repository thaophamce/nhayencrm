-- Keep this migration to one statement: PostgreSQL forbids concurrent index
-- creation inside an explicit transaction.
CREATE INDEX CONCURRENTLY "activity_logs_friend_request_stats_idx"
ON "activity_logs" ("org_id", "created_at")
WHERE "action" = 'friend_request_received';
