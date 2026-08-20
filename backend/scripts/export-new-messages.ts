import pg from 'pg';
import fs from 'fs';

const { Client } = pg;

async function main() {
  const localClient = new Client({
    connectionString: 'postgresql://crmuser:ccc391ded4c548dfaf4f234733a6f143@localhost:5433/zalocrm'
  });

  await localClient.connect();

  console.log('Đang lấy messages mới từ LOCAL (sau 15:15:23 VPS time)...');

  // VPS time 15:15:23 = UTC 08:15:23
  const messages = await localClient.query(`
    SELECT
      m.id,
      m.conversation_id,
      m.zalo_msg_id,
      m.sent_at,
      m.sender_type,
      m.sender_uid,
      m.sender_name,
      m.content,
      m.content_type,
      m.attachments,
      m.quote,
      m.is_deleted,
      m.deleted_at,
      m.created_at,
      m.album_index,
      m.album_key,
      m.album_total,
      m.sent_via,
      m.zalo_msg_id_num,
      m.original_content,
      m.edited_at,
      m.zalo_cli_msg_id,
      m.delivered_at,
      m.seen_at,
      m.is_local,
      m.metadata,
      m.automation_task_id,
      m.automation_step_index,
      m.mentions,
      m.client_echo_id,
      m.replied_by_user_id
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE c.zalo_account_id = '75531187-1d0f-44d9-a75b-08cb0c8204c3'
      AND m.sent_at > '2026-08-16T08:15:23Z'
    ORDER BY m.sent_at
  `);

  console.log(`Tìm thấy ${messages.rows.length} tin nhắn mới`);

  const msgLines: string[] = [];
  for (const msg of messages.rows) {
    const escape = (str: string) => str ? str.replace(/'/g, "''") : '';
    const toISO = (date: any) => date ? new Date(date).toISOString() : null;

    const values = [
      msg.id ? `'${msg.id}'` : 'NULL',
      msg.conversation_id ? `'${msg.conversation_id}'` : 'NULL',
      msg.zalo_msg_id ? `'${msg.zalo_msg_id}'` : 'NULL',
      msg.sender_type ? `'${msg.sender_type}'` : 'NULL',
      msg.sender_uid ? `'${msg.sender_uid}'` : 'NULL',
      msg.sender_name ? `'${escape(msg.sender_name)}'` : 'NULL',
      msg.content ? `'${escape(msg.content)}'` : 'NULL',
      msg.content_type ? `'${msg.content_type}'` : 'NULL',
      msg.attachments ? `'${escape(JSON.stringify(msg.attachments))}'` : 'NULL',
      msg.is_deleted !== null ? msg.is_deleted : 'false',
      toISO(msg.deleted_at) ? `'${toISO(msg.deleted_at)}'` : 'NULL',
      toISO(msg.sent_at) ? `'${toISO(msg.sent_at)}'` : 'NULL',
      msg.replied_by_user_id ? `'${msg.replied_by_user_id}'` : 'NULL',
      toISO(msg.created_at) ? `'${toISO(msg.created_at)}'` : 'NULL',
      msg.album_index !== null ? msg.album_index : 'NULL',
      msg.album_key ? `'${msg.album_key}'` : 'NULL',
      msg.album_total !== null ? msg.album_total : 'NULL',
      msg.quote ? `'${escape(JSON.stringify(msg.quote))}'` : 'NULL',
      msg.sent_via ? `'${msg.sent_via}'` : 'NULL',
      msg.zalo_msg_id_num !== null ? msg.zalo_msg_id_num : 'NULL',
      msg.original_content ? `'${escape(msg.original_content)}'` : 'NULL',
      toISO(msg.edited_at) ? `'${toISO(msg.edited_at)}'` : 'NULL',
      msg.zalo_cli_msg_id ? `'${msg.zalo_cli_msg_id}'` : 'NULL',
      toISO(msg.delivered_at) ? `'${toISO(msg.delivered_at)}'` : 'NULL',
      toISO(msg.seen_at) ? `'${toISO(msg.seen_at)}'` : 'NULL',
      msg.is_local !== null ? msg.is_local : 'false',
      msg.metadata ? `'${escape(JSON.stringify(msg.metadata))}'` : 'NULL',
      msg.automation_task_id ? `'${msg.automation_task_id}'` : 'NULL',
      msg.automation_step_index !== null ? msg.automation_step_index : 'NULL',
      msg.mentions ? `'${escape(JSON.stringify(msg.mentions))}'` : 'NULL',
      msg.client_echo_id ? `'${msg.client_echo_id}'` : 'NULL'
    ];

    msgLines.push(`INSERT INTO messages (id, conversation_id, zalo_msg_id, sender_type, sender_uid, sender_name, content, content_type, attachments, is_deleted, deleted_at, sent_at, replied_by_user_id, created_at, album_index, album_key, album_total, quote, sent_via, zalo_msg_id_num, original_content, edited_at, zalo_cli_msg_id, delivered_at, seen_at, is_local, metadata, automation_task_id, automation_step_index, mentions, client_echo_id) VALUES (${values.join(', ')}) ON CONFLICT (id) DO NOTHING;`);
  }

  fs.writeFileSync('scripts/new-messages-insert.sql', msgLines.join('\n'));
  console.log(`Đã export ${msgLines.length} messages mới vào scripts/new-messages-insert.sql`);

  await localClient.end();
}

main().catch(console.error);
