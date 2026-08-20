import pg from 'pg';
import fs from 'fs';

const { Client } = pg;

async function main() {
  const localClient = new Client({
    connectionString: 'postgresql://crmuser:ccc391ded4c548dfaf4f234733a6f143@localhost:5433/zalocrm'
  });

  await localClient.connect();

  // Lấy những conversation_id từ messages mới nhưng chưa có trên VPS
  const missingConvIds = [
    'af51eaf2-30b2-41be-945d-c64cce4570f1',
    '331afb5c-a012-45a1-9517-1e29e5c60b43',
    'c902e65c-8a1c-493e-b262-bc7cdf95d334',
    'af7c5806-5615-4b3f-944e-7f2cec9b56a4'
  ];

  console.log(`Đang lấy ${missingConvIds.length} conversations thiếu...`);

  const conversations = await localClient.query(`
    SELECT
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
    WHERE c.id = ANY($1::text[])
  `, [missingConvIds]);

  console.log(`Tìm thấy ${conversations.rows.length} conversations`);

  const convLines: string[] = [];
  for (const conv of conversations.rows) {
    const toISO = (date: any) => date ? new Date(date).toISOString() : null;

    const values = [
      conv.id ? `'${conv.id}'` : 'NULL',
      conv.org_id ? `'${conv.org_id}'` : 'NULL',
      conv.zalo_account_id ? `'${conv.zalo_account_id}'` : 'NULL',
      conv.contact_id ? `'${conv.contact_id}'` : 'NULL',
      conv.external_thread_id ? `'${conv.external_thread_id}'` : 'NULL',
      conv.threadType ? `'${conv.threadType}'` : 'NULL',
      toISO(conv.last_message_at) ? `'${toISO(conv.last_message_at)}'` : 'NULL',
      conv.silence_label ? `'${conv.silence_label}'` : 'NULL',
      conv.unread_count !== null ? conv.unread_count : '0',
      conv.is_replied !== null ? conv.is_replied : 'true',
      toISO(conv.last_inbound_message_at) ? `'${toISO(conv.last_inbound_message_at)}'` : 'NULL',
      toISO(conv.last_self_message_at) ? `'${toISO(conv.last_self_message_at)}'` : 'NULL',
      toISO(conv.last_sale_message_at) ? `'${toISO(conv.last_sale_message_at)}'` : 'NULL',
      conv.message_reply_state ? `'${conv.message_reply_state}'` : 'NULL',
      conv.tab ? `'${conv.tab}'` : "'main'",
      conv.is_virtual !== null ? conv.is_virtual : 'false',
      toISO(conv.deleted_at) ? `'${toISO(conv.deleted_at)}'` : 'NULL',
      toISO(conv.created_at) ? `'${toISO(conv.created_at)}'` : 'NULL'
    ];

    convLines.push(`INSERT INTO conversations (id, org_id, zalo_account_id, contact_id, external_thread_id, "threadType", last_message_at, silence_label, unread_count, is_replied, last_inbound_message_at, last_self_message_at, last_sale_message_at, message_reply_state, tab, is_virtual, deleted_at, created_at) VALUES (${values.join(', ')}) ON CONFLICT (id) DO UPDATE SET last_message_at = EXCLUDED.last_message_at, unread_count = EXCLUDED.unread_count;`);
  }

  fs.writeFileSync('scripts/missing-conversations-insert.sql', convLines.join('\n'));
  console.log(`Đã export ${convLines.length} conversations vào scripts/missing-conversations-insert.sql`);

  await localClient.end();
}

main().catch(console.error);
