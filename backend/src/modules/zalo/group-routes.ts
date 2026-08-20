// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * group-routes.ts — Group info, CRUD, and membership management.
 * Routes: /api/v1/zalo-accounts/:accountId/groups
 */
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { zaloOps, ZaloOpError } from '../../shared/zalo-operations.js';
import { getRedis } from '../../shared/redis-client.js';
import { resolveAccount, checkAccess, handleError } from './zalo-route-helpers.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { evaluateGroupLeaveCandidate, type CandidateFilter, type ExclusionReason, type LeaveStatusId, type SourceGroup } from './group-leave-candidates.js';

type RealtimeApp = FastifyInstance & {
  io?: { to(room: string): { emit(event: string, payload: unknown): unknown } };
};

type GroupCatalog = { gridVerMap?: Record<string, unknown>; gridInfoMap?: Record<string, { name?: string; groupName?: string; totalMember?: number; memberCount?: number; memVerList?: unknown[] }> } | null;
type MembershipSnapshot = { capturedAt: string; ids: string[] };
type MembershipSource = { groups: SourceGroup[]; membershipSource: 'live' | 'snapshot'; membershipSnapshotAt: string };
const membershipSnapshots = new Map<string, MembershipSnapshot>();
const MEMBERSHIP_SNAPSHOT_TTL_SECONDS = 30 * 24 * 60 * 60;
const exclusionKeys: ExclusionReason[] = ['invalid_name', 'unknown_activity', 'date_not_before', 'activity_too_recent', 'keyword_not_matched', 'search_not_matched'];
function values(value: unknown): string[] { return Array.isArray(value) ? value.map(String) : value == null ? [] : [String(value)]; }
function validDate(value: string): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)); }
function parseCandidateFilter(input: Record<string, unknown>, now = new Date()): CandidateFilter | null {
  const beforeDate = String(input.beforeDate ?? ''); const inactiveDays = Number(input.inactiveDays);
  const statuses = values(input.statuses).filter(x => ['designing', 'approved', 'shipping'].includes(x)) as LeaveStatusId[];
  const customKeywords = values(input.customKeywords).map(x => x.trim()).filter(Boolean);
  const search = String(input.search ?? '').trim();
  if (!validDate(beforeDate) || !Number.isInteger(inactiveDays) || inactiveDays < 1 || inactiveDays > 3650 || (!statuses.length && !customKeywords.length) || customKeywords.length > 20 || customKeywords.some(x => x.length > 80) || search.length > 120) return null;
  return { beforeDate, inactiveDays, statuses, customKeywords, search, now };
}
async function loadSourceGroups(accountId: string, onlyIds?: Set<string>): Promise<SourceGroup[]> {
  const infoMap: NonNullable<GroupCatalog>['gridInfoMap'] = {};
  let ids: string[];
  if (onlyIds) {
    // Revalidate the staged IDs directly. Zalo's full catalog can be partial
    // during reconnects and must not cause a false "group set changed" result.
    ids = [...onlyIds];
  } else {
    const raw = await zaloOps.getAllGroups(accountId) as GroupCatalog;
    const verMap = raw?.gridVerMap ?? {};
    Object.assign(infoMap, raw?.gridInfoMap ?? {});
    ids = Object.keys(verMap).length ? Object.keys(verMap) : Object.keys(infoMap);
  }
  const missing = ids.filter(id => !(infoMap[id]?.name || infoMap[id]?.groupName));
  for (let i = 0; i < missing.length; i += 50) {
    const more = await zaloOps.getGroupInfo(accountId, missing.slice(i, i + 50)) as GroupCatalog;
    Object.assign(infoMap, more?.gridInfoMap ?? {});
  }
  const conversations: Array<{ externalThreadId: string | null; lastMessageAt: Date | null }> = [];
  for (let i = 0; i < ids.length; i += 1000) conversations.push(...await prisma.conversation.findMany({ where: { zaloAccountId: accountId, threadType: 'group', externalThreadId: { in: ids.slice(i, i + 1000) } }, select: { externalThreadId: true, lastMessageAt: true } }));
  const convMap = new Map(conversations.map(c => [c.externalThreadId, c.lastMessageAt]));
  return ids.filter(id => !!(infoMap[id]?.name || infoMap[id]?.groupName)).map(id => { const g = infoMap[id] ?? {}; return { id, name: g.name || g.groupName || '', totalMember: g.totalMember ?? g.memberCount ?? (Array.isArray(g.memVerList) ? g.memVerList.length : 0), lastMessageAt: convMap.get(id) ?? null }; });
}

async function loadSyncedSourceGroups(accountId: string, onlyIds?: Set<string>): Promise<SourceGroup[]> {
  const conversations = await prisma.conversation.findMany({
    where: {
      zaloAccountId: accountId,
      threadType: 'group',
      deletedAt: null,
      externalThreadId: onlyIds ? { in: [...onlyIds] } : { not: null },
    },
    select: { externalThreadId: true, groupName: true, groupMembersCount: true, lastMessageAt: true },
  });
  return conversations.map(conversation => ({
    id: conversation.externalThreadId!,
    name: conversation.groupName ?? '',
    totalMember: conversation.groupMembersCount ?? 0,
    lastMessageAt: conversation.lastMessageAt,
  }));
}

async function saveMembershipSnapshot(accountId: string, snapshot: MembershipSnapshot): Promise<void> {
  membershipSnapshots.set(accountId, snapshot);
  try { await (await getRedis())?.set(`zalo:group-membership:${accountId}`, JSON.stringify(snapshot), 'EX', MEMBERSHIP_SNAPSHOT_TTL_SECONDS); } catch { /* optional cache */ }
}

async function readMembershipSnapshot(accountId: string): Promise<MembershipSnapshot | null> {
  try {
    const raw = await (await getRedis())?.get(`zalo:group-membership:${accountId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as MembershipSnapshot;
      if (Array.isArray(parsed.ids) && parsed.capturedAt) return parsed;
    }
  } catch { /* fall through to process-local snapshot */ }
  return membershipSnapshots.get(accountId) ?? null;
}

async function loadCurrentSyncedSourceGroups(accountId: string): Promise<MembershipSource> {
  // getAllGroups is used only as the authoritative membership roster. Names,
  // activity and member counts still come from the synced DB, so this remains
  // one lightweight Zalo call and never fans out into thousands of getGroupInfo calls.
  try {
    const catalog = await zaloOps.getAllGroups(accountId) as GroupCatalog;
    const ids = Object.keys(catalog?.gridVerMap ?? {}).length
      ? Object.keys(catalog?.gridVerMap ?? {})
      : Object.keys(catalog?.gridInfoMap ?? {});
    const snapshot = { capturedAt: new Date().toISOString(), ids };
    await saveMembershipSnapshot(accountId, snapshot);
    return { groups: ids.length ? await loadSyncedSourceGroups(accountId, new Set(ids)) : [], membershipSource: 'live', membershipSnapshotAt: snapshot.capturedAt };
  } catch (err) {
    if (!(err instanceof ZaloOpError) || err.code !== 'NOT_CONNECTED') throw err;
    const snapshot = await readMembershipSnapshot(accountId);
    if (!snapshot) throw err;
    return { groups: snapshot.ids.length ? await loadSyncedSourceGroups(accountId, new Set(snapshot.ids)) : [], membershipSource: 'snapshot', membershipSnapshotAt: snapshot.capturedAt };
  }
}

export async function groupRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  const BASE = '/api/v1/zalo-accounts/:accountId/groups';

  // ── Group Info ──────────────────────────────────────────────────────────────

  app.get<{ Params: { accountId: string } }>(BASE, async (request, reply) => {
    const { accountId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'read'))) return;
      // zca-js getAllGroups() trả OBJECT { gridVerMap:{id:ver}, gridInfoMap:{id:{...}} },
      // KHÔNG phải mảng. Trước đây trả thẳng object này → FE (group-list.vue,
      // chatbot listGroups) làm Array.isArray → false → danh sách nhóm luôn rỗng.
      // Chuẩn hoá thành mảng [{id,name,totalMember}]: gridVerMap là nguồn ID đầy đủ.
      type GInfo = { name?: string; groupName?: string; totalMember?: number; memberCount?: number; memVerList?: unknown[] };
      const raw = (await zaloOps.getAllGroups(accountId)) as {
        gridVerMap?: Record<string, unknown>;
        gridInfoMap?: Record<string, GInfo>;
      } | null;
      const verMap = raw?.gridVerMap ?? {};
      const infoMap: Record<string, GInfo> = { ...(raw?.gridInfoMap ?? {}) };
      const ids = Object.keys(verMap).length ? Object.keys(verMap) : Object.keys(infoMap);

      // getAllGroups thường KHÔNG kèm tên nhóm (gridInfoMap rỗng/thiếu name) → phải
      // bù bằng getGroupInfo (nhận mảng id, trả gridInfoMap có name + totalMember).
      // Chunk 50 id/call để tránh request quá lớn bị Zalo từ chối.
      const missing = ids.filter((id) => !(infoMap[id]?.name || infoMap[id]?.groupName));
      for (let i = 0; i < missing.length; i += 50) {
        const chunk = missing.slice(i, i + 50);
        try {
          const more = (await zaloOps.getGroupInfo(accountId, chunk)) as { gridInfoMap?: Record<string, GInfo> };
          Object.assign(infoMap, more?.gridInfoMap ?? {});
        } catch { /* giữ id, tên để trống — vẫn gán bot được */ }
      }

      const groups = ids.map((id) => {
        const g = infoMap[id] ?? {};
        return {
          id,
          name: g.name || g.groupName || '',
          totalMember:
            g.totalMember ?? g.memberCount ?? (Array.isArray(g.memVerList) ? g.memVerList.length : 0),
        };
      });
      return { groups };
    } catch (err) { return handleError(reply, err, 'getAllGroups'); }
  });

  app.get<{ Params: { accountId: string }; Querystring: Record<string, unknown> }>(`${BASE}/leave-candidates`, async (request, reply) => {
    const { accountId } = request.params;
    const filter = parseCandidateFilter(request.query);
    if (!filter) return reply.status(400).send({ error: 'Bộ lọc không hợp lệ', code: 'INVALID_LEAVE_CANDIDATE_FILTER' });
    try {
      await resolveAccount(accountId, request.user!.orgId); if (!(await checkAccess(request, reply, accountId, 'read'))) return;
      // Intersect synced conversations with Zalo's current membership roster.
      // Historical conversations whose leave event was missed must never become
      // candidates merely because their local deletedAt is still null.
      const membership = await loadCurrentSyncedSourceGroups(accountId); const source = membership.groups; const groups = []; const excludedByReason = Object.fromEntries(exclusionKeys.map(k => [k, 0])) as Record<ExclusionReason, number>;
      for (const group of source) { const result = evaluateGroupLeaveCandidate(group, filter); for (const reason of result.exclusionReasons) excludedByReason[reason]++; if (result.candidate) groups.push(result.candidate); }
      const sortBy = String(request.query.sortBy ?? 'groupDate'); const order = String(request.query.sortOrder ?? 'asc') === 'desc' ? -1 : 1;
      if (!['groupDate', 'lastMessageAt', 'name'].includes(sortBy)) return reply.status(400).send({ error: 'Kiểu sắp xếp không hợp lệ' });
      groups.sort((a, b) => { const av = sortBy === 'groupDate' ? a.parsedCode.date : sortBy === 'lastMessageAt' ? a.lastMessageAt : a.name; const bv = sortBy === 'groupDate' ? b.parsedCode.date : sortBy === 'lastMessageAt' ? b.lastMessageAt : b.name; return av.localeCompare(bv) * order || (a.parsedCode.sequence - b.parsedCode.sequence) || a.id.localeCompare(b.id); });
      return { groups, summary: { totalScanned: source.length, eligible: groups.length, excludedByReason, membershipSource: membership.membershipSource, membershipVerified: membership.membershipSource === 'live', membershipSnapshotAt: membership.membershipSnapshotAt } };
    } catch (err) {
      if (err instanceof ZaloOpError && err.code === 'NOT_CONNECTED') return reply.status(409).send({ error: 'Tài khoản Zalo đang mất kết nối. Hãy kết nối lại tài khoản rồi bấm Cập nhật.', code: 'ZALO_ACCOUNT_DISCONNECTED' });
      return handleError(reply, err, 'getGroupLeaveCandidates');
    }
  });

  app.post<{ Params: { accountId: string }; Body: Record<string, unknown> }>(`${BASE}/leave-candidates/revalidate`, async (request, reply) => {
    const ids = [...new Set(values(request.body?.groupIds))]; const filter = parseCandidateFilter(request.body ?? {});
    if (!filter || !ids.length || ids.length > 100) return reply.status(400).send({ error: 'Dữ liệu kiểm tra lại không hợp lệ' });
    const { accountId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId); if (!(await checkAccess(request, reply, accountId, 'read'))) return;
      // Re-check the exact synced records that produced the queue. Zalo's
      // getGroupInfo may classify existing groups as unchanged/removed and omit
      // them from gridInfoMap; that is not reliable enough to block a whole run.
      // The actual leave operation still asks Zalo for each group individually.
      const source = await loadSyncedSourceGroups(accountId, new Set(ids));
      if (source.length !== ids.length) return reply.status(409).send({ valid: false, error: 'Danh sách nhóm đã thay đổi', code: 'GROUP_SET_CHANGED' });
      const results = source.map(group => { const result = evaluateGroupLeaveCandidate(group, filter); return { id: group.id, valid: !!result.candidate, exclusionReasons: result.exclusionReasons }; });
      return { valid: results.every(x => x.valid), results };
    } catch (err) { return handleError(reply, err, 'revalidateGroupLeaveCandidates'); }
  });

  // Nh?m chung gi?a nick ?ang d?ng v? m?t UID b?n b?. ??t tr??c route /:groupId.
  app.get<{ Params: { accountId: string; memberUid: string } }>(`${BASE}/common/:memberUid`, async (request, reply) => {
    const { accountId, memberUid } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'read'))) return;
      const related = (await zaloOps.getRelatedFriendGroup(accountId, memberUid)) as {
        groupRelateds?: Record<string, string[]>;
      };
      const ids = [...new Set(related?.groupRelateds?.[memberUid] ?? [])];
      if (!ids.length) return { groups: [] };
      const groups: Array<{ id: string; name: string; totalMember: number }> = [];
      for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50);
        const info = (await zaloOps.getGroupInfo(accountId, chunk)) as { gridInfoMap?: Record<string, any> };
        for (const id of chunk) {
          const group = info?.gridInfoMap?.[id];
          if (!group) continue;
          groups.push({ id, name: group.name || group.groupName || 'Nh?m Zalo', totalMember: group.totalMember ?? group.memberCount ?? (Array.isArray(group.memVerList) ? group.memVerList.length : 0) });
        }
      }
      return { groups };
    } catch (err) { return handleError(reply, err, 'getCommonGroups'); }
  });

  app.get<{ Params: { accountId: string; groupId: string } }>(`${BASE}/:groupId`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'read'))) return;
      return { group: await zaloOps.getGroupInfo(accountId, groupId) };
    } catch (err) { return handleError(reply, err, 'getGroupInfo'); }
  });

  app.get<{ Params: { accountId: string; groupId: string } }>(`${BASE}/:groupId/members`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'read'))) return;
      // 1) getGroupInfo → memVerList ("uid_ver"); 2) getGroupMembersInfo(uids) → profile.
      const info = await zaloOps.getGroupInfo(accountId, groupId) as any;
      const grid = info?.gridInfoMap?.[groupId] ?? Object.values(info?.gridInfoMap ?? {})[0];
      const rawIds: string[] = Array.isArray(grid?.memVerList) ? grid.memVerList : [];
      const uids = [...new Set(rawIds.map((k) => String(k).split('_')[0]).filter(Boolean))];
      if (uids.length === 0) return { members: [] };
      const prof = await zaloOps.getGroupMembersInfo(accountId, uids) as any;
      const profiles = prof?.profiles ?? {};
      const members = Object.values(profiles).map((p: any) => ({
        uid: p.id,
        displayName: p.displayName || p.zaloName || p.id,
        avatar: p.avatar ?? null,
      }));
      return { members };
    } catch (err) { return handleError(reply, err, 'getGroupMembersInfo'); }
  });

  // ── Group CRUD ──────────────────────────────────────────────────────────────

  app.post<{ Params: { accountId: string }; Body: { name: string; memberIds: string[] } }>(BASE, async (request, reply) => {
    const { accountId } = request.params;
    const { name, memberIds } = request.body ?? {};
    if (!name || !Array.isArray(memberIds) || memberIds.length === 0) {
      return reply.status(400).send({ error: 'name and memberIds are required' });
    }
    try {
      const account = await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      const group = await zaloOps.createGroup(accountId, { name, memberIds }) as {
        groupId?: string; sucessMembers?: string[]; errorMembers?: string[]; [key: string]: unknown;
      };
      if (!group?.groupId) throw new Error('Zalo did not return groupId');

      // Tạo hội thoại CRM ngay sau khi Zalo tạo nhóm thành công. Dùng mốc tạo nhóm
      // làm activity đầu tiên để hội thoại mới đứng đầu danh sách, không phải chờ
      // group event/message đầu tiên từ listener Zalo.
      const createdAt = new Date();
      // L?u b?ng ch?ng th?nh vi?n ngay l?c t?o nh?m. N?u ch? roster scan ho?c tin nh?n ??u ti?n,
      // ?T?t c? h?i tho?i c?a kh?ch n?y? ch?a th? n?i nh?m m?i v?i kh?ch v?a ???c th?m.
      const successfulMemberIds = [...new Set(
        (Array.isArray(group.sucessMembers) ? group.sucessMembers : memberIds)
          .map((memberId) => String(memberId).trim())
          .filter(Boolean),
      )];
      const conversation = await prisma.$transaction(async (tx) => {
        const row = await tx.conversation.upsert({
          where: { zaloAccountId_externalThreadId: { zaloAccountId: accountId, externalThreadId: group.groupId! } },
          create: {
            orgId: account.orgId,
            zaloAccountId: accountId,
            contactId: null,
            threadType: 'group',
            externalThreadId: group.groupId!,
            groupName: name.trim(),
            groupMembersCount: successfulMemberIds.length + 1,
            lastMessageAt: createdAt,
            unreadCount: 0,
            isReplied: true,
          },
          update: {
            deletedAt: null,
            threadType: 'group',
            groupName: name.trim(),
            groupMembersCount: successfulMemberIds.length + 1,
            lastMessageAt: createdAt,
          },
          select: { id: true },
        });
        if (successfulMemberIds.length) {
          await tx.groupMember.createMany({
            data: successfulMemberIds.map((memberUid) => ({
              orgId: account.orgId,
              zaloAccountId: accountId,
              groupId: group.groupId!,
              memberUid,
              isFriend: memberIds.includes(memberUid),
              harvestedAt: createdAt,
              lastSeenAt: createdAt,
            })),
            skipDuplicates: true,
          });
        }
        return row;
      });
      return reply.status(201).send({ group, conversationId: conversation.id });
    } catch (err) { return handleError(reply, err, 'createGroup'); }
  });

  app.patch<{ Params: { accountId: string; groupId: string }; Body: { name: string } }>(`${BASE}/:groupId/name`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    const { name } = request.body ?? {};
    if (!name) return reply.status(400).send({ error: 'name is required' });
    try {
      const account = await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'chat'))) return;
      const result = await zaloOps.renameGroup(accountId, name, groupId);
      // Cập nhật DB để frontend refetch thấy tên mới (2026-08-06 fix dialog đổi tên nhóm)
      const updated = await prisma.conversation.updateMany({
        where: { orgId: account.orgId, zaloAccountId: accountId, externalThreadId: groupId },
        data: { groupName: name.trim() },
      });
      if (updated.count > 0) {
        const conversations = await prisma.conversation.findMany({
          where: { orgId: account.orgId, zaloAccountId: accountId, externalThreadId: groupId },
          select: { id: true },
        });
        const io = (app as RealtimeApp).io;
        for (const conversation of conversations) {
          io?.to(`org:${account.orgId}`).emit('chat:group-info-updated', {
            conversationId: conversation.id,
            groupName: name.trim(),
          });
        }
      }
      return { result };
    } catch (err) { return handleError(reply, err, 'renameGroup'); }
  });

  app.patch<{ Params: { accountId: string; groupId: string }; Body: Record<string, unknown> }>(`${BASE}/:groupId/settings`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      return { result: await zaloOps.updateGroupSettings(accountId, request.body ?? {}, groupId) };
    } catch (err) { return handleError(reply, err, 'updateGroupSettings'); }
  });

  // ── Membership ──────────────────────────────────────────────────────────────

  app.post<{ Params: { accountId: string; groupId: string }; Body: { userIds: string[] } }>(`${BASE}/:groupId/members`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    const { userIds } = request.body ?? {};
    if (!Array.isArray(userIds) || userIds.length === 0) return reply.status(400).send({ error: 'userIds array is required' });
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'chat'))) return;
      return { result: await zaloOps.addUserToGroup(accountId, userIds, groupId) };
    } catch (err) { return handleError(reply, err, 'addUserToGroup'); }
  });

  app.delete<{ Params: { accountId: string; groupId: string }; Body: { userIds: string[] } }>(`${BASE}/:groupId/members`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    const { userIds } = request.body ?? {};
    if (!Array.isArray(userIds) || userIds.length === 0) return reply.status(400).send({ error: 'userIds array is required' });
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      return { result: await zaloOps.removeUserFromGroup(accountId, userIds, groupId) };
    } catch (err) { return handleError(reply, err, 'removeUserFromGroup'); }
  });

  app.post<{ Params: { accountId: string; groupId: string }; Body: { userId: string } }>(`${BASE}/:groupId/deputies`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    const { userId } = request.body ?? {};
    if (!userId) return reply.status(400).send({ error: 'userId is required' });
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      return { result: await zaloOps.addGroupDeputy(accountId, userId, groupId) };
    } catch (err) { return handleError(reply, err, 'addGroupDeputy'); }
  });

  app.delete<{ Params: { accountId: string; groupId: string; userId: string } }>(`${BASE}/:groupId/deputies/:userId`, async (request, reply) => {
    const { accountId, groupId, userId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      return { result: await zaloOps.removeGroupDeputy(accountId, userId, groupId) };
    } catch (err) { return handleError(reply, err, 'removeGroupDeputy'); }
  });

  app.post<{ Params: { accountId: string; groupId: string }; Body: { newOwnerId: string } }>(`${BASE}/:groupId/transfer`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    const { newOwnerId } = request.body ?? {};
    if (!newOwnerId) return reply.status(400).send({ error: 'newOwnerId is required' });
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      return { result: await zaloOps.changeGroupOwner(accountId, newOwnerId, groupId) };
    } catch (err) { return handleError(reply, err, 'changeGroupOwner'); }
  });
}
