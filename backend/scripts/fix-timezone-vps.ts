import pg from 'pg';
import fs from 'fs';

const { Client } = pg;

async function main() {
  const localClient = new Client({
    connectionString: 'postgresql://crmuser:ccc391ded4c548dfaf4f234733a6f143@localhost:5433/zalocrm'
  });

  await localClient.connect();

  console.log('Lấy danh sách message IDs cần fix từ LOCAL...');

  // Lấy các message IDs đã export (sau 15:15:23)
  const messages = await localClient.query(`
    SELECT m.id
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE c.zalo_account_id = '75531187-1d0f-44d9-a75b-08cb0c8204c3'
      AND m.sent_at > '2026-08-16T15:15:23.807Z'
    ORDER BY m.sent_at
  `);

  console.log(`Có ${messages.rows.length} messages cần fix timezone`);

  if (messages.rows.length === 0) {
    await localClient.end();
    return;
  }

  // Tạo SQL để update timezone - cộng 7 giờ
  const sqlLines: string[] = [];

  for (const msg of messages.rows) {
    sqlLines.push(`UPDATE messages SET sent_at = sent_at + INTERVAL '7 hours' WHERE id = '${msg.id}';`);
  }

  fs.writeFileSync('scripts/fix-timezone.sql', sqlLines.join('\n'));
  console.log('Đã tạo file scripts/fix-timezone.sql');

  await localClient.end();
}

main().catch(console.error);
