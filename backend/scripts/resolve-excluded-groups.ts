import fs from 'node:fs';
import path from 'node:path';
import { decodePancakePageId, type PancakeConversation } from './pancake-history-import-lib.js';

const EXCLUDED_GROUP_NAMES: string[] = [
  'FILE IN HỒNG NGA',
  'FILE IN DƯƠNG',
  'FILE IN ĐỨC',
  'FILE QUANG',
  'NHÀ YẾN FILE SOS + IN THÊM',
  'FILE ẢNH NHÀ YẾN',
  'File Tuấn',
  'FILE THẮNG THIẾT KẾ',
  'FILE IN HỒNG NHUNG',
  'FILE HỒNG DIỄM',
  'FILE IN DUYÊN ĐOÀN',
  'FILE UYÊN',
  'FILE LINH ĐÀI',
  'File Bi Thiết Kế',
  'FILE ẢNH NHÀ YẾN TT - THIÊN NGA BÌNH DƯƠNG',
  'FILE TRẦN ANH',
  'FILE TRÚC',
  'FILE KTS NHÀ YẾN',
  'ÁO GẠO - NHÀ YẾN SPORT - FILE ĐÃ LÀM',
  'File Mẫn Babyboo',
  'File Khanh',
  'File Dung Tk',
  'FILE HIẾU 2K7',
  'DAKLAK - NHÀ YẾN - FILE IN',
  'FILE IN THIÊN ĐƯỜNG',
  'FILE Khang',
  'FILE KHUÔN TÂN PHÚ',
  'FILE CÔNG DANH',
  'FILE IN PHONG',
  'File Trí - Thiết kế',
  'FILE PHÔI NHÀ YẾN',
  'File Sang TK',
  'FILE IN NHƯ QUỲNH',
  'FILE TÚ',
  'FILE ÁO THUN (COREL)',
  'D250725 xuất file',
  'FILE THIÊN BÌNH',
  'FILE IN ĐẠT',
  'FILE IN THỦY',
  'FILE MINH',
  'FILE THUẬN',
  'Xin File Đà Nẵng',
  'FILE XƯỞNG THIẾT KẾ',
  'FILE ĐỨC QUYỀN - NHÀ YẾN',
  'D230718 xuất file',
  'FILE VY ÁO + ẢNH',
  'FILE LÂM',
  'FILE PHƯƠNG',
  'File Tuyn',
  'FILE VY THIỆP',
  '194/ FILE NHÀ YẾN HCM',
  'NHÀ YẾN Chụp Ảnh',
  'ÁO TIN NHẮN CSKH',
  'ẢNH NHŨ 2026',
  'Giải 226 Brothers Pickle and Chill',
  'ÁO DOANH NGHIỆP',
  'Tu chỉ làm ăn',
  'CONTENT ZALO ÁO',
  'CONTENT TIỆM ẢNH',
  'Ảnh cưới Thảo Yến',
  'TEAM ÁO NHÀ YẾN SPORT',
  'Hình Ảnh SP Thiệp Cưới - Cty Thiệp Đức Quyền',
  'Feed ảnh',
  'HÌNH ÁO KHÁCH',
  'ẢNH NHŨ 2024',
  'ÁO FEEDBACK ÁO',
  'ÁO CẦU LÔNG',
  'K2 A Hiền',
  'DN Viettel Nhà Yến',
  'HM Viettel Nhà Yến',
  'TÂN PHÚ NHÀ YẾN VIETTEL',
  'Nhà Yến - Viettel Q12',
];

function normalizeName(str: string): string {
  return str.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

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
  console.log('Fetching all conversations for page:', pageId);

  const conversations = await fetchAllConversations(pageId, token);
  console.log(`Total conversations fetched from Pancake: ${conversations.length}`);

  // Create lookup maps
  const normalizedExclusions = EXCLUDED_GROUP_NAMES.map((name, index) => ({
    index: index + 1,
    originalName: name,
    normalized: normalizeName(name),
  }));

  const excludedConversationIds = new Set<string>();
  const matchedGroups: Array<{ index: number; targetName: string; conversationId: string; actualName: string }> = [];
  const unmatchedGroups: Array<{ index: number; targetName: string }> = [];
  const ambiguousGroups: Array<{ index: number; targetName: string; matches: string[] }> = [];

  for (const item of normalizedExclusions) {
    // Find matching group conversations
    const matches = conversations.filter((conv) => {
      const convName = conv.from?.name ?? conv.page_customer?.name ?? '';
      const isGroup = conv.id.startsWith('pzl_g_') || Boolean((conv.from as any)?.is_group);
      return isGroup && normalizeName(convName) === item.normalized;
    });

    if (matches.length === 1) {
      const match = matches[0];
      excludedConversationIds.add(match.id);
      matchedGroups.push({
        index: item.index,
        targetName: item.originalName,
        conversationId: match.id,
        actualName: match.from?.name ?? match.page_customer?.name ?? '',
      });
    } else if (matches.length > 1) {
      ambiguousGroups.push({
        index: item.index,
        targetName: item.originalName,
        matches: matches.map((m) => `${m.id} (${m.from?.name ?? ''})`),
      });
    } else {
      unmatchedGroups.push({
        index: item.index,
        targetName: item.originalName,
      });
    }
  }

  const resultData = {
    pageId,
    totalConversations: conversations.length,
    excludedConversationIds: Array.from(excludedConversationIds),
    stats: {
      totalExcludedList: EXCLUDED_GROUP_NAMES.length,
      matchedCount: matchedGroups.length,
      unmatchedCount: unmatchedGroups.length,
      ambiguousCount: ambiguousGroups.length,
    },
    matchedGroups,
    unmatchedGroups,
    ambiguousGroups,
  };

  console.log('\n--- Excluded Group Resolution Results ---');
  console.log(`Matched Excluded Groups: ${matchedGroups.length}/${EXCLUDED_GROUP_NAMES.length}`);
  console.log(`Unmatched Groups (not found in Pancake): ${unmatchedGroups.length}`);
  console.log(`Ambiguous Groups: ${ambiguousGroups.length}`);
  console.log(`Total Excluded Conversation IDs: ${excludedConversationIds.size}`);

  const outputPath = path.join(process.cwd(), 'excluded_groups_checkpoint_0913980993.json');
  fs.writeFileSync(outputPath, JSON.stringify(resultData, null, 2), 'utf8');
  console.log(`Saved checkpoint to: ${outputPath}`);
}

main().catch(console.error);
