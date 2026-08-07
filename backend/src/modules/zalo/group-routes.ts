// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * group-routes.ts — Group info, CRUD, and membership management.
 * Routes: /api/v1/zalo-accounts/:accountId/groups
 */
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { zaloOps } from '../../shared/zalo-operations.js';
import { resolveAccount, checkAccess, handleError } from './zalo-route-helpers.js';
import { prisma } from '../../shared/database/prisma-client.js';

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
      await prisma.conversation.updateMany({
        where: { orgId: account.orgId, zaloAccountId: accountId, externalThreadId: groupId },
        data: { groupName: name.trim() },
      });
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
