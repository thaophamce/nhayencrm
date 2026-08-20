import { prisma } from '../src/shared/database/prisma-client.js';
import fs from 'fs';
import path from 'path';

async function verify() {
  console.log('Running Post-Sync Database Verification Audit...\n');

  const THIEP_CUOI_ACCOUNT_ID = '75531187-1d0f-44d9-a75b-08cb0c8204c3';
  const CUTOFF_DATE_UTC = new Date('2026-03-31T17:00:00.000Z'); // 01/04/2026 00:00:00 UTC+7

  // Load excluded group checkpoint
  const excludedFilePath = path.join(process.cwd(), 'excluded_groups_checkpoint.json');
  let excludedConvIds: string[] = [];
  let excludedNames: string[] = [];
  let missingGroups: string[] = [];
  if (fs.existsSync(excludedFilePath)) {
    const raw = fs.readFileSync(excludedFilePath, 'utf8');
    const data = JSON.parse(raw);
    excludedConvIds = data.excludedConversationIds || [];
    excludedNames = data.matchedGroupNames || [];
    missingGroups = data.unmatchedGroupNames || [];
  }

  // 1. Total Pancake Messages in DB for Thiệp Cưới
  const totalPancakeMsgs = await prisma.message.count({
    where: {
      zaloMsgId: { startsWith: 'pancake:' },
      conversation: { zaloAccountId: THIEP_CUOI_ACCOUNT_ID },
    },
  });

  // 2. Count messages before cutoff date (STRICT AUDIT: MUST BE 0)
  const msgsBeforeCutoff = await prisma.message.count({
    where: {
      zaloMsgId: { startsWith: 'pancake:' },
      conversation: { zaloAccountId: THIEP_CUOI_ACCOUNT_ID },
      sentAt: { lt: CUTOFF_DATE_UTC },
    },
  });

  // 3. Count messages in excluded conversations (STRICT AUDIT: MUST BE 0)
  const msgsInExcluded = await prisma.message.count({
    where: {
      zaloMsgId: { startsWith: 'pancake:' },
      conversation: {
        zaloAccountId: THIEP_CUOI_ACCOUNT_ID,
        externalThreadId: { in: excludedConvIds },
      },
    },
  });

  // 4. Check for duplicate Pancake message IDs (STRICT AUDIT: MUST BE 0)
  const duplicates: any[] = await prisma.$queryRaw`
    SELECT "zalo_msg_id", COUNT(*) as count 
    FROM "messages" 
    WHERE "zalo_msg_id" LIKE 'pancake:%' 
    GROUP BY "zalo_msg_id" 
    HAVING COUNT(*) > 1;
  `;

  // 5. Total conversations synced for Thiệp Cưới
  const totalConvs = await prisma.conversation.count({
    where: { zaloAccountId: THIEP_CUOI_ACCOUNT_ID },
  });

  const userConvs = await prisma.conversation.count({
    where: {
      zaloAccountId: THIEP_CUOI_ACCOUNT_ID,
      threadType: 'user',
    },
  });

  const groupConvs = await prisma.conversation.count({
    where: {
      zaloAccountId: THIEP_CUOI_ACCOUNT_ID,
      threadType: 'group',
    },
  });

  // 6. Breakdown by Content Type
  const contentTypes = await prisma.message.groupBy({
    by: ['contentType'],
    where: {
      zaloMsgId: { startsWith: 'pancake:' },
      conversation: { zaloAccountId: THIEP_CUOI_ACCOUNT_ID },
    },
    _count: { id: true },
  });

  // 7. Earliest and Latest Message Dates
  const earliestMsg = await prisma.message.findFirst({
    where: {
      zaloMsgId: { startsWith: 'pancake:' },
      conversation: { zaloAccountId: THIEP_CUOI_ACCOUNT_ID },
    },
    orderBy: { sentAt: 'asc' },
    select: { sentAt: true },
  });

  const latestMsg = await prisma.message.findFirst({
    where: {
      zaloMsgId: { startsWith: 'pancake:' },
      conversation: { zaloAccountId: THIEP_CUOI_ACCOUNT_ID },
    },
    orderBy: { sentAt: 'desc' },
    select: { sentAt: true },
  });

  // 8. Account Connection Status
  const account = await prisma.zaloAccount.findUnique({
    where: { id: THIEP_CUOI_ACCOUNT_ID },
    select: { displayName: true, zaloUid: true, status: true },
  });

  const report = {
    account,
    totalPancakeMessagesInDB: totalPancakeMsgs,
    messagesBeforeCutoff: msgsBeforeCutoff,
    messagesInExcludedGroups: msgsInExcluded,
    duplicatePancakeMsgIds: duplicates.length,
    totalConversationsInDB: totalConvs,
    userConversations: userConvs,
    groupConversations: groupConvs,
    contentTypeBreakdown: contentTypes.map(c => ({ type: c.contentType, count: c._count.id })),
    earliestMessageSentAtUTC: earliestMsg?.sentAt,
    latestMessageSentAtUTC: latestMsg?.sentAt,
    excludedGroupsMatchedCount: excludedConvIds.length,
    excludedGroupsUnmatchedCount: missingGroups.length,
    unmatchedGroupNames: missingGroups,
  };

  console.log('AUDIT RESULT:', JSON.stringify(report, null, 2));

  fs.writeFileSync(
    path.join(process.cwd(), 'pancake_final_verification_audit.json'),
    JSON.stringify(report, null, 2),
    'utf8'
  );

  await prisma.$disconnect();
}

verify().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
