import pg from 'pg';

const { Client } = pg;

async function main() {
  const localClient = new Client({
    connectionString: 'postgresql://crmuser:ccc391ded4c548dfaf4f234733a6f143@localhost:5433/zalocrm'
  });

  await localClient.connect();

  // Lấy các message IDs từ LOCAL (hôm qua + hôm nay)
  const localMessages = await localClient.query(`
    SELECT m.id, m.zalo_msg_id, m.sent_at, c.external_thread_id
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE c.zalo_account_id = '75531187-1d0f-44d9-a75b-08cb0c8204c3'
      AND m.sent_at >= '2026-08-15T00:00:00Z'
    ORDER BY m.sent_at DESC
    LIMIT 100
  `);

  console.log(`LOCAL có ${localMessages.rows.length} tin nhắn gần đây`);
  console.log('10 tin mới nhất:');

  for (const msg of localMessages.rows.slice(0, 10)) {
    console.log(`  ${msg.sent_at} - ${msg.id} - thread ${msg.external_thread_id}`);
  }

  await localClient.end();
}

main().catch(console.error);
