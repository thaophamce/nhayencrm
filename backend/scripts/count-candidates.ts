import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/shared/database/prisma-client.js';
import { decodePancakePageId, parsePancakeDate, type PancakeConversation } from './pancake-history-import-lib.js';

async function pancakeGet<T>(path: string, token: string): Promise<T> {
  const separator = path.includes('?') ? '&' : '?';
  const url = `https://pages.fm${path}${separator}page_access_token=${encodeURIComponent(token)}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (response.status === 429) {
      const retryAfterSeconds = Number(response.headers.get('retry-after')) || 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfterSeconds * 1000, 30_000)));
      continue;
    }
    if (!response.ok) throw new Error(`Pancake API ${response.status} for ${path}`);
    const data = (await response.json()) as T & { success?: boolean; error?: string };
    if (data.success === false) throw new Error(data.error || `Pancake API rejected ${path}`);
    return data;
  }
  throw new Error(`Pancake API rate limit persisted for ${path}`);
}

async function fetchAllConversations(pageId: string, token: string): Promise<PancakeConversation[]> {
  const result: PancakeConversation[] = [];
  const seen = new Set<string>();
  let cursor = '';

  for (let page = 0; page < 1000; page++) {
    const query = cursor ? `&last_conversation_id=${encodeURIComponent(cursor)}` : '';
    const data = await pancakeGet<{ conversations?: PancakeConversation[] }>(
      `/api/public_api/v2/pages/${encodeURIComponent(pageId)}/conversations?order_by=updated_at${query}`,
      token,
    );
    const batch = data.conversations ?? [];
    if (batch.length === 0) break;
    let added = 0;
    for (const conversation of batch) {
      if (!seen.has(conversation.id)) {
        seen.add(conversation.id);
        result.push(conversation);
        added++;
      }
    }
    const nextCursor = batch.at(-1)?.id ?? '';
    if (!nextCursor || nextCursor === cursor || added === 0) break;
    cursor = nextCursor;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return result;
}

async function main() {
  const token = process.env.PANCAKE_PAGE_ACCESS_TOKEN?.trim();
  if (!token) throw new Error('PANCAKE_PAGE_ACCESS_TOKEN is required');

  const pageId = decodePancakePageId(token);
  const fromDate = parsePancakeDate('2026-04-01T00:00:00+07:00');

  // Load excluded conversation IDs
  const checkpointPath = path.join(process.cwd(), 'excluded_groups_checkpoint.json');
  const checkpointData = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
  const excludedIds = new Set<string>(checkpointData.excludedConversationIds);

  console.log(`Loaded ${excludedIds.size} excluded conversation IDs from checkpoint.`);

  const allConvs = await fetchAllConversations(pageId, token);

  // Filter candidates: active after cutoff, message_count > 0, not in excluded set
  const candidates = allConvs.filter((c) => {
    if ((c.message_count ?? 0) <= 0) return false;
    if (excludedIds.has(c.id)) return false;
    if (c.updated_at && parsePancakeDate(c.updated_at) < fromDate) return false;
    return true;
  });

  const userConvs = candidates.filter((c) => c.id.startsWith('pzl_u_'));
  const groupConvs = candidates.filter((c) => c.id.startsWith('pzl_g_'));

  console.log('\n--- Candidate Statistics ---');
  console.log(`Total Pancake conversations fetched: ${allConvs.length}`);
  console.log(`Excluded conversations: ${excludedIds.size}`);
  console.log(`Total candidate conversations (active >= 2026-04-01): ${candidates.length}`);
  console.log(`- Personal conversations (user): ${userConvs.length}`);
  console.log(`- Group conversations (group): ${groupConvs.length}`);

  await prisma.$disconnect();
}

main().catch(console.error);
