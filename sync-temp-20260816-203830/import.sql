BEGIN;

-- 1. Import contacts
CREATE TEMP TABLE temp_contacts (LIKE contacts INCLUDING ALL);
\COPY temp_contacts FROM '/tmp/contacts.csv' CSV HEADER
INSERT INTO contacts
    SELECT * FROM temp_contacts
    ON CONFLICT (id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        avatar_url = EXCLUDED.avatar_url,
        updated_at = EXCLUDED.updated_at;
DROP TABLE temp_contacts;

-- 2. Import conversations
CREATE TEMP TABLE temp_conversations (LIKE conversations INCLUDING ALL);
\COPY temp_conversations FROM '/tmp/conversations.csv' CSV HEADER
INSERT INTO conversations
    SELECT * FROM temp_conversations
    ON CONFLICT (id) DO NOTHING;
DROP TABLE temp_conversations;

-- 3. Import messages
CREATE TEMP TABLE temp_messages (LIKE messages INCLUDING ALL);
\COPY temp_messages FROM '/tmp/messages.csv' CSV HEADER
INSERT INTO messages
    SELECT * FROM temp_messages
    ON CONFLICT (id) DO NOTHING;
DROP TABLE temp_messages;

COMMIT;
