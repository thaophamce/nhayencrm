BEGIN;

-- Step 1: Load contacts into temp table
CREATE TEMP TABLE temp_contacts (LIKE contacts INCLUDING ALL);
\COPY temp_contacts FROM '/tmp/contacts.csv' CSV HEADER

-- Step 2: Create contact ID mapping (local ID -> VPS ID for duplicates)
CREATE TEMP TABLE contact_id_map AS
SELECT
    tc.id AS local_id,
    COALESCE(c.id, tc.id) AS vps_id
FROM temp_contacts tc
LEFT JOIN contacts c ON c.org_id = tc.org_id AND c.zalo_global_id = tc.zalo_global_id;

-- Step 3: Insert only new contacts (skip duplicates)
INSERT INTO contacts
SELECT * FROM temp_contacts
WHERE id NOT IN (SELECT local_id FROM contact_id_map WHERE local_id != vps_id)
ON CONFLICT (id) DO NOTHING;

-- Step 4: Load conversations with mapped contact IDs
CREATE TEMP TABLE temp_conversations (LIKE conversations INCLUDING ALL);
\COPY temp_conversations FROM '/tmp/conversations.csv' CSV HEADER

UPDATE temp_conversations tc
SET contact_id = (SELECT vps_id FROM contact_id_map WHERE local_id = tc.contact_id);

INSERT INTO conversations SELECT * FROM temp_conversations ON CONFLICT (id) DO NOTHING;

-- Step 5: Import messages
CREATE TEMP TABLE temp_messages (LIKE messages INCLUDING ALL);
\COPY temp_messages FROM '/tmp/messages.csv' CSV HEADER
INSERT INTO messages SELECT * FROM temp_messages ON CONFLICT (id) DO NOTHING;

COMMIT;
