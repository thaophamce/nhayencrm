// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * group-scan-routes.ts — E1 Quét group (🟢 Community).
 * Routes: /api/v1/zalo-accounts/:accountId/group-scans
 *   POST   /                       — tạo scan (selected|all) + enqueue
 *   GET    /:scanId                — trạng thái scan
 *   GET    /:scanId/members        — roster (filter isFriend, phân trang)
 *   POST   /:scanId/members/export-to-list — đưa thành viên đã quét (là bạn) vào Tệp KH
 *
 * Auth/error: mirror group-routes.ts (authMiddleware + resolveAccount +
 * checkAccess('read') + handleError).
 */
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { zaloOps } from '../../shared/zalo-operations.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { resolveAccount, checkAccess, handleError } from './zalo-route-helpers.js';
import { enqueueGroupScan } from './group-scan-queue.js';
import { randomUUID } from 'node:crypto';
import { appendRowsToList } from '../lists/list-entry-routes.js';
import type { MappedRow } from '../lists/types.js';

const MAX_GROUPS_PER_SCAN = 5000;

export async function groupScanRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  const BASE = '/api/v1/zalo-accounts/:accountId/group-scans';

  // ── Create scan ───────────────────────────────────────────────────────────
  app.post<{ Params: { accountId: string }; Body: { groupIds?: string[]; all?: boolean } }>(
    BASE,
    async (request, reply) => {
      const { accountId } = request.params;
      const { groupIds, all } = request.body ?? {};
      if (!all && (!Array.isArray(groupIds) || groupIds.length === 0)) {
        return reply.status(400).send({ error: 'groupIds array is required when all is not set' });
      }
      // Chặn payload khổng lồ (review #4): IN (...) lớn + job/row flood.
      if (Array.isArray(groupIds) && groupIds.length > MAX_GROUPS_PER_SCAN) {
        return reply
          .status(400)
          .send({ error: `too many groupIds (max ${MAX_GROUPS_PER_SCAN})` });
      }
      try {
        const account = await resolveAccount(accountId, request.user!.orgId);
        if (!(await checkAccess(request, reply, accountId, 'read'))) return;

        // Dedup in-flight (review #4): 1 nick chỉ 1 scan đang chạy — tránh 2 scan
        // cùng nick race upsert + flood job. Trả scan đang chạy thay vì tạo mới.
        const inFlight = await prisma.groupScan.findFirst({
          where: { zaloAccountId: accountId, orgId: account.orgId, state: { in: ['queued', 'running'] } },
          orderBy: { createdAt: 'desc' },
        });
        if (inFlight) {
          return reply.status(409).send({ error: 'a scan is already running for this account', scan: inFlight });
        }

        let ids: string[];
        let scope: string;
        if (all) {
          // Snapshot toàn bộ group nick đang tham gia → groupIds.
          const res = (await zaloOps.getAllGroups(accountId)) as {
            gridVerMap?: Record<string, string>;
          };
          ids = Object.keys(res?.gridVerMap ?? {});
          scope = 'all';
        } else {
          ids = [...new Set(groupIds!.map(String))];
          scope = 'selected';
        }

        const scan = await prisma.groupScan.create({
          data: {
            orgId: account.orgId,
            zaloAccountId: accountId,
            scope,
            groupIds: ids,
            state: 'queued',
            totalGroups: ids.length,
          },
        });

        await enqueueGroupScan(scan.id);
        return reply.status(201).send({ scan });
      } catch (err) {
        return handleError(reply, err, 'createGroupScan');
      }
    },
  );

  // ── Scan status ───────────────────────────────────────────────────────────
  app.get<{ Params: { accountId: string; scanId: string } }>(
    `${BASE}/:scanId`,
    async (request, reply) => {
      const { accountId, scanId } = request.params;
      try {
        await resolveAccount(accountId, request.user!.orgId);
        if (!(await checkAccess(request, reply, accountId, 'read'))) return;

        const scan = await prisma.groupScan.findFirst({
          where: { id: scanId, zaloAccountId: accountId, orgId: request.user!.orgId },
        });
        if (!scan) return reply.status(404).send({ error: 'Scan not found' });
        return { scan };
      } catch (err) {
        return handleError(reply, err, 'getGroupScan');
      }
    },
  );

  // ── Roster (members of scan's groups) ─────────────────────────────────────
  app.get<{
    Params: { accountId: string; scanId: string };
    Querystring: { isFriend?: string; page?: string; limit?: string };
  }>(`${BASE}/:scanId/members`, async (request, reply) => {
    const { accountId, scanId } = request.params;
    const { isFriend, page, limit } = request.query;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'read'))) return;

      const scan = await prisma.groupScan.findFirst({
        where: { id: scanId, zaloAccountId: accountId, orgId: request.user!.orgId },
        select: { groupIds: true },
      });
      if (!scan) return reply.status(404).send({ error: 'Scan not found' });

      const groupIds: string[] = Array.isArray(scan.groupIds)
        ? (scan.groupIds as unknown[]).map(String)
        : [];

      const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
      const limitNum = Math.min(200, Math.max(1, parseInt(limit ?? '50', 10) || 50));

      const where: {
        zaloAccountId: string;
        groupId: { in: string[] };
        isFriend?: boolean;
      } = { zaloAccountId: accountId, groupId: { in: groupIds } };
      if (isFriend === 'true') where.isFriend = true;
      else if (isFriend === 'false') where.isFriend = false;

      const [members, total] = await Promise.all([
        prisma.groupMember.findMany({
          where,
          orderBy: { lastSeenAt: 'desc' },
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
        }),
        prisma.groupMember.count({ where }),
      ]);

      return { members, total, page: pageNum, limit: limitNum };
    } catch (err) {
      return handleError(reply, err, 'getGroupScanMembers');
    }
  });

  // ── Export scanned members → Tệp khách hàng (CustomerList) ────────────────
  // Chỉ export được thành viên isFriend=true (resolve phone qua Friend→Contact
  // join — người lạ chưa kết bạn không có phone nên bị skip).
  // Body: { memberUids?: string[] (rỗng/omit = toàn bộ friend trong scan),
  //         targetListId?: string (thêm vào tệp có sẵn),
  //         newListName?: string (tạo tệp mới nếu không có targetListId) }
  app.post<{
    Params: { accountId: string; scanId: string };
    Body: { memberUids?: string[]; targetListId?: string; newListName?: string };
  }>(`${BASE}/:scanId/members/export-to-list`, async (request, reply) => {
    const { accountId, scanId } = request.params;
    const { memberUids, targetListId, newListName } = request.body ?? {};
    const user = request.user!;
    try {
      await resolveAccount(accountId, user.orgId);
      if (!(await checkAccess(request, reply, accountId, 'read'))) return;

      const scan = await prisma.groupScan.findFirst({
        where: { id: scanId, zaloAccountId: accountId, orgId: user.orgId },
        select: { groupIds: true },
      });
      if (!scan) return reply.status(404).send({ error: 'Scan not found' });

      const groupIds: string[] = Array.isArray(scan.groupIds)
        ? (scan.groupIds as unknown[]).map(String)
        : [];

      // Chỉ friend — người lạ không resolve được phone.
      const memberWhere: {
        zaloAccountId: string;
        groupId: { in: string[] };
        isFriend: true;
        memberUid?: { in: string[] };
      } = { zaloAccountId: accountId, groupId: { in: groupIds }, isFriend: true };
      if (Array.isArray(memberUids) && memberUids.length > 0) {
        memberWhere.memberUid = { in: memberUids };
      }

      const members = await prisma.groupMember.findMany({
        where: memberWhere,
        select: { memberUid: true, displayName: true, zaloName: true },
      });
      const totalRequested = Array.isArray(memberUids) && memberUids.length > 0
        ? memberUids.length
        : members.length;
      if (members.length === 0) {
        return reply.status(400).send({ error: 'no_friend_members', hint: 'Chỉ export được thành viên đã là bạn của nick' });
      }

      // Resolve phone qua Friend (cùng zaloAccountId, zaloUidInNick == memberUid) → Contact.phone
      const uids = members.map((m) => m.memberUid);
      const friends = await prisma.friend.findMany({
        where: { orgId: user.orgId, zaloAccountId: accountId, zaloUidInNick: { in: uids } },
        select: { zaloUidInNick: true, contactId: true },
      });
      const contactIds = [...new Set(friends.map((f) => f.contactId))];
      const contacts = contactIds.length
        ? await prisma.contact.findMany({
            where: { id: { in: contactIds } },
            select: { id: true, phone: true },
          })
        : [];
      const phoneByContactId = new Map(contacts.map((c) => [c.id, c.phone]));
      const contactIdByUid = new Map(friends.map((f) => [f.zaloUidInNick, f.contactId]));

      const rows: MappedRow[] = [];
      let skippedNoPhone = 0;
      for (const m of members) {
        const contactId = contactIdByUid.get(m.memberUid);
        const phone = contactId ? phoneByContactId.get(contactId) : null;
        if (!phone) {
          skippedNoPhone++;
          continue;
        }
        rows.push({ phone, name: m.displayName || m.zaloName || null });
      }

      if (rows.length === 0) {
        return reply.status(400).send({
          error: 'no_resolvable_phone',
          hint: 'Không tìm được SĐT cho thành viên đã chọn (chưa có Contact gắn phone)',
        });
      }

      let listId: string;
      let listName: string;
      if (targetListId) {
        const target = await prisma.customerList.findFirst({
          where: { id: targetListId, orgId: user.orgId },
          select: { id: true, name: true },
        });
        if (!target) return reply.status(404).send({ error: 'list_not_found' });
        const result = await appendRowsToList(target.id, user.orgId, rows);
        if (!result) return reply.status(400).send({ error: 'no_lines_parsed' });
        listId = target.id;
        listName = target.name;
      } else {
        const finalName =
          newListName?.trim() ||
          `Quét nhóm ${new Date().toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
        const created = await prisma.customerList.create({
          data: {
            id: randomUUID(),
            orgId: user.orgId,
            createdById: user.id,
            name: finalName,
            iconEmoji: '👥',
            sourceType: 'group_scan',
            rawText: JSON.stringify(rows).slice(0, 100_000),
            status: 'processing',
            startedAt: new Date(),
          },
        });
        const result = await appendRowsToList(created.id, user.orgId, rows);
        if (!result) {
          await prisma.customerList.delete({ where: { id: created.id } });
          return reply.status(400).send({ error: 'no_lines_parsed' });
        }
        listId = created.id;
        listName = created.name;
      }

      return reply.status(201).send({
        ok: true,
        listId,
        listName,
        totalRequested,
        added: rows.length,
        skippedStranger: totalRequested - members.length,
        skippedNoPhone,
      });
    } catch (err) {
      return handleError(reply, err, 'exportGroupScanMembersToList');
    }
  });
}
