import pg from 'pg';
import fs from 'fs';

const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: 'postgresql://crmuser:ccc391ded4c548dfaf4f234733a6f143@localhost:5433/zalocrm'
  });

  await client.connect();

  console.log('Đang lấy conversations từ LOCAL...');

  // Lấy tất cả conversations có tin nhắn từ 15/8
  const conversations = await client.query(`
    SELECT DISTINCT
      c.id,
      c.org_id,
      c.zalo_account_id,
      c.contact_id,
      c.external_thread_id,
      c."threadType",
      c.last_message_at,
      c.silence_label,
      c.unread_count,
      c.is_replied,
      c.last_inbound_message_at,
      c.last_self_message_at,
      c.last_sale_message_at,
      c.message_reply_state,
      c.tab,
      c.is_virtual,
      c.deleted_at,
      c.created_at
    FROM conversations c
    WHERE c.zalo_account_id = '75531187-1d0f-44d9-a75b-08cb0c8204c3'
      AND EXISTS (
        SELECT 1 FROM messages m
        WHERE m.conversation_id = c.id
        AND m.sent_at >= '2026-08-15T00:00:00Z'
      )
  `);

  console.log(`Tìm thấy ${conversations.rows.length} conversations`);

  const convLines: string[] = [];
  for (const conv of conversations.rows) {
    const values = [
      conv.id ? `'${conv.id}'` : 'NULL',
      conv.org_id ? `'${conv.org_id}'` : 'NULL',
      conv.zalo_account_id ? `'${conv.zalo_account_id}'` : 'NULL',
      conv.contact_id ? `'${conv.contact_id}'` : 'NULL',
      conv.external_thread_id ? `'${conv.external_thread_id}'` : 'NULL',
      conv.threadType ? `'${conv.threadType}'` : 'NULL',
      conv.last_message_at ? `'${conv.last_message_at.toISOString()}'` : 'NULL',
      conv.silence_label ? `'${conv.silence_label}'` : 'NULL',
      conv.unread_count !== null ? conv.unread_count : '0',
      conv.is_replied !== null ? conv.is_replied : 'true',
      conv.last_inbound_message_at ? `'${conv.last_inbound_message_at.toISOString()}'` : 'NULL',
      conv.last_self_message_at ? `'${conv.last_self_message_at.toISOString()}'` : 'NULL',
      conv.last_sale_message_at ? `'${conv.last_sale_message_at.toISOString()}'` : 'NULL',
      conv.message_reply_state ? `'${conv.message_reply_state}'` : 'NULL',
      conv.tab ? `'${conv.tab}'` : "'main'",
      conv.is_virtual !== null ? conv.is_virtual : 'false',
      conv.deleted_at ? `'${conv.deleted_at.toISOString()}'` : 'NULL',
      conv.created_at ? `'${conv.created_at.toISOString()}'` : 'NULL'
    ];

    convLines.push(`INSERT INTO conversations (id, org_id, zalo_account_id, contact_id, external_thread_id, "threadType", last_message_at, silence_label, unread_count, is_replied, last_inbound_message_at, last_self_message_at, last_sale_message_at, message_reply_state, tab, is_virtual, deleted_at, created_at) VALUES (${values.join(', ')}) ON CONFLICT (id) DO UPDATE SET last_message_at = EXCLUDED.last_message_at, unread_count = EXCLUDED.unread_count, is_replied = EXCLUDED.is_replied, last_inbound_message_at = EXCLUDED.last_inbound_message_at, last_self_message_at = EXCLUDED.last_self_message_at, last_sale_message_at = EXCLUDED.last_sale_message_at, message_reply_state = EXCLUDED.message_reply_state;`);
  }

  fs.writeFileSync('scripts/conversations-insert.sql', convLines.join('\n'), 'utf8');
  console.log(`Đã export ${convLines.length} conversations vào scripts/conversations-insert.sql`);

  console.log('\nĐang lấy messages từ LOCAL (15-16/8)...');

  const messages = await client.query(`
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

  console.log(`Tìm thấy ${messages.rows.length} tin nhắn`);

  const msgLines: string[] = [];
  for (const msg of messages.rows) {
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
      msg.attachments ? `'${JSON.stringify(msg.attachments).replace(/'/g, "''")}'::jsonb` : "'[]'::jsonb",
      msg.quote ? `'${JSON.stringify(msg.quote).replace(/'/g, "''")}'::jsonb` : 'NULL',
      msg.album_key ? `'${msg.album_key}'` : 'NULL',
      msg.album_index !== null ? msg.album_index : 'NULL',
      msg.album_total !== null ? msg.album_total : 'NULL',
      msg.sent_at ? `'${msg.sent_at.toISOString()}'` : 'NULL',
      msg.delivered_at ? `'${msg.delivered_at.toISOString()}'` : 'NULL',
      msg.seen_at ? `'${msg.seen_at.toISOString()}'` : 'NULL',
      msg.replied_by_user_id ? `'${msg.replied_by_user_id}'` : 'NULL',
      msg.sent_via ? `'${msg.sent_via}'` : "'user'",
      msg.is_local !== null ? msg.is_local : 'false',
      msg.metadata ? `'${JSON.stringify(msg.metadata).replace(/'/g, "''")}'::jsonb` : 'NULL',
      msg.mentions ? `'${JSON.stringify(msg.mentions).replace(/'/g, "''")}'::jsonb` : 'NULL'
    ];

    msgLines.push(`INSERT INTO messages (id, zalo_msg_id, zalo_msg_id_num, conversation_id, sender_type, sender_uid, sender_name, content, content_type, attachments, quote, album_key, album_index, album_total, sent_at, delivered_at, seen_at, replied_by_user_id, sent_via, is_local, metadata, mentions) VALUES (${values.join(', ')}) ON CONFLICT (id) DO NOTHING;`);
  }

  fs.writeFileSync('scripts/messages-insert.sql', msgLines.join('\n'), 'utf8');
  console.log(`Đã export ${msgLines.length} messages vào scripts/messages-insert.sql`);

  await client.end();
}

main().catch(console.error);
