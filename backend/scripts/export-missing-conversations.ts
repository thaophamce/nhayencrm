import pg from 'pg';
import * as fs from 'fs';

const { Client } = pg;

const VPS_MAPPING = {
  '4788966712878755460': '18281edb-e7cf-45c9-b105-bd69dffc4397',
  '353554628586681625': '6f0eee6d-dd17-411c-a5a9-8ed0b9db01d6',
  '713706554213316374': '8da10176-dc55-4d5c-beb2-4e66de1b92f3',
  '1665975115183280367': 'ebca5d7f-5830-4db4-a628-1b2bb625e918'
};

async function main() {
  const localClient = new Client({
    connectionString: 'postgresql://crmuser:ccc391ded4c548dfaf4f234733a6f143@localhost:5433/zalocrm'
  });

  await localClient.connect();

  // Lấy các conversations có messages từ ngày 15/8
  const result = await localClient.query(`
    SELECT DISTINCT c.*
    FROM conversations c
    JOIN messages m ON m.conversation_id = c.id
    WHERE c.zalo_account_id = '75531187-1d0f-44d9-a75b-08cb0c8204c3'
      AND m.sent_at >= '2026-08-15T00:00:00Z'
    ORDER BY c.created_at
  `);

  console.log(`Tìm thấy ${result.rows.length} conversations`);

  const missingConvs = result.rows.filter(c => !VPS_MAPPING[c.external_thread_id]);

  console.log(`Có ${missingConvs.length} conversations chưa có trên VPS`);

  if (missingConvs.length === 0) {
    console.log('Không có conversations thiếu');
    await localClient.end();
    return;
  }

  // Export conversations
  const sqlLines: string[] = [];

  for (const conv of missingConvs) {
    const values = [
      `'${conv.id}'`,
      `'${conv.zalo_account_id}'`,
      `'${conv.external_thread_id}'`,
      conv.thread_type ? `'${conv.thread_type}'` : 'NULL',
      conv.display_name ? `'${conv.display_name.replace(/'/g, "''")}'` : 'NULL',
      conv.avatar_url ? `'${conv.avatar_url}'` : 'NULL',
      conv.last_message_id ? `'${conv.last_message_id}'` : 'NULL',
      conv.last_message_sent_at ? `'${conv.last_message_sent_at.toISOString()}'` : 'NULL',
      conv.last_message_preview ? `'${conv.last_message_preview.replace(/'/g, "''")}'` : 'NULL',
      `'${conv.created_at.toISOString()}'`,
      conv.updated_at ? `'${conv.updated_at.toISOString()}'` : 'NULL',
      `${conv.unread_count || 0}`,
      conv.is_pinned ? 'true' : 'false',
      conv.is_archived ? 'true' : 'false',
      conv.is_blocked ? 'true' : 'false',
      conv.is_muted ? 'true' : 'false',
      conv.muted_until ? `'${conv.muted_until.toISOString()}'` : 'NULL',
      conv.metadata ? `'${JSON.stringify(conv.metadata).replace(/'/g, "''")}'::jsonb` : 'NULL',
      conv.last_synced_at ? `'${conv.last_synced_at.toISOString()}'` : 'NULL',
      conv.assigned_user_id ? `'${conv.assigned_user_id}'` : 'NULL',
      conv.customer_list_id ? `'${conv.customer_list_id}'` : 'NULL'
    ];

    sqlLines.push(`INSERT INTO conversations (id, zalo_account_id, external_thread_id, thread_type, display_name, avatar_url, last_message_id, last_message_sent_at, last_message_preview, created_at, updated_at, unread_count, is_pinned, is_archived, is_blocked, is_muted, muted_until, metadata, last_synced_at, assigned_user_id, customer_list_id) VALUES (${values.join(', ')}) ON CONFLICT (id) DO NOTHING;`);
  }

  fs.writeFileSync('scripts/missing-conversations.sql', sqlLines.join('\n'));
  console.log('Đã export sang scripts/missing-conversations.sql');

  await localClient.end();
}

main().catch(console.error);
