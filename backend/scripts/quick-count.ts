import pg from 'pg';

const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: 'postgresql://crmuser:ccc391ded4c548dfaf4f234733a6f143@localhost:5433/zalocrm'
  });

  await client.connect();

  // Đếm messages đơn giản
  const msgCount = await client.query(`
    SELECT COUNT(*) as total
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE c.zalo_account_id = '75531187-1d0f-44d9-a75b-08cb0c8204c3'
  `);

  console.log('Tổng messages LOCAL:', msgCount.rows[0].total);

  // Tin nhắn mới nhất
  const latest = await client.query(`
    SELECT m.created_at
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE c.zalo_account_id = '75531187-1d0f-44d9-a75b-08cb0c8204c3'
    ORDER BY m.created_at DESC
    LIMIT 1
  `);

  console.log('Tin nhắn mới nhất:', latest.rows[0]?.created_at);

  await client.end();
}

main().catch(console.error);
