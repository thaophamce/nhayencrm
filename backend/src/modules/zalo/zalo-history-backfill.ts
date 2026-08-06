// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * zalo-history-backfill.ts — initial history seeding for fresh accounts.
 *
 * On first connect (or via manual sync endpoint) fetches:
 *   - All friends → upsert contacts (no message history; zca-js has no 1-1 history API)
 *   - All groups → upsert contact-stub + conversation + recent message history
 *
 * Idempotent: re-running is safe — message-handler dedup guards prevent duplicates.
 * Fire-and-forget callable: errors are logged, not propagated.
 */
import { randomUUID } from 'node:crypto';
import { prisma, tenantTransaction } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { handleIncomingMessage } from '../chat/message-handler.js';
import { detectContentType, extractAlbumInfo } from './zalo-message-helpers.js';

const MAX_GROUPS = 50;
const MESSAGES_PER_GROUP = 50;
const DM_MAX_PAGES = 50;
const DM_PAGE_TIMEOUT_MS = 15_000;

/**
 * Multi-cursor strategy ported from openzca CLI `getRecentPageCursors`.
 * Tries oldest-by-ts / last-in-array / first-in-array — different cursors
 * sometimes unlock different next-page slices from Zalo.
 */
function pickNextCursors(messages: any[]): string[] {
  const cursors: string[] = [];
  const seen = new Set<string>();
  const add = (c: string) => {
    const v = c.trim();
    if (!v || seen.has(v)) return;
    seen.add(v); cursors.push(v);
  };
  const cursorOf = (m: any): string => String(m?.data?.msgId || m?.data?.actionId || m?.data?.cliMsgId || '');

  // Oldest by timestamp
  let oldest: any = null;
  for (const m of messages) {
    const ts = parseInt(m?.data?.ts || '0');
    if (!oldest || ts < parseInt(oldest?.data?.ts || '0')) oldest = m;
  }
  if (oldest) add(cursorOf(oldest));
  add(cursorOf(messages[messages.length - 1]));
  add(cursorOf(messages[0]));
  return cursors;
}

// ThreadType from zca-js: 0 = User (DM), 1 = Group
const THREAD_TYPE_USER = 0;

export interface BackfillResult {
  friendsSynced: number;
  groupsSynced: number;
  messagesBackfilled: number;
  dmPagesRequested: number;
  errors: number;
}

interface PumpStats { pagesRequested: number; messagesInserted: number; messagesReceived: number; }

type GroupInfo = {
  groupId?: string;
  id?: string;
  name?: string;
  groupName?: string;
  avt?: string;
  avatar?: string;
  totalMember?: number;
  memberCount?: number;
};

export function groupIdsFromCatalog(raw: unknown): string[] {
  const catalog = (raw && typeof raw === 'object' ? raw : {}) as {
    gridVerMap?: Record<string, unknown>;
    gridInfoMap?: Record<string, unknown>;
  };
  return [...new Set([
    ...Object.keys(catalog.gridVerMap ?? {}),
    ...Object.keys(catalog.gridInfoMap ?? {}),
  ])];
}

const backfillInFlight = new Map<string, Promise<BackfillResult>>();
const recentBackfills = new Map<string, { completedAt: number; result: BackfillResult }>();
const BACKFILL_REPEAT_GUARD_MS = 30_000;

/**
 * Drives Zalo's `requestOldMessages` pagination AND directly persists each
 * incoming batch via `handleIncomingMessage`. This bypasses the main listener's
 * `old_messages` handler so insertion is deterministic and counted.
 */
async function pumpOldMessages(
  api: any,
  threadType: number,
  accountId: string,
  emitProgress?: (step: string, message: string) => void
): Promise<PumpStats> {
  return new Promise((resolve) => {
    const stats: PumpStats = { pagesRequested: 0, messagesInserted: 0, messagesReceived: 0 };
    const requestedCursors = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      try { api.listener.off?.('old_messages', onPage); } catch {}
      if (timer) clearTimeout(timer);
      resolve(stats);
    };

    const resetIdleTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(finish, DM_PAGE_TIMEOUT_MS);
    };

    const requestPage = (cursor: string | null): boolean => {
      const c = (cursor ?? '').trim();
      if (c && requestedCursors.has(c)) return false;
      if (c) requestedCursors.add(c);
      try {
        api.listener.requestOldMessages(threadType, c || null);
        stats.pagesRequested++;
        resetIdleTimer();
        return true;
      } catch (err) {
        logger.warn(`[backfill:${accountId}] requestOldMessages failed:`, err);
        return false;
      }
    };

    const onPage = async (messages: any[], type: number) => {
      if (finished) return;
      if (type !== threadType) return;
      if (!Array.isArray(messages) || messages.length === 0) { finish(); return; }

      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const allOlderThan30Days = messages.every(m => {
        const ts = parseInt(m?.data?.ts || '0');
        return ts > 0 && ts < thirtyDaysAgo;
      });

      if (allOlderThan30Days) {
        logger.info(`[backfill:${accountId}] All messages in page are older than 30 days. Stopping DM pump.`);
        if (emitProgress) {
          emitProgress('dm_progress', `Đã đạt giới hạn 30 ngày. Dừng tải tin nhắn cá nhân.`);
        }
        finish();
        return;
      }

      const threadTypeLabel = threadType === THREAD_TYPE_USER ? 'user' : 'group';
      stats.messagesReceived += messages.length;
      logger.info(`[backfill:${accountId}] DM page received: ${messages.length} message(s) (received total=${stats.messagesReceived})`);
      if (emitProgress) {
        emitProgress('dm_progress', `Đã tải ${stats.messagesReceived} tin nhắn cá nhân (trang ${stats.pagesRequested})...`);
      }

      // Persist each message directly. Use senderUid as fallback threadId for
      // self messages, since Zalo's payload puts the peer in idTo.
      for (const m of messages) {
        try {
          const timestamp = parseInt(m?.data?.ts || String(Date.now()));
          if (timestamp < thirtyDaysAgo) {
            continue; // Skip messages older than 30 days
          }

          const isSelf = Boolean(m?.isSelf);
          const senderUid = String(m?.data?.uidFrom || '');
          const threadId = String(m?.threadId || (isSelf ? m?.data?.idTo : senderUid) || '');
          if (!threadId) continue;

          const rawContent = m?.data?.content;
          const content =
            typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent || '');
          const contentType = detectContentType(m?.data?.msgType, rawContent);
          const album = extractAlbumInfo(contentType, rawContent);

          const inserted = await handleIncomingMessage({
            accountId,
            senderUid,
            senderName: m?.data?.dName || '',
            content,
            contentType,
            msgId: String(m?.data?.msgId || m?.data?.cliMsgId || ''),
            timestamp: parseInt(m?.data?.ts || String(Date.now())),
            isSelf,
            threadId,
            threadType: threadTypeLabel as 'user' | 'group',
            attachments: [],
            quote: m?.data?.quote,
            albumKey: album.albumKey,
            albumIndex: album.albumIndex,
            albumTotal: album.albumTotal,
            isBackfill: true,
          });
          if (inserted) stats.messagesInserted++;
        } catch (err) {
          logger.warn(`[backfill:${accountId}] DM insert failed:`, err);
        }
      }

      if (stats.pagesRequested >= DM_MAX_PAGES) { finish(); return; }

      // Try multi-cursor candidates — different cursors may unlock different
      // page slices (oldest-by-ts / last / first).
      const candidates = pickNextCursors(messages);
      let requested = false;
      for (const c of candidates) {
        if (requestPage(c)) { requested = true; break; }
      }
      if (!requested) finish();
    };

    api.listener.on('old_messages', onPage);
    if (!requestPage(null)) finish();
  });
}

export function backfillAccountHistory(api: any, accountId: string): Promise<BackfillResult> {
  const existing = backfillInFlight.get(accountId);
  if (existing) {
    logger.info(`[backfill:${accountId}] Reusing in-flight backfill`);
    return existing;
  }
  const recent = recentBackfills.get(accountId);
  if (recent && Date.now() - recent.completedAt < BACKFILL_REPEAT_GUARD_MS) {
    logger.info(`[backfill:${accountId}] Reusing recently completed backfill`);
    return Promise.resolve(recent.result);
  }
  const task = backfillAccountHistoryImpl(api, accountId)
    .then((result) => {
      recentBackfills.set(accountId, { completedAt: Date.now(), result });
      return result;
    })
    .finally(() => {
      if (backfillInFlight.get(accountId) === task) backfillInFlight.delete(accountId);
    });
  backfillInFlight.set(accountId, task);
  return task;
}

async function backfillAccountHistoryImpl(api: any, accountId: string): Promise<BackfillResult> {
  const result: BackfillResult = {
    friendsSynced: 0,
    groupsSynced: 0,
    messagesBackfilled: 0,
    dmPagesRequested: 0,
    errors: 0,
  };

  const account = await prisma.zaloAccount.findUnique({
    where: { id: accountId },
    select: { orgId: true },
  });
  if (!account) {
    logger.warn(`[backfill:${accountId}] Account not found`);
    return result;
  }

  const { zaloPool } = await import('./zalo-pool.js');
  const io = zaloPool.getIO();
  const emitProgress = (step: string, message: string) => {
    io?.to(`org:${account.orgId}`).emit('zalo:sync-progress', { accountId, step, message });
  };

  // ── 1. Sync friends → contacts (Bỏ qua quét toàn bộ để tăng tốc) ──────────────────
  try {
    emitProgress('friends_start', 'Bỏ qua tải toàn bộ danh bạ để tối ưu tốc độ...');
    await new Promise(resolve => setTimeout(resolve, 300));
    emitProgress('friends_done', 'Liên hệ sẽ được tạo tự động khi tải tin nhắn.');
  } catch (err) {
    result.errors++;
  }

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  // ── 2. Sync groups → conversations + history ───────────────────────────
  let groups: any[] = [];
  try {
    emitProgress('groups_start', 'Đang tải danh sách nhóm chat từ Zalo...');
    const groupsRaw = await api.getAllGroups();
    const groupIds = groupIdsFromCatalog(groupsRaw);
    const infoMap: Record<string, GroupInfo> = { ...(groupsRaw?.gridInfoMap ?? {}) };
    const missingInfoIds = groupIds.filter((id) => !(infoMap[id]?.name || infoMap[id]?.groupName));
    for (let i = 0; i < missingInfoIds.length; i += 50) {
      const ids = missingInfoIds.slice(i, i + 50);
      try {
        const more = await api.getGroupInfo(ids);
        Object.assign(infoMap, more?.gridInfoMap ?? {});
      } catch (err) {
        logger.warn(`[backfill:${accountId}] getGroupInfo batch failed (${ids.length} groups):`, err);
      }
    }
    groups = groupIds.map((groupId) => ({ ...(infoMap[groupId] ?? {}), groupId }));
  } catch (err) {
    result.errors++;
    logger.warn(`[backfill:${accountId}] getAllGroups failed:`, err);
    emitProgress('groups_error', 'Không thể tải danh sách nhóm chat.');
    return result;
  }

  const groupSubset = groups.slice(0, MAX_GROUPS);
  const totalGroups = groupSubset.length;
  let groupHistoryUnavailable = false;
  emitProgress('groups_progress', `Đang tải lịch sử nhóm (0/${totalGroups})...`);

  for (let i = 0; i < totalGroups; i++) {
    const group = groupSubset[i];
    const groupId = String(group?.groupId || group?.id || '');
    if (!groupId) continue;

    try {
      const groupName = group?.name || group?.groupName || 'Nhóm';
      emitProgress('groups_progress', `Đang tải lịch sử nhóm [${groupName}] (${i + 1}/${totalGroups})...`);

      const groupAvatar = group?.avt || group?.avatar || null;
      const membersCount = group?.totalMember ?? group?.memberCount ?? null;

      await prisma.conversation.upsert({
        where: { zaloAccountId_externalThreadId: { zaloAccountId: accountId, externalThreadId: groupId } },
        create: {
          orgId: account.orgId,
          zaloAccountId: accountId,
          contactId: null,
          threadType: 'group',
          externalThreadId: groupId,
          groupName,
          groupAvatarUrl: groupAvatar,
          groupMembersCount: typeof membersCount === 'number' ? membersCount : null,
        },
        update: {
          deletedAt: null,
          threadType: 'group',
          groupName,
          groupAvatarUrl: groupAvatar,
          groupMembersCount: typeof membersCount === 'number' ? membersCount : null,
        },
      });
      result.groupsSynced++;

      if (groupHistoryUnavailable) continue;

      const history = await api.getGroupChatHistory(groupId, MESSAGES_PER_GROUP);
      const messages = history?.groupMsgs || history?.data?.groupMsgs || [];

      for (const msg of messages as any[]) {
        try {
          const timestamp = parseInt(msg?.data?.ts || String(Date.now()));
          if (timestamp < thirtyDaysAgo) {
            continue; // Bỏ qua tin nhắn nhóm cũ hơn 30 ngày
          }

          const zaloMsgId = String(msg?.data?.msgId || msg?.data?.cliMsgId || '');
          if (!zaloMsgId) continue;

          const rawContent = msg?.data?.content;
          const content =
            typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent || '');
          const contentType = detectContentType(msg?.data?.msgType, rawContent);
          const album = extractAlbumInfo(contentType, rawContent);

          const inserted = await handleIncomingMessage({
            accountId,
            senderUid: String(msg?.data?.uidFrom || ''),
            senderName: msg?.data?.dName || '',
            content,
            contentType,
            msgId: zaloMsgId,
            timestamp: parseInt(msg?.data?.ts || String(Date.now())),
            isSelf: Boolean(msg?.isSelf),
            threadId: groupId,
            threadType: 'group',
            groupName,
            groupAvatarUrl: groupAvatar || undefined,
            groupMembersCount: typeof membersCount === 'number' ? membersCount : undefined,
            attachments: [],
            quote: msg?.data?.quote,
            albumKey: album.albumKey,
            albumIndex: album.albumIndex,
            albumTotal: album.albumTotal,
            isBackfill: true,
          });
          if (inserted) result.messagesBackfilled++;
        } catch (err) {
          result.errors++;
          logger.warn(`[backfill:${accountId}] Group ${groupId} message insert failed:`, err);
        }
      }
    } catch (err) {
      result.errors++;
      logger.warn(`[backfill:${accountId}] Group ${groupId} history fetch failed:`, err);
      if (/status code 404|\b404\b/i.test(String(err))) groupHistoryUnavailable = true;
    }
  }
  emitProgress('groups_done', `Đồng bộ nhóm thành công: ${result.groupsSynced} nhóm.`);

  // ── 3. DM history via requestOldMessages pagination ────────────────────
  let dmReceived = 0;
  try {
    emitProgress('dm_start', 'Đang kết nối tải tin nhắn cá nhân...');
    if (api?.listener?.requestOldMessages) {
      const stats = await pumpOldMessages(api, THREAD_TYPE_USER, accountId, emitProgress);
      result.dmPagesRequested = stats.pagesRequested;
      dmReceived = stats.messagesReceived;
      // Count by raw received — main listener may win the insert race, but
      // the message still ends up in DB. messagesInserted alone undercounts.
      result.messagesBackfilled += stats.messagesReceived;
    } else {
      logger.warn(`[backfill:${accountId}] api.listener.requestOldMessages unavailable — skipping DM backfill`);
    }
  } catch (err) {
    result.errors++;
    logger.warn(`[backfill:${accountId}] DM pump failed:`, err);
  }

  // Sanity check: verify what actually landed in DB for this account
  const dbCounts = await tenantTransaction(async (tx) => {
    const conversations = await tx.conversation.count({ where: { zaloAccountId: accountId } });
    const messages = await tx.message.count({
      where: { conversation: { zaloAccountId: accountId } },
    });
    return [conversations, messages] as [number, number];
  }).catch(() => [0, 0] as [number, number]);

  logger.info(
    `[backfill:${accountId}] Done — friends=${result.friendsSynced} groups=${result.groupsSynced} ` +
    `dmReceived=${dmReceived} dmPages=${result.dmPagesRequested} errors=${result.errors} ` +
    `| DB now has ${dbCounts[0]} conversation(s), ${dbCounts[1]} message(s) for this account`,
  );
  return result;
}

/**
 * Backfill only if account has no conversations yet (first-time login).
 * Returns true if backfill was triggered.
 */
export async function backfillIfEmpty(api: any, accountId: string): Promise<boolean> {
  const existing = await prisma.conversation.count({ where: { zaloAccountId: accountId } });
  if (existing > 0) return false;

  logger.info(`[backfill:${accountId}] Empty conversation set detected — starting initial backfill`);
  await backfillAccountHistory(api, accountId);
  return true;
}
