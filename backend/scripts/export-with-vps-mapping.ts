import pg from 'pg';
import fs from 'fs';
import { vpsMapping } from './vps-mapping-full.js';

const { Client } = pg;

async function main() {
  const localClient = new Client({
    connectionString: 'postgresql://crmuser:ccc391ded4c548dfaf4f234733a6f143@localhost:5433/zalocrm'
  });

  await localClient.connect();

  console.log('Lấy messages mới từ LOCAL...');

  const messages = await localClient.query(`
    SELECT
      m.id,
      m.conversation_id,
      c.external_thread_id,
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
      AND m.sent_at > '2026-08-16T15:15:23.807Z'
    ORDER BY m.sent_at
  `);

  console.log(`Có ${messages.rows.length} messages mới từ LOCAL`);

  const msgLines: string[] = [];
  let skipped = 0;

  for (const msg of messages.rows) {
    const vpsConvId = vpsMapping[msg.external_thread_id];

    if (!vpsConvId) {
      console.log(`Skip message ${msg.id} - không tìm thấy VPS conversation cho thread ${msg.external_thread_id}`);
      skipped++;
      continue;
    }

    const escapeText = (str: string) => str ? str.replace(/'/g, "''") : '';
    const escapeJson = (obj: any) => {
      if (!obj) return 'NULL';
      // Use dollar-quoted strings for JSON to avoid escaping issues
      const json = JSON.stringify(obj);
      return `$$${json}$$::jsonb`;
    };
    const toISO = (date: any) => date ? new Date(date).toISOString() : null;

    const values = [
      msg.id ? `'${msg.id}'` : 'NULL',
      `'${vpsConvId}'`,
      msg.zalo_msg_id ? `'${msg.zalo_msg_id}'` : 'NULL',
      msg.sender_type ? `'${msg.sender_type}'` : 'NULL',
      msg.sender_uid ? `'${msg.sender_uid}'` : 'NULL',
      msg.sender_name ? `'${escapeText(msg.sender_name)}'` : 'NULL',
      msg.content ? `'${escapeText(msg.content)}'` : 'NULL',
      msg.content_type ? `'${msg.content_type}'` : 'NULL',
      msg.attachments ? escapeJson(msg.attachments) : 'NULL',
      msg.is_deleted !== null ? msg.is_deleted : 'false',
      toISO(msg.deleted_at) ? `'${toISO(msg.deleted_at)}'` : 'NULL',
      toISO(msg.sent_at) ? `'${toISO(msg.sent_at)}'` : 'NULL',
      msg.replied_by_user_id ? `'${msg.replied_by_user_id}'` : 'NULL',
      toISO(msg.created_at) ? `'${toISO(msg.created_at)}'` : 'NULL',
      msg.album_index !== null ? msg.album_index : 'NULL',
      msg.album_key ? `'${msg.album_key}'` : 'NULL',
      msg.album_total !== null ? msg.album_total : 'NULL',
      msg.quote ? escapeJson(msg.quote) : 'NULL',
      msg.sent_via ? `'${msg.sent_via}'` : 'NULL',
      msg.zalo_msg_id_num !== null ? msg.zalo_msg_id_num : 'NULL',
      msg.original_content ? `'${escapeText(msg.original_content)}'` : 'NULL',
      toISO(msg.edited_at) ? `'${toISO(msg.edited_at)}'` : 'NULL',
      msg.zalo_cli_msg_id ? `'${msg.zalo_cli_msg_id}'` : 'NULL',
      toISO(msg.delivered_at) ? `'${toISO(msg.delivered_at)}'` : 'NULL',
      toISO(msg.seen_at) ? `'${toISO(msg.seen_at)}'` : 'NULL',
      msg.is_local !== null ? msg.is_local : 'false',
      msg.metadata ? escapeJson(msg.metadata) : 'NULL',
      msg.automation_task_id ? `'${msg.automation_task_id}'` : 'NULL',
      msg.automation_step_index !== null ? msg.automation_step_index : 'NULL',
      msg.mentions ? escapeJson(msg.mentions) : 'NULL',
      msg.client_echo_id ? `'${msg.client_echo_id}'` : 'NULL'
    ];

    msgLines.push(`INSERT INTO messages (id, conversation_id, zalo_msg_id, sender_type, sender_uid, sender_name, content, content_type, attachments, is_deleted, deleted_at, sent_at, replied_by_user_id, created_at, album_index, album_key, album_total, quote, sent_via, zalo_msg_id_num, original_content, edited_at, zalo_cli_msg_id, delivered_at, seen_at, is_local, metadata, automation_task_id, automation_step_index, mentions, client_echo_id) VALUES (${values.join(', ')}) ON CONFLICT (id) DO UPDATE SET conversation_id = EXCLUDED.conversation_id, zalo_msg_id = EXCLUDED.zalo_msg_id, sender_type = EXCLUDED.sender_type, sender_uid = EXCLUDED.sender_uid, sender_name = EXCLUDED.sender_name, content = EXCLUDED.content, content_type = EXCLUDED.content_type, attachments = EXCLUDED.attachments, is_deleted = EXCLUDED.is_deleted, deleted_at = EXCLUDED.deleted_at, sent_at = EXCLUDED.sent_at, replied_by_user_id = EXCLUDED.replied_by_user_id, album_index = EXCLUDED.album_index, album_key = EXCLUDED.album_key, album_total = EXCLUDED.album_total, quote = EXCLUDED.quote, sent_via = EXCLUDED.sent_via, zalo_msg_id_num = EXCLUDED.zalo_msg_id_num, original_content = EXCLUDED.original_content, edited_at = EXCLUDED.edited_at, zalo_cli_msg_id = EXCLUDED.zalo_cli_msg_id, delivered_at = EXCLUDED.delivered_at, seen_at = EXCLUDED.seen_at, is_local = EXCLUDED.is_local, metadata = EXCLUDED.metadata, automation_task_id = EXCLUDED.automation_task_id, automation_step_index = EXCLUDED.automation_step_index, mentions = EXCLUDED.mentions, client_echo_id = EXCLUDED.client_echo_id;`);
  }

  fs.writeFileSync('scripts/final-mapped-messages.sql', msgLines.join('\n'));
  console.log(`✓ Export ${msgLines.length} messages (skipped ${skipped})`);

  await localClient.end();
}

main().catch(console.error);
