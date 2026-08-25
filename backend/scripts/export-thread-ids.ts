import pg from 'pg';
import fs from 'fs';

const { Client } = pg;

async function main() {
  const localClient = new Client({
    connectionString: 'postgresql://crmuser:ccc391ded4c548dfaf4f234733a6f143@localhost:5433/zalocrm'
  });

  await localClient.connect();

  // Đọc VPS mapping từ file đã query trước
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
      AND m.sent_at >= '2026-08-15T00:00:00Z'
    ORDER BY m.sent_at
  `);

  console.log(`Có ${messages.rows.length} messages mới từ LOCAL`);

  // Lưu external_thread_id để query VPS
  const threadIds = [...new Set(messages.rows.map(m => m.external_thread_id))];

  fs.writeFileSync('scripts/thread-ids.json', JSON.stringify(threadIds));
  console.log(`Lưu ${threadIds.length} thread IDs để query VPS`);

  await localClient.end();
}

main().catch(console.error);
