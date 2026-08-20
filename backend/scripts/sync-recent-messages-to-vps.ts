import pg from 'pg';

const { Client } = pg;

async function main() {
  // LOCAL database
  const localClient = new Client({
    connectionString: 'postgresql://crmuser:ccc391ded4c548dfaf4f234733a6f143@localhost:5433/zalocrm'
  });

  // VPS database
  const vpsClient = new Client({
    host: '103.209.34.224',
    port: 5432,
    user: 'crmuser',
    password: 'ccc391ded4c548dfaf4f234733a6f143',
    database: 'zalocrm'
  });

  await localClient.connect();
  await vpsClient.connect();

  console.log('Đang lấy tin nhắn từ LOCAL (15-16/8)...');

  // Lấy tin nhắn mới từ LOCAL
  const localMessages = await localClient.query(`
    SELECT
      m.id,
      m.msg_id,
      m.conversation_id,
      m.msg_type,
      m.content,
      m.sender_id,
      m.created_at,
      m.attachments,
      m.quote,
      m.links,
      m.mentions
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE c.zalo_account_id = '75531187-1d0f-44d9-a75b-08cb0c8204c3'
      AND m.created_at >= '2026-08-15T00:00:00Z'
    ORDER BY m.created_at ASC
  `);

  console.log(`Tìm thấy ${localMessages.rows.length} tin nhắn từ 15/8 trên LOCAL`);

  if (localMessages.rows.length === 0) {
    console.log('Không có tin nhắn mới để đồng bộ');
    await localClient.end();
    await vpsClient.end();
    return;
  }

  // Kiểm tra tin nào đã có trên VPS
  const localMsgIds = localMessages.rows.map(m => m.msg_id);
  const vpsExisting = await vpsClient.query(`
    SELECT msg_id FROM messages WHERE msg_id = ANY($1::text[])
  `, [localMsgIds]);

  const existingSet = new Set(vpsExisting.rows.map(r => r.msg_id));
  const toInsert = localMessages.rows.filter(m => !existingSet.has(m.msg_id));

  console.log(`Đã có ${existingSet.size} tin trên VPS`);
  console.log(`Cần thêm ${toInsert.length} tin mới`);

  if (toInsert.length === 0) {
    console.log('Tất cả tin nhắn đã đồng bộ');
    await localClient.end();
    await vpsClient.end();
    return;
  }

  // Insert từng tin vào VPS
  let inserted = 0;
  let skipped = 0;

  for (const msg of toInsert) {
    try {
      await vpsClient.query(`
        INSERT INTO messages (
          id, msg_id, conversation_id, msg_type, content,
          sender_id, created_at, attachments, quote, links, mentions
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO NOTHING
      `, [
        msg.id,
        msg.msg_id,
        msg.conversation_id,
        msg.msg_type,
        msg.content,
        msg.sender_id,
        msg.created_at,
        msg.attachments,
        msg.quote,
        msg.links,
        msg.mentions
      ]);
      inserted++;
      if (inserted % 100 === 0) {
        console.log(`Đã insert ${inserted}/${toInsert.length}...`);
      }
    } catch (err: any) {
      console.error(`Lỗi insert msg ${msg.msg_id}:`, err.message);
      skipped++;
    }
  }

  console.log(`\nHoàn thành:`);
  console.log(`- Inserted: ${inserted}`);
  console.log(`- Skipped: ${skipped}`);

  await localClient.end();
  await vpsClient.end();
}

main().catch(console.error);
