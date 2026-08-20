import { decodePancakePageId, type PancakeConversation } from './pancake-history-import-lib.js';

const token = process.env.PANCAKE_PAGE_ACCESS_TOKEN?.trim();
if (!token) {
  console.error('PANCAKE_PAGE_ACCESS_TOKEN environment variable is required');
  process.exit(1);
}

const pageId = decodePancakePageId(token);
console.log('Decoded Page ID from token:', pageId);

async function pancakeGet<T>(path: string): Promise<T> {
  const separator = path.includes('?') ? '&' : '?';
  const url = `https://pages.fm${path}${separator}page_access_token=${encodeURIComponent(token!)}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Pancake API ${response.status} for ${path}`);
  return response.json() as T;
}

async function run() {
  // Test fetching page details
  try {
    const pageData = await pancakeGet<any>(`/api/public_api/v2/pages/${encodeURIComponent(pageId)}`);
    console.log('Page API details:', {
      id: pageData?.id || pageData?.page?.id,
      name: pageData?.name || pageData?.page?.name,
      settings: pageData?.settings ? 'present' : 'none',
      success: pageData?.success
    });
  } catch (err) {
    console.log('Page API v2 error (trying conversations directly):', (err as Error).message);
  }

  // Fetch first batch of conversations
  const convData = await pancakeGet<{ conversations?: PancakeConversation[]; success?: boolean }>(
    `/api/public_api/v2/pages/${encodeURIComponent(pageId)}/conversations?order_by=updated_at&limit=10`
  );

  const batch = convData.conversations ?? [];
  console.log(`Fetched first batch: ${batch.length} conversations.`);
  if (batch.length > 0) {
    console.log('Sample conversation 0:', {
      id: batch[0].id,
      type: batch[0].type,
      message_count: batch[0].message_count,
      inserted_at: batch[0].inserted_at,
      updated_at: batch[0].updated_at,
      from: batch[0].from,
      page_customer: batch[0].page_customer
    });
  }
}

run().catch((err) => {
  console.error('Pancake API Error:', err.message);
  process.exit(1);
});
