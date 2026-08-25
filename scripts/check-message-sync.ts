// Script kiểm tra đồng bộ tin nhắn nick Thiệp Cưới giữa local và VPS
// Chạy: cd backend && npx tsx ../scripts/check-message-sync.ts

import { PrismaClient } from '../backend/node_modules/@prisma/client/index.js';

const LOCAL_DB = 'postgresql://crmuser:ccc391ded4c548dfaf4f234733a6f143@localhost:5433/zalocrm';
const VPS_DB = 'postgresql://crmuser:ccc391ded4c548dfaf4f234733a6f143@103.172.78.245:5432/zalocrm';

async function checkSync() {
  console.log('=== KIỂM TRA ĐỒNG BỘ TIN NHẮN THIỆP CƯỚI ===\n');

  // Connect to LOCAL
  const localPrisma = new PrismaClient({
    datasources: { db: { url: LOCAL_DB } },
  });

  // Connect to VPS
  const vpsPrisma = new PrismaClient({
    datasources: { db: { url: VPS_DB } },
  });

  try {
    // 1. Tìm account Thiệp Cưới
    console.log('1. TÌM ACCOUNT THIỆP CƯỚI...');

    const localAccount = await localPrisma.zaloAccount.findFirst({
      where: {
        OR: [
          { zaloName: { contains: 'Thiệp Cưới', mode: 'insensitive' } },
          { zaloName: { contains: 'Thiep Cuoi', mode: 'insensitive' } },
        ],
      },
      orderBy: { connectedAt: 'desc' },
    });

    if (!localAccount) {
      console.log('   ✗ Không tìm thấy account trên LOCAL');
      return;
    }

    console.log(`   ✓ LOCAL: ${localAccount.zaloName}`);
    console.log(`     ID: ${localAccount.id}`);
    console.log(`     UID: ${localAccount.zaloUid}`);
    console.log(`     Status: ${localAccount.status}\n`);

    const vpsAccount = await vpsPrisma.zaloAccount.findFirst({
      where: {
        OR: [
          { zaloName: { contains: 'Thiệp Cưới', mode: 'insensitive' } },
          { zaloName: { contains: 'Thiep Cuoi', mode: 'insensitive' } },
        ],
      },
      orderBy: { connectedAt: 'desc' },
    });

    if (!vpsAccount) {
      console.log('   ✗ Không tìm thấy account trên VPS');
      return;
    }

    console.log(`   ✓ VPS: ${vpsAccount.zaloName}`);
    console.log(`     ID: ${vpsAccount.id}`);
    console.log(`     UID: ${vpsAccount.zaloUid}`);
    console.log(`     Status: ${vpsAccount.status}\n`);

    // 2. Thống kê conversation và message
    console.log('2. THỐNG KÊ LOCAL...');
    const localConvs = await localPrisma.conversation.findMany({
      where: { zaloAccountId: localAccount.id },
      include: { _count: { select: { messages: true } } },
    });

    const localStats = {
      dm: localConvs.filter(c => c.threadType === 'dm').length,
      dmMessages: localConvs
        .filter(c => c.threadType === 'dm')
        .reduce((sum, c) => sum + c._count.messages, 0),
      group: localConvs.filter(c => c.threadType === 'group').length,
      groupMessages: localConvs
        .filter(c => c.threadType === 'group')
        .reduce((sum, c) => sum + c._count.messages, 0),
    };

    console.log(`   DM: ${localStats.dm} conversations, ${localStats.dmMessages} messages`);
    console.log(`   Group: ${localStats.group} conversations, ${localStats.groupMessages} messages`);
    console.log(`   TỔNG: ${localStats.dmMessages + localStats.groupMessages} tin nhắn\n`);

    console.log('3. THỐNG KÊ VPS...');
    const vpsConvs = await vpsPrisma.conversation.findMany({
      where: { zaloAccountId: vpsAccount.id },
      include: { _count: { select: { messages: true } } },
    });

    const vpsStats = {
      dm: vpsConvs.filter(c => c.threadType === 'dm').length,
      dmMessages: vpsConvs
        .filter(c => c.threadType === 'dm')
        .reduce((sum, c) => sum + c._count.messages, 0),
      group: vpsConvs.filter(c => c.threadType === 'group').length,
      groupMessages: vpsConvs
        .filter(c => c.threadType === 'group')
        .reduce((sum, c) => sum + c._count.messages, 0),
    };

    console.log(`   DM: ${vpsStats.dm} conversations, ${vpsStats.dmMessages} messages`);
    console.log(`   Group: ${vpsStats.group} conversations, ${vpsStats.groupMessages} messages`);
    console.log(`   TỔNG: ${vpsStats.dmMessages + vpsStats.groupMessages} tin nhắn\n`);

    // 4. So sánh
    console.log('4. SO SÁNH...');
    const dmDiff = localStats.dmMessages - vpsStats.dmMessages;
    const groupDiff = localStats.groupMessages - vpsStats.groupMessages;
    const totalDiff = dmDiff + groupDiff;

    console.log(`   DM: ${dmDiff >= 0 ? '+' : ''}${dmDiff}`);
    console.log(`   Group: ${groupDiff >= 0 ? '+' : ''}${groupDiff}`);
    console.log(`   TỔNG CHÊNH LỆCH: ${totalDiff >= 0 ? '+' : ''}${totalDiff} tin\n`);

    if (totalDiff > 0) {
      console.log('   ⚠️  LOCAL có nhiều tin hơn VPS - cần đồng bộ!');
    } else if (totalDiff < 0) {
      console.log('   ⚠️  VPS có nhiều tin hơn LOCAL - bất thường!');
    } else {
      console.log('   ✓ Đã đồng bộ hoàn toàn');
    }

    // 5. Top conversations gần nhất
    console.log('\n5. TOP 10 HỘI THOẠI GẦN NHẤT - LOCAL...');
    const localRecent = await localPrisma.message.groupBy({
      by: ['conversationId'],
      where: {
        conversation: { zaloAccountId: localAccount.id },
      },
      _count: { id: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
      take: 10,
    });

    for (const msg of localRecent) {
      const conv = await localPrisma.conversation.findUnique({
        where: { id: msg.conversationId },
        select: { displayName: true, threadType: true, externalThreadId: true },
      });
      console.log(
        `   ${conv?.displayName || 'N/A'} (${conv?.threadType}): ${msg._count.id} tin, mới nhất ${msg._max.createdAt?.toISOString().split('T')[0]}`,
      );
    }

    console.log('\n6. TOP 10 HỘI THOẠI GẦN NHẤT - VPS...');
    const vpsRecent = await vpsPrisma.message.groupBy({
      by: ['conversationId'],
      where: {
        conversation: { zaloAccountId: vpsAccount.id },
      },
      _count: { id: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
      take: 10,
    });

    for (const msg of vpsRecent) {
      const conv = await vpsPrisma.conversation.findUnique({
        where: { id: msg.conversationId },
        select: { displayName: true, threadType: true, externalThreadId: true },
      });
      console.log(
        `   ${conv?.displayName || 'N/A'} (${conv?.threadType}): ${msg._count.id} tin, mới nhất ${msg._max.createdAt?.toISOString().split('T')[0]}`,
      );
    }
  } finally {
    await localPrisma.$disconnect();
    await vpsPrisma.$disconnect();
  }

  console.log('\n=== HOÀN TẤT ===');
}

checkSync().catch(console.error);
