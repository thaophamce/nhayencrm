// Script so sánh LOCAL vs VPS từ máy local
import pkg from 'pg';
const { Client } = pkg;

const LOCAL_CONFIG = {
  host: 'localhost',
  port: 5433,
  user: 'crmuser',
  password: 'ccc391ded4c548dfaf4f234733a6f143',
  database: 'zalocrm',
};

// Thử kết nối VPS - cần IP public và port forward
const VPS_CONFIG = {
  host: '103.90.227.154', // IP VPS từ CLOUDFLARE-LINK.txt
  port: 5432,
  user: 'crmuser',
  password: 'ccc391ded4c548dfaf4f234733a6f143',
  database: 'zalocrm',
};

async function getStats(client: any, location: string) {
  const findAccountQuery = `
    SELECT id, display_name, zalo_uid, status, last_connected_at
    FROM zalo_accounts
    WHERE display_name ILIKE '%thiệp cưới%' OR display_name ILIKE '%thiep cuoi%'
    ORDER BY last_connected_at DESC NULLS LAST
    LIMIT 1;
  `;

  const accountRes = await client.query(findAccountQuery);
  if (accountRes.rows.length === 0) {
    return null;
  }

  const account = accountRes.rows[0];

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

  const statsRes = await client.query(statsQuery, [account.id]);

  return {
    account,
    stats: statsRes.rows,
  };
}

async function main() {
  console.log('=== SO SÁNH LOCAL vs VPS ===\n');

  // LOCAL
  console.log('📍 ĐANG KIỂM TRA LOCAL...');
  const localClient = new Client(LOCAL_CONFIG);
  await localClient.connect();
  const localData = await getStats(localClient, 'LOCAL');
  await localClient.end();

  if (!localData) {
    console.log('✗ Không tìm thấy account trên LOCAL\n');
    return;
  }

  let localTotal = { conv: 0, msg: 0 };
  for (const row of localData.stats) {
    localTotal.conv += parseInt(row.conv_count);
    localTotal.msg += parseInt(row.msg_count);
  }

  console.log(`✓ LOCAL: ${localTotal.conv} conversations, ${localTotal.msg} messages\n`);

  // VPS
  console.log('📍 ĐANG KIỂM TRA VPS...');
  try {
    const vpsClient = new Client(VPS_CONFIG);
    await vpsClient.connect();
    const vpsData = await getStats(vpsClient, 'VPS');
    await vpsClient.end();

    if (!vpsData) {
      console.log('✗ Không tìm thấy account trên VPS\n');
      return;
    }

    let vpsTotal = { conv: 0, msg: 0 };
    for (const row of vpsData.stats) {
      vpsTotal.conv += parseInt(row.conv_count);
      vpsTotal.msg += parseInt(row.msg_count);
    }

    console.log(`✓ VPS: ${vpsTotal.conv} conversations, ${vpsTotal.msg} messages\n`);

    // So sánh
    console.log('📊 SO SÁNH:');
    console.log(`   Conversations: ${localTotal.conv} (LOCAL) vs ${vpsTotal.conv} (VPS)`);
    console.log(`   Chênh lệch: ${localTotal.conv - vpsTotal.conv} conversations\n`);
    console.log(`   Messages: ${localTotal.msg} (LOCAL) vs ${vpsTotal.msg} (VPS)`);
    console.log(`   Chênh lệch: ${localTotal.msg - vpsTotal.msg} messages\n`);

    if (localTotal.msg > vpsTotal.msg) {
      console.log(`⚠️  LOCAL có nhiều hơn VPS ${localTotal.msg - vpsTotal.msg} tin nhắn`);
    } else if (vpsTotal.msg > localTotal.msg) {
      console.log(`⚠️  VPS có nhiều hơn LOCAL ${vpsTotal.msg - localTotal.msg} tin nhắn`);
    } else {
      console.log('✓ Dữ liệu đã đồng bộ hoàn toàn!');
    }

  } catch (error) {
    console.log(`✗ Không thể kết nối VPS: ${error.message}`);
    console.log('\n💡 VPS có thể chưa mở port PostgreSQL 5432 ra ngoài.');
    console.log('   Anh cần chạy script check-message-sync-vps.ts trực tiếp trên VPS.');
  }

  console.log('\n=== HOÀN TẤT ===');
}

main().catch(console.error);
