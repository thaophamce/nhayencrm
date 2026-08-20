BEGIN;
CREATE TEMP TABLE temp_test (LIKE conversations INCLUDING ALL);
\COPY temp_test FROM '/tmp/sample.csv' CSV HEADER
SELECT 'Imported rows: ' || COUNT(*) FROM temp_test;
INSERT INTO conversations SELECT * FROM temp_test ON CONFLICT (id) DO NOTHING;
SELECT 'After insert: ' || COUNT(*) FROM conversations WHERE id IN (SELECT id FROM temp_test);
COMMIT;
