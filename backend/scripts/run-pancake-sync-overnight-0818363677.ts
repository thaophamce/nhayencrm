import fs from 'node:fs';
import path from 'node:path';
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

const ACCOUNT_ID = '39954c17-5fb7-4a6d-bc1c-44537b72e451';
const EXPECTED_ZALO_UID = '2132817647513376826';
const FROM_DATE_STR = '2026-06-01T00:00:00+07:00';
const FROM_DATE = parsePancakeDate(FROM_DATE_STR);

const CHECKPOINT_FILE = path.join(process.cwd(), 'pancake_sync_checkpoint_khang_0818363677.json');
const EXCLUDED_FILE = path.join(process.cwd(), 'excluded_groups_checkpoint_0818363677.json');
const MAX_CONVERSATIONS = Number(process.env.PANCAKE_SYNC_MAX_CONVERSATIONS || 0);

interface CheckpointData {
  pageId: string;
  accountId: string;
  fromDate: string;
  toDate: string;
  startTime: string;
  lastUpdateTime: string;
  processedConversationIds: string[];
  errorConversations: Array<{ conversationId: string; error: string; retryCount: number }>;
  stats: {
    totalConversations: number;
    processedConversations: number;
    conversationsCreated: number;
    conversationsReused: number;
    messagesFetched: number;
    messagesInserted: number;
    messagesSkippedExisting: number;
    errorsCount: number;
  };
}

function loadExcludedIds(): Set<string> {
  if (!fs.existsSync(EXCLUDED_FILE)) {
    throw new Error(`Excluded groups checkpoint file missing: ${EXCLUDED_FILE}`);
  }
  const data = JSON.parse(fs.readFileSync(EXCLUDED_FILE, 'utf8'));
  return new Set<string>(data.excludedConversationIds || []);
}

function loadOrCreateCheckpoint(pageId: string): CheckpointData {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8')) as CheckpointData;
      if (data.pageId !== pageId || data.accountId !== ACCOUNT_ID || data.fromDate !== FROM_DATE_STR) {
        throw new Error('Checkpoint identity/cutoff does not match this import');
      }
      console.log(`Loaded existing checkpoint from ${CHECKPOINT_FILE}`);
      console.log(`- Already processed: ${data.processedConversationIds.length} conversations`);
      console.log(`- Messages inserted so far: ${data.stats.messagesInserted}`);
      return data;
    } catch (err) {
      console.warn('Failed to parse checkpoint file, creating new one.', err);
    }
  }

  return {
    pageId,
    accountId: ACCOUNT_ID,
    fromDate: FROM_DATE_STR,
    toDate: new Date().toISOString(),
    startTime: new Date().toISOString(),
    lastUpdateTime: new Date().toISOString(),
    processedConversationIds: [],
    errorConversations: [],
    stats: {
      totalConversations: 0,
      processedConversations: 0,
      conversationsCreated: 0,
      conversationsReused: 0,
      messagesFetched: 0,
      messagesInserted: 0,
      messagesSkippedExisting: 0,
      errorsCount: 0,
    },
  };
}

function saveCheckpoint(checkpoint: CheckpointData): void {
  checkpoint.lastUpdateTime = new Date().toISOString();
  const tmpFile = `${CHECKPOINT_FILE}.tmp`;
  const content = JSON.stringify(checkpoint, null, 2);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.writeFileSync(tmpFile, content, 'utf8');
      fs.renameSync(tmpFile, CHECKPOINT_FILE);
      return;
    } catch (err) {
      if (attempt === 4) throw err;
    }
  }
}

async function pancakeGet<T>(path: string, token: string): Promise<T> {
  const separator = path.includes('?') ? '&' : '?';
  const url = `https://pages.fm${path}${separator}page_access_token=${encodeURIComponent(token)}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (response.status === 429) {
        const retryAfterSeconds = Number(response.headers.get('retry-after')) || Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfterSeconds * 1000, 30_000)));
        continue;
      }
      if (!response.ok) {
        if (response.status >= 500 && attempt < 4) {
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          continue;
        }
        throw new Error(`Pancake API ${response.status} for ${path}`);
      }
      const data = (await response.json()) as T & { success?: boolean; error?: string };
      if (data.success === false) throw new Error(data.error || `Pancake API rejected ${path}`);
      return data;
    } catch (err) {
      if (attempt === 4) throw err;
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
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
    const oldestUpdatedAt = batch.at(-1)?.updated_at;
    if (oldestUpdatedAt && parsePancakeDate(oldestUpdatedAt) < FROM_DATE) break;
    const nextCursor = batch.at(-1)?.id ?? '';
    if (!nextCursor || nextCursor === cursor || added === 0) break;
    cursor = nextCursor;
    await new Promise((resolve) => setTimeout(resolve, 150));
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
    await new Promise((resolve) => setTimeout(resolve, 100));
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

async function importSingleConversation(
  account: { id: string; orgId: string },
  pageId: string,
  source: PancakeConversation,
  token: string,
  fromDate: Date,
  toDate: Date,
  checkpoint: CheckpointData,
): Promise<void> {
  const parsed = parsePancakeConversationId(source.id, pageId);
  const eligible = await fetchMessages(pageId, source, token, fromDate, toDate);
  checkpoint.stats.messagesFetched += eligible.length;

  if (eligible.length === 0) return;

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

  if (existingConversation) checkpoint.stats.conversationsReused++;
  else checkpoint.stats.conversationsCreated++;

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
      checkpoint.stats.messagesSkippedExisting++;
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
    checkpoint.stats.messagesInserted += result.count;
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
  const token = process.env.PANCAKE_PAGE_ACCESS_TOKEN?.trim();
  if (!token) throw new Error('PANCAKE_PAGE_ACCESS_TOKEN is required');

  const pageId = decodePancakePageId(token);

  const account = await prisma.zaloAccount.findUnique({
    where: { id: ACCOUNT_ID },
    select: { id: true, orgId: true, displayName: true, phone: true, zaloUid: true, status: true },
  });
  if (!account) throw new Error(`Target Zalo account not found: ${ACCOUNT_ID}`);
  if (account.status !== 'connected') {
    console.warn(`WARNING: Zalo account is ${account.status} — continuing Pancake import (Zalo connection not required)`);
  }
  if (account.zaloUid !== EXPECTED_ZALO_UID || account.phone !== '0818363677') {
    throw new Error('Target Zalo account identity mismatch');
  }
  if (pageId !== `pzl_${account.zaloUid}`) {
    throw new Error(`Pancake page does not match target Zalo UID`);
  }

  console.log(`Starting overnight Pancake sync for account "${account.displayName}" (${account.id})`);
  console.log(`Pancake Page ID: ${pageId}`);
  console.log(`Cutoff Date: ${FROM_DATE_STR} (UTC: ${FROM_DATE.toISOString()})`);

  const excludedIds = loadExcludedIds();
  console.log(`Excluded Conversation IDs loaded: ${excludedIds.size}`);

  const checkpoint = loadOrCreateCheckpoint(pageId);
  const toDate = parsePancakeDate(checkpoint.toDate);
  const processedSet = new Set<string>(checkpoint.processedConversationIds);

  console.log('Fetching all conversations from Pancake...');
  const allConversations = await fetchAllConversations(pageId, token);
  console.log(`Total Pancake conversations fetched: ${allConversations.length}`);

  const candidates = allConversations.filter((c) => {
    if ((c.message_count ?? 0) <= 0) return false;
    if (excludedIds.has(c.id)) return false;
    if (c.updated_at && parsePancakeDate(c.updated_at) < FROM_DATE) return false;
    return true;
  });

  checkpoint.stats.totalConversations = candidates.length;

  console.log(`Total candidate conversations to sync: ${candidates.length}`);
  console.log(`Already processed in previous runs: ${processedSet.size}`);
  const allRemaining = candidates.filter((c) => !processedSet.has(c.id));
  const remaining = MAX_CONVERSATIONS > 0 ? allRemaining.slice(0, MAX_CONVERSATIONS) : allRemaining;
  console.log(`Remaining conversations to process: ${remaining.length}`);

  let countInCurrentRun = 0;
  const startTimeMs = Date.now();

  for (const conversation of remaining) {
    countInCurrentRun++;
    let success = false;
    let lastErr = '';

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await importSingleConversation(account, pageId, conversation, token, FROM_DATE, toDate, checkpoint);
        success = true;
        break;
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
        const backoff = Math.pow(2, attempt) * 1000;
        console.warn(`[Attempt ${attempt + 1}/5] Error importing conversation ${conversation.id}: ${lastErr}. Retrying in ${backoff}ms...`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }

    if (success) {
      processedSet.add(conversation.id);
      checkpoint.processedConversationIds.push(conversation.id);
      checkpoint.stats.processedConversations = processedSet.size;
    } else {
      checkpoint.errorConversations.push({
        conversationId: conversation.id,
        error: lastErr,
        retryCount: 5,
      });
      checkpoint.stats.errorsCount = checkpoint.errorConversations.length;
    }

    if (countInCurrentRun % 10 === 0) {
      saveCheckpoint(checkpoint);
    }

    if (countInCurrentRun % 25 === 0 || countInCurrentRun === remaining.length) {
      const elapsedMin = ((Date.now() - startTimeMs) / 60000).toFixed(1);
      console.log(`[Progress Update] Processed ${checkpoint.stats.processedConversations}/${candidates.length} convs | Ins: ${checkpoint.stats.messagesInserted} msgs | Skip: ${checkpoint.stats.messagesSkippedExisting} | Err: ${checkpoint.stats.errorsCount} | Elapsed: ${elapsedMin}m`);
    }
  }

  saveCheckpoint(checkpoint);

  if (checkpoint.errorConversations.length > 0) {
    console.log(`\n--- Retrying ${checkpoint.errorConversations.length} Error Conversations ---`);
    const unresolvedErrors: Array<{ conversationId: string; error: string; retryCount: number }> = [];

    for (const errorItem of checkpoint.errorConversations) {
      const source = allConversations.find((c) => c.id === errorItem.conversationId);
      if (!source) continue;
      let success = false;
      let lastErr = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await importSingleConversation(account, pageId, source, token, FROM_DATE, toDate, checkpoint);
          success = true;
          break;
        } catch (err) {
          lastErr = err instanceof Error ? err.message : String(err);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
      if (success) {
        processedSet.add(source.id);
        if (!checkpoint.processedConversationIds.includes(source.id)) {
          checkpoint.processedConversationIds.push(source.id);
        }
        checkpoint.stats.processedConversations = processedSet.size;
      } else {
        unresolvedErrors.push({
          conversationId: errorItem.conversationId,
          error: lastErr,
          retryCount: 10,
        });
      }
    }
    checkpoint.errorConversations = unresolvedErrors;
    checkpoint.stats.errorsCount = unresolvedErrors.length;
    saveCheckpoint(checkpoint);
  }

  console.log('\n======================================================');
  console.log('            PANCAKE IMPORT COMPLETED');
  console.log('======================================================');
  console.log(`Processed Conversations: ${checkpoint.stats.processedConversations}/${candidates.length}`);
  console.log(`Created Conversations: ${checkpoint.stats.conversationsCreated}`);
  console.log(`Reused Conversations: ${checkpoint.stats.conversationsReused}`);
  console.log(`Fetched Messages: ${checkpoint.stats.messagesFetched}`);
  console.log(`Inserted Messages: ${checkpoint.stats.messagesInserted}`);
  console.log(`Skipped (Existing) Messages: ${checkpoint.stats.messagesSkippedExisting}`);
  console.log(`Unresolved Errors: ${checkpoint.stats.errorsCount}`);
}

main()
  .catch((err) => {
    console.error('Fatal Error during overnight import:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
