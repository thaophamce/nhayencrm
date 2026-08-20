import { prisma } from '../src/shared/database/prisma-client.js';

const PANCAKE_TOKEN = process.env.PANCAKE_PAGE_ACCESS_TOKEN;

async function run() {
  const accountId = '75531187-1d0f-44d9-a75b-08cb0c8204c3';
  const account = await prisma.zaloAccount.findUnique({
    where: { id: accountId },
    select: { id: true, orgId: true, displayName: true, phone: true, zaloUid: true, status: true, createdAt: true }
  });

  console.log('--- DB Account Info ---');
  console.log(JSON.stringify(account, null, 2));

  // Count existing messages for this account in DB
  const totalMessages = await prisma.message.count({
    where: { conversation: { zaloAccountId: accountId } }
  });

  const pancakeMessages = await prisma.message.count({
    where: {
      conversation: { zaloAccountId: accountId },
      zaloMsgId: { startsWith: 'pancake:' }
    }
  });

  const oldestMsg = await prisma.message.findFirst({
    where: { conversation: { zaloAccountId: accountId } },
    orderBy: { sentAt: 'asc' },
    select: { sentAt: true }
  });

  const newestMsg = await prisma.message.findFirst({
    where: { conversation: { zaloAccountId: accountId } },
    orderBy: { sentAt: 'desc' },
    select: { sentAt: true }
  });

  console.log('--- DB Message Stats ---');
  console.log({
    totalMessages,
    pancakeMessages,
    oldestMsg: oldestMsg?.sentAt,
    newestMsg: newestMsg?.sentAt,
  });

  // Test Pancake API token & page_id verification
  if (!PANCAKE_TOKEN) {
    console.error('PANCAKE_PAGE_ACCESS_TOKEN is missing!');
    return;
  }

  // Parse JWT token
  const payloadPart = PANCAKE_TOKEN.split('.')[1];
  const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  console.log('--- Pancake Token Payload ---', payload);

  const pageId = payload.id;
  console.log('Pancake Page ID:', pageId);

  // Fetch page info from Pancake API
  const pageUrl = `https://pages.fm/api/public_api/v2/pages/${pageId}?page_access_token=${encodeURIComponent(PANCAKE_TOKEN)}`;
  try {
    const pageRes = await fetch(pageUrl);
    const pageData = await pageRes.json();
    console.log('--- Pancake API Page Info ---', pageData);
  } catch (err) {
    console.error('Failed to fetch Pancake page info:', err);
  }

  await prisma.$disconnect();
}

run().catch(console.error);
