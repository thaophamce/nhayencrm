import pg from 'pg';
import fs from 'fs';

const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: 'postgresql://crmuser:ccc391ded4c548dfaf4f234733a6f143@localhost:5433/zalocrm'
  });

  await client.connect();

  console.log('Đang lấy tin nhắn từ LOCAL (15-16/8)...');

  const result = await client.query(`
    SELECT
      m.id,
      m.zalo_msg_id,
      m.zalo_msg_id_num,
      m.conversation_id,
      m.sender_type,
      m.sender_uid,
      m.sender_name,
      m.content,
      m.content_type,
      m.attachments,
      m.quote,
      m.album_key,
      m.album_index,
      m.album_total,
      m.sent_at,
      m.delivered_at,
      m.seen_at,
      m.replied_by_user_id,
      m.sent_via,
      m.is_local,
      m.metadata,
      m.mentions
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE c.zalo_account_id = '75531187-1d0f-44d9-a75b-08cb0c8204c3'
      AND m.sent_at >= '2026-08-15T00:00:00Z'
    ORDER BY m.sent_at ASC
  `);

  console.log(`Tìm thấy ${result.rows.length} tin nhắn từ 15/8`);

  // Export ra file SQL
  const sqlFile = 'scripts/recent-messages-insert.sql';
  const lines: string[] = [];

  for (const msg of result.rows) {
    const values = [
      msg.id ? `'${msg.id}'` : 'NULL',
      msg.zalo_msg_id ? `'${msg.zalo_msg_id}'` : 'NULL',
      msg.zalo_msg_id_num ? `'${msg.zalo_msg_id_num}'` : 'NULL',
      msg.conversation_id ? `'${msg.conversation_id}'` : 'NULL',
      msg.sender_type ? `'${msg.sender_type}'` : 'NULL',
      msg.sender_uid ? `'${msg.sender_uid}'` : 'NULL',
      msg.sender_name ? `'${msg.sender_name.replace(/'/g, "''")}'` : 'NULL',
      msg.content ? `'${msg.content.replace(/'/g, "''")}'` : 'NULL',
      msg.content_type ? `'${msg.content_type}'` : 'NULL',
      msg.attachments ? `'${JSON.stringify(msg.attachments).replace(/'/g, "''")}'::jsonb` : 'NULL',
      msg.quote ? `'${JSON.stringify(msg.quote).replace(/'/g, "''")}'::jsonb` : 'NULL',
      msg.album_key ? `'${msg.album_key}'` : 'NULL',
      msg.album_index !== null ? msg.album_index : 'NULL',
      msg.album_total !== null ? msg.album_total : 'NULL',
      msg.sent_at ? `'${msg.sent_at.toISOString()}'` : 'NULL',
      msg.delivered_at ? `'${msg.delivered_at.toISOString()}'` : 'NULL',
      msg.seen_at ? `'${msg.seen_at.toISOString()}'` : 'NULL',
      msg.replied_by_user_id ? `'${msg.replied_by_user_id}'` : 'NULL',
      msg.sent_via ? `'${msg.sent_via}'` : 'NULL',
      msg.is_local ? `${msg.is_local}` : 'false',
      msg.metadata ? `'${JSON.stringify(msg.metadata).replace(/'/g, "''")}'::jsonb` : 'NULL',
      msg.mentions ? `'${JSON.stringify(msg.mentions).replace(/'/g, "''")}'::jsonb` : 'NULL'
    ];

    lines.push(`INSERT INTO messages (id, zalo_msg_id, zalo_msg_id_num, conversation_id, sender_type, sender_uid, sender_name, content, content_type, attachments, quote, album_key, album_index, album_total, sent_at, delivered_at, seen_at, replied_by_user_id, sent_via, is_local, metadata, mentions) VALUES (${values.join(', ')}) ON CONFLICT (id) DO NOTHING;`);
  }

  fs.writeFileSync(sqlFile, lines.join('\n'), 'utf8');
  console.log(`Đã export ${lines.length} câu INSERT vào ${sqlFile}`);

  await client.end();
}

main().catch(console.error);
