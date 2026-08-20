import pg from 'pg';

const { Client } = pg;

async function main() {
  const localClient = new Client({
    connectionString: 'postgresql://crmuser:ccc391ded4c548dfaf4f234733a6f143@localhost:5433/zalocrm'
  });

  await localClient.connect();

  console.log('Kiểm tra tin nhắn cá nhân mới trên LOCAL...');

  const messages = await localClient.query(`
    SELECT m.id, m.sent_at, m.content, c.external_thread_id, c."threadType"
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE c.zalo_account_id = '75531187-1d0f-44d9-a75b-08cb0c8204c3'
      AND c."threadType" = 'user'
      AND m.sent_at > '2026-08-16T15:10:39.469Z'
    ORDER BY m.sent_at DESC
    LIMIT 20
  `);

  console.log(`\nCó ${messages.rows.length} tin nhắn cá nhân sau 15:10:39\n`);

  for (const msg of messages.rows) {
    const content = msg.content?.substring(0, 100) || '';
    console.log(`${msg.sent_at.toISOString()} - ${msg.external_thread_id} - ${content}`);
  }

  await localClient.end();
}

main().catch(console.error);
