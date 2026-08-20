import { randomUUID } from 'node:crypto';
import { prisma } from '../src/shared/database/prisma-client.js';
import {
  decodePancakePageId,
  inferPancakeContent,
  isPancakeSelfMessage,
  pancakeMessageKey,
  parsePancakeConversationId,
  parsePancakeDate,
  type PancakeConversation,
  type PancakeMessage,
} from './pancake-history-import-lib.js';

interface CliOptions {
  accountId: string;
  limit: number;
  all: boolean;
  dryRun: boolean;
  sample: boolean;
  conversationIds: string[];
  excludedConversationIds: string[];
  fromDate: Date;
  toDate: Date;
}

interface ImportStats {
  conversationsSelected: number;
  conversationsCreated: number;
  conversationsReused: number;
  messagesFetched: number;
  messagesInserted: number;
  messagesSkippedExisting: number;
  messagesSkippedAfterCutoff: number;
  errors: Array<{ conversationId: string; error: string }>;
}

function readOptions(argv: string[]): CliOptions {
  const value = (name: string) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const accountId = value('account-id') ?? '';
  const limit = Number(value('limit') ?? 3);
  const fromDate = parsePancakeDate(value('from-date') ?? '2026-04-01T00:00:00+07:00');
  const toDate = parsePancakeDate(value('to-date') ?? new Date().toISOString());
  if (!accountId) throw new Error('Missing --account-id=<ZaloAccount.id>');
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new Error('--limit must be an integer from 1 to 5000');
  if (fromDate >= toDate) throw new Error('--from-date must be before --to-date');
  return {
    accountId,
    limit,
    all: argv.includes('--all'),
    dryRun: argv.includes('--dry-run'),
    sample: argv.includes('--sample'),
    conversationIds: (value('conversation-ids') ?? '').split(',').map((id) => id.trim()).filter(Boolean),
    excludedConversationIds: (value('exclude-conversation-ids') ?? '').split(',').map((id) => id.trim()).filter(Boolean),
    fromDate,
    toDate,
  };
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
    const data = await response.json() as T & { success?: boolean; error?: string };
    if (data.success === false) throw new Error(data.error || `Pancake API rejected ${path}`);
    return data;
  }
  throw new Error(`Pancake API rate limit persisted for ${path}`);
}

async function fetchConversations(pageId: string, token: string): Promise<PancakeConversation[]> {
  const result: PancakeConversation[] = [];
  const seen = new Set<string>();
  let cursor = '';

  for (let page = 0; page < 500; page++) {
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
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return result;
}

async function fetchMessages(
  pageId: string,
  conversation: PancakeConversation,
  token: string,
  fromDate: Date,
  toDate: Date,
): Promise<PancakeMessage[]> {
  const result: PancakeMessage[] = [];
  const seen = new Set<string>();
  const expected = Number(conversation.message_count) || Number.MAX_SAFE_INTEGER;

  for (let currentCount = 0; currentCount < expected; currentCount += 30) {
    const data = await pancakeGet<{ messages?: PancakeMessage[] }>(
      `/api/public_api/v1/pages/${encodeURIComponent(pageId)}/conversations/${encodeURIComponent(conversation.id)}/messages?current_count=${currentCount}`,
      token,
    );
    const batch = data.messages ?? [];
    for (const message of batch) {
      const sentAt = parsePancakeDate(message.inserted_at);
      if (sentAt >= fromDate && sentAt <= toDate && message.id && !seen.has(message.id)) {
        seen.add(message.id);
        result.push(message);
      }
    }
    const oldestInBatch = Math.min(...batch.map((message) => parsePancakeDate(message.inserted_at).getTime()));
    if (batch.length < 30 || oldestInBatch < fromDate.getTime()) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return result.sort((a, b) => parsePancakeDate(a.inserted_at).getTime() - parsePancakeDate(b.inserted_at).getTime());
}

async function resolveContact(
  orgId: string,
  accountId: string,
  threadType: 'user' | 'group',
  externalThreadId: string,
  displayName: string,
): Promise<string> {
  const friend = threadType === 'user'
    ? await prisma.friend.findFirst({
        where: { orgId, zaloAccountId: accountId, zaloUidInNick: externalThreadId },
        select: { contactId: true },
      })
    : null;
  if (friend?.contactId) return friend.contactId;

  const existing = await prisma.contact.findFirst({
    where: { orgId, zaloUid: externalThreadId },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.contact.create({
    data: {
      id: randomUUID(),
      orgId,
      zaloUid: externalThreadId,
      fullName: displayName || (threadType === 'group' ? 'Nhóm Zalo' : 'Khách Zalo'),
      source: 'pancake_import',
      metadata: threadType === 'group'
        ? { isGroup: true, importedFrom: 'pancake' }
        : { importedFrom: 'pancake' },
    },
    select: { id: true },
  });
  return created.id;
}

function semanticKey(senderType: string, sentAt: Date, contentType: string, content: string): string {
  return `${senderType}|${Math.floor(sentAt.getTime() / 1000)}|${contentType}|${content.trim()}`;
}

async function importConversation(
  account: { id: string; orgId: string; createdAt: Date },
  pageId: string,
  source: PancakeConversation,
  token: string,
  fromDate: Date,
  toDate: Date,
  dryRun: boolean,
  stats: ImportStats,
): Promise<void> {
  const parsed = parsePancakeConversationId(source.id, pageId);
  const messages = await fetchMessages(pageId, source, token, fromDate, toDate);
  stats.messagesFetched += messages.length;
  const eligible = messages;
  if (dryRun) return;

  const displayName = source.from?.name ?? source.page_customer?.name ?? '';
  const contactId = await resolveContact(
    account.orgId,
    account.id,
    parsed.threadType,
    parsed.externalThreadId,
    displayName,
  );
  const existingConversation = await prisma.conversation.findUnique({
    where: {
      zaloAccountId_externalThreadId: {
        zaloAccountId: account.id,
        externalThreadId: parsed.externalThreadId,
      },
    },
    select: { id: true, lastMessageAt: true },
  });
  const conversation = existingConversation ?? await prisma.conversation.create({
    data: {
      id: randomUUID(),
      orgId: account.orgId,
      zaloAccountId: account.id,
      contactId,
      threadType: parsed.threadType,
      externalThreadId: parsed.externalThreadId,
      groupName: parsed.threadType === 'group' ? displayName || 'Nhóm Zalo' : null,
      unreadCount: 0,
      isReplied: true,
      lastMessageAt: eligible.at(-1) ? parsePancakeDate(eligible.at(-1)!.inserted_at) : null,
    },
    select: { id: true, lastMessageAt: true },
  });
  if (existingConversation) stats.conversationsReused++;
  else stats.conversationsCreated++;

  const existingRows = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    select: { zaloMsgId: true, senderType: true, sentAt: true, contentType: true, content: true },
  });
  const existingIds = new Set(existingRows.map((row) => row.zaloMsgId).filter(Boolean));
  const existingSemantic = new Set(existingRows.map((row) =>
    semanticKey(row.senderType, row.sentAt, row.contentType, row.content ?? ''),
  ));

  const rows = eligible.flatMap((message) => {
    const mapped = inferPancakeContent(message);
    const senderType = isPancakeSelfMessage(message, pageId) ? 'self' : 'contact';
    const sentAt = parsePancakeDate(message.inserted_at);
    const key = pancakeMessageKey(message.id);
    const sameLogicalMessage = existingSemantic.has(semanticKey(senderType, sentAt, mapped.contentType, mapped.content));
    if (existingIds.has(key) || sameLogicalMessage) {
      stats.messagesSkippedExisting++;
      return [];
    }
    return [{
      id: randomUUID(),
      conversationId: conversation.id,
      zaloMsgId: key,
      senderType,
      senderUid: message.from?.id ?? null,
      senderName: message.from?.name ?? message.from?.admin_name ?? null,
      content: mapped.content,
      contentType: mapped.contentType,
      attachments: mapped.attachments,
      sentAt,
      sentVia: senderType === 'self' ? 'user_native' : 'user',
      isLocal: true,
      isDeleted: Boolean(message.is_removed),
      metadata: {
        importedFrom: 'pancake',
        pancakePageId: pageId,
        pancakeConversationId: source.id,
        pancakeMessageId: message.id,
      },
    }];
  });

  if (rows.length > 0) {
    const result = await prisma.message.createMany({ data: rows, skipDuplicates: true });
    stats.messagesInserted += result.count;
  }

  const latestImported = eligible.at(-1) ? parsePancakeDate(eligible.at(-1)!.inserted_at) : null;
  if (latestImported && (!conversation.lastMessageAt || latestImported > conversation.lastMessageAt)) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: latestImported },
    });
  }
}

async function main(): Promise<void> {
  const options = readOptions(process.argv.slice(2));
  const token = process.env.PANCAKE_PAGE_ACCESS_TOKEN?.trim();
  if (!token) throw new Error('PANCAKE_PAGE_ACCESS_TOKEN is required');
  const pageId = decodePancakePageId(token);
  const account = await prisma.zaloAccount.findUnique({
    where: { id: options.accountId },
    select: { id: true, orgId: true, createdAt: true, displayName: true, status: true },
  });
  if (!account) throw new Error(`Zalo account not found: ${options.accountId}`);
  if (account.status !== 'connected') throw new Error(`Zalo account is not connected: ${account.status}`);

  const all = await fetchConversations(pageId, token);
  const imported = await prisma.message.findMany({
    where: {
      conversation: { zaloAccountId: account.id },
      zaloMsgId: { startsWith: 'pancake:' },
    },
    select: { metadata: true },
  });
  const importedConversationIds = new Set(imported.flatMap((row) => {
    const metadata = row.metadata as { pancakeConversationId?: string } | null;
    return metadata?.pancakeConversationId ? [metadata.pancakeConversationId] : [];
  }));
  const candidates = all.filter((conversation) =>
    (conversation.message_count ?? 0) > 0
    && !importedConversationIds.has(conversation.id)
    && !options.excludedConversationIds.includes(conversation.id)
    && (!conversation.updated_at || parsePancakeDate(conversation.updated_at) >= options.fromDate)
    && (!conversation.inserted_at || parsePancakeDate(conversation.inserted_at) <= options.toDate),
  );
  const selected = options.conversationIds.length > 0
    ? all.filter((conversation) => options.conversationIds.includes(conversation.id))
    : options.sample
    ? [
        ...candidates.filter((c) => c.id.startsWith('pzl_u_') && (c.message_count ?? 0) >= 5).sort((a, b) => (a.message_count ?? 0) - (b.message_count ?? 0)).slice(0, Math.max(1, options.limit - 1)),
        ...candidates.filter((c) => c.id.startsWith('pzl_g_') && (c.message_count ?? 0) >= 5).sort((a, b) => (a.message_count ?? 0) - (b.message_count ?? 0)).slice(0, 1),
      ].slice(0, options.limit)
    : candidates.slice(0, options.all ? candidates.length : options.limit);

  const stats: ImportStats = {
    conversationsSelected: selected.length,
    conversationsCreated: 0,
    conversationsReused: 0,
    messagesFetched: 0,
    messagesInserted: 0,
    messagesSkippedExisting: 0,
    messagesSkippedAfterCutoff: 0,
    errors: [],
  };

  for (const conversation of selected) {
    try {
      await importConversation(
        account,
        pageId,
        conversation,
        token,
        options.fromDate,
        options.toDate,
        options.dryRun,
        stats,
      );
    } catch (error) {
      stats.errors.push({
        conversationId: conversation.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(JSON.stringify({
    mode: options.dryRun ? 'dry-run' : 'write',
    account: { id: account.id, name: account.displayName },
    pageId,
    range: { from: options.fromDate.toISOString(), to: options.toDate.toISOString() },
    excludedConversations: options.excludedConversationIds.length,
    ...stats,
  }, null, 2));
  if (stats.errors.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
