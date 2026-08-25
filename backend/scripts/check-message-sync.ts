// Script kiểm tra tin nhắn nick Thiệp Cưới
// LOCAL: cd backend && npx tsx scripts/check-message-sync.ts
// VPS: cd backend && DATABASE_URL="postgresql://crmuser:ccc391ded4c548dfaf4f234733a6f143@localhost:5432/zalocrm" npx tsx scripts/check-message-sync.ts

import pkg from 'pg';
const { Client } = pkg;

const DB_URL = process.env.DATABASE_URL || 'postgresql://crmuser:ccc391ded4c548dfaf4f234733a6f143@localhost:5433/zalocrm';

// Parse connection string
const urlMatch = DB_URL.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
if (!urlMatch) {
  console.error('Invalid DATABASE_URL format');
  process.exit(1);
}

const [, user, password, host, port, database] = urlMatch;
const isVPS = host !== 'localhost' || port === '5432';
const location = isVPS ? 'VPS' : 'LOCAL';

async function checkSync() {
  console.log(`=== KIỂM TRA TIN NHẮN THIỆP CƯỚI - ${location} ===\n`);

  const client = new Client({ host, port: parseInt(port), user, password, database });

  try {
    await client.connect();
    console.log(`✓ Kết nối ${location} thành công\n`);

    // 1. Tìm account Thiệp Cưới
    console.log('1. TÌM ACCOUNT THIỆP CƯỚI...');

    const findAccountQuery = `
      SELECT id, display_name, zalo_uid, status, last_connected_at
      FROM zalo_accounts
      WHERE display_name ILIKE '%thiệp cưới%' OR display_name ILIKE '%thiep cuoi%'
      ORDER BY last_connected_at DESC NULLS LAST
      LIMIT 1;
    `;

    const accountRes = await client.query(findAccountQuery);
    if (accountRes.rows.length === 0) {
      console.log(`   ✗ Không tìm thấy account trên ${location}`);
      return;
    }
    const account = accountRes.rows[0];

    console.log(`   ✓ Tìm thấy: ${account.display_name}`);
    console.log(`     ID: ${account.id}`);
    console.log(`     UID: ${account.zalo_uid}`);
    console.log(`     Status: ${account.status}`);
    console.log(`     Connected: ${account.last_connected_at}\n`);

    // 2. Thống kê
    const statsQuery = `
      SELECT
        c."threadType",
        COUNT(DISTINCT c.id) as conv_count,
        COUNT(m.id) as msg_count,
        MIN(m.sent_at) as first_msg,
        MAX(m.sent_at) as last_msg
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE c.zalo_account_id = $1
      GROUP BY c."threadType";
    `;

    console.log('2. THỐNG KÊ TỔNG QUAN...');
    const statsRes = await client.query(statsQuery, [account.id]);

    let totalConv = 0;
    let totalMsg = 0;

    for (const row of statsRes.rows) {
      const conv = parseInt(row.conv_count);
      const msg = parseInt(row.msg_count);
      totalConv += conv;
      totalMsg += msg;

      const first = row.first_msg ? new Date(row.first_msg).toISOString().split('T')[0] : 'N/A';
      const last = row.last_msg ? new Date(row.last_msg).toISOString().split('T')[0] : 'N/A';

      console.log(`   ${row.threadType.toUpperCase()}: ${conv} conversations, ${msg} messages`);
      console.log(`        Tin đầu: ${first}, Tin cuối: ${last}`);
    }

    console.log(`   ────────────────────────────────────────`);
    console.log(`   TỔNG: ${totalConv} conversations, ${totalMsg} tin nhắn\n`);

    // 3. Top conversations gần nhất
    const topQuery = `
      SELECT
        c.group_name,
        c."threadType",
        c.external_thread_id,
        COUNT(m.id) as msg_count,
        MIN(m.sent_at) as first_msg,
        MAX(m.sent_at) as last_msg
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE c.zalo_account_id = $1
      GROUP BY c.id, c.group_name, c."threadType", c.external_thread_id
      HAVING COUNT(m.id) > 0
      ORDER BY last_msg DESC NULLS LAST
      LIMIT 15;
    `;

    console.log('3. TOP 15 HỘI THOẠI GẦN NHẤT...');
    const topRes = await client.query(topQuery, [account.id]);

    for (const row of topRes.rows) {
      const first = row.first_msg ? new Date(row.first_msg).toISOString().split('T')[0] : 'N/A';
      const last = row.last_msg ? new Date(row.last_msg).toISOString().split('T')[0] : 'N/A';
      const type = row.threadType === 'dm' ? 'DM' : 'GR';
      console.log(`   [${type}] ${row.group_name || 'N/A'}`);
      console.log(`        ${row.msg_count} tin (${first} → ${last})`);
    }

    // 4. Tin nhắn gần nhất
    const recentMsgQuery = `
      SELECT
        m.content_type,
        LEFT(m.content, 60) as preview,
        m.sent_at,
        m.sender_type,
        c.group_name,
        c."threadType"
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.zalo_account_id = $1
      ORDER BY m.sent_at DESC
      LIMIT 10;
    `;

    console.log('\n4. 10 TIN NHẮN MỚI NHẤT...');
    const recentRes = await client.query(recentMsgQuery, [account.id]);

    for (const row of recentRes.rows) {
      const time = new Date(row.sent_at).toISOString().replace('T', ' ').substring(0, 19);
      const direction = row.sender_type === 'self' ? '→' : '←';
      const type = row.threadType === 'dm' ? 'DM' : 'GR';
      console.log(`   ${time} [${type}] ${direction} ${row.group_name || 'N/A'}`);
      console.log(`        [${row.content_type}] ${row.preview || '(empty)'}...`);
    }

  } catch (error) {
    console.error(`✗ Lỗi kết nối ${location}:`, error.message);
  } finally {
    await client.end();
  }

  console.log('\n=== HOÀN TẤT ===');
}

checkSync().catch(console.error);
