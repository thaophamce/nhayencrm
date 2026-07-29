// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
// ════════════════════════════════════════════════════════════════════════
// Friend blast routes — /api/v1/zalo-accounts/:accountId/friend-blasts
// ════════════════════════════════════════════════════════════════════════
//
// Kết hợp 2 lớp auth (plan yêu cầu cả hai, khác group-scan-routes.ts chỉ có
// checkAccess và broadcast-routes.ts chỉ có requireGrant):
//   1. checkAccess(request, reply, accountId, minPermission) — ACL theo nick
//      (Community pattern, zalo-route-helpers.ts).
//   2. requireGrant('friend_blast', action) — RBAC theo resource (org-level).

import { type FastifyInstance } from 'fastify';
import { prisma, tenantTransaction } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireGrant } from '../rbac/rbac-middleware.js';
import { resolveAccount, checkAccess, handleError } from '../zalo/zalo-route-helpers.js';
import { logger } from '../../shared/utils/logger.js';
import { enqueueFriendBlastTick } from './friend-blast-queue.js';

interface AccountParams {
  accountId: string;
}

interface CampaignParams extends AccountParams {
  id: string;
}

export async function friendBlastRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── POST / — tạo campaign draft + seed recipients pending ──────────────
  app.post<{ Params: AccountParams; Body: any }>(
    '/api/v1/zalo-accounts/:accountId/friend-blasts',
    { preHandler: requireGrant('friend_blast', 'create') },
    async (request, reply) => {
      const { accountId } = request.params;
      const user = request.user!;
      try {
        const account = await resolveAccount(accountId, user.orgId);
        if (!(await checkAccess(request, reply, accountId, 'chat'))) return;

        const { messageText, imageUrl, imageFilename, pacing, friendUids } = (request.body ?? {}) as {
          messageText?: string;
          imageUrl?: string;
          imageFilename?: string;
          pacing?: unknown;
          friendUids?: string[];
        };
        if (!Array.isArray(friendUids) || friendUids.length === 0) {
          return reply.code(400).send({ error: 'friendUids required' });
        }
        if (!messageText && !imageUrl) {
          return reply.code(400).send({ error: 'messageText or imageUrl required' });
        }

        const campaign = await prisma.friendBlastCampaign.create({
          data: {
            orgId: user.orgId,
            zaloAccountId: account.id,
            messageText: messageText ?? null,
            imageUrl: imageUrl ?? null,
            imageFilename: imageFilename ?? null,
            pacing: pacing ?? {},
            createdById: user.id,
          },
        });

        const uniqueUids = Array.from(new Set(friendUids as string[]));
        await prisma.friendBlastRecipient.createMany({
          data: uniqueUids.map((friendUid) => ({ campaignId: campaign.id, friendUid, status: 'pending' })),
          skipDuplicates: true,
        });

        logger.info(`[friend-blast] ${campaign.id} created — ${uniqueUids.length} recipients staged`);
        return reply.code(201).send({ campaign });
      } catch (err) {
        return handleError(reply, err, 'friend-blast:create');
      }
    },
  );

  // ── GET /:id — status + counters ────────────────────────────────────────
  app.get<{ Params: CampaignParams }>(
    '/api/v1/zalo-accounts/:accountId/friend-blasts/:id',
    async (request, reply) => {
      const { accountId, id } = request.params;
      const user = request.user!;
      try {
        await resolveAccount(accountId, user.orgId);
        if (!(await checkAccess(request, reply, accountId, 'read'))) return;

        const campaign = await prisma.friendBlastCampaign.findFirst({
          where: { id, orgId: user.orgId, zaloAccountId: accountId },
        });
        if (!campaign) return reply.code(404).send({ error: 'campaign not found' });
        return reply.send({ campaign });
      } catch (err) {
        return handleError(reply, err, 'friend-blast:get');
      }
    },
  );

  // ── GET /:id/recipients — paginated roster ──────────────────────────────
  app.get<{ Params: CampaignParams; Querystring: { page?: string; pageSize?: string } }>(
    '/api/v1/zalo-accounts/:accountId/friend-blasts/:id/recipients',
    async (request, reply) => {
      const { accountId, id } = request.params;
      const user = request.user!;
      try {
        await resolveAccount(accountId, user.orgId);
        if (!(await checkAccess(request, reply, accountId, 'read'))) return;

        const campaign = await prisma.friendBlastCampaign.findFirst({
          where: { id, orgId: user.orgId, zaloAccountId: accountId },
          select: { id: true },
        });
        if (!campaign) return reply.code(404).send({ error: 'campaign not found' });

        const page = Math.max(1, Number(request.query.page) || 1);
        const pageSize = Math.min(200, Math.max(1, Number(request.query.pageSize) || 50));

        const [recipients, total] = await Promise.all([
          prisma.friendBlastRecipient.findMany({
            where: { campaignId: id },
            orderBy: { createdAt: 'asc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
          }),
          prisma.friendBlastRecipient.count({ where: { campaignId: id } }),
        ]);

        return reply.send({ recipients, total, page, pageSize });
      } catch (err) {
        return handleError(reply, err, 'friend-blast:recipients');
      }
    },
  );

  // ── POST /:id/start ──────────────────────────────────────────────────────
  app.post<{ Params: CampaignParams }>(
    '/api/v1/zalo-accounts/:accountId/friend-blasts/:id/start',
    { preHandler: requireGrant('friend_blast', 'edit') },
    async (request, reply) => {
      const { accountId, id } = request.params;
      const user = request.user!;
      try {
        await resolveAccount(accountId, user.orgId);
        if (!(await checkAccess(request, reply, accountId, 'chat'))) return;

        const campaign = await prisma.friendBlastCampaign.findFirst({
          where: { id, orgId: user.orgId, zaloAccountId: accountId },
        });
        if (!campaign) return reply.code(404).send({ error: 'campaign not found' });

        const { resolveAndEnqueue } = await import('./fire-friend-blast.js');
        const result = await resolveAndEnqueue(id);
        if (!result.claimed) {
          return reply.code(409).send({ error: 'campaign already running or in terminal state' });
        }
        return reply.send(result);
      } catch (err) {
        return handleError(reply, err, 'friend-blast:start');
      }
    },
  );

  // ── POST /:id/pause ──────────────────────────────────────────────────────
  app.post<{ Params: CampaignParams }>(
    '/api/v1/zalo-accounts/:accountId/friend-blasts/:id/pause',
    { preHandler: requireGrant('friend_blast', 'edit') },
    async (request, reply) => {
      const { accountId, id } = request.params;
      const user = request.user!;
      try {
        await resolveAccount(accountId, user.orgId);
        if (!(await checkAccess(request, reply, accountId, 'chat'))) return;

        const campaign = await prisma.friendBlastCampaign.findFirst({
          where: { id, orgId: user.orgId, zaloAccountId: accountId },
        });
        if (!campaign) return reply.code(404).send({ error: 'campaign not found' });
        if (campaign.state !== 'running') {
          return reply.code(409).send({ error: `cannot pause campaign in state ${campaign.state}` });
        }

        const updated = await tenantTransaction(async (tx) => {
          return tx.friendBlastCampaign.update({ where: { id }, data: { state: 'paused' } });
        });
        return reply.send({ campaign: updated });
      } catch (err) {
        return handleError(reply, err, 'friend-blast:pause');
      }
    },
  );

  // ── POST /:id/resume ─────────────────────────────────────────────────────
  app.post<{ Params: CampaignParams }>(
    '/api/v1/zalo-accounts/:accountId/friend-blasts/:id/resume',
    { preHandler: requireGrant('friend_blast', 'edit') },
    async (request, reply) => {
      const { accountId, id } = request.params;
      const user = request.user!;
      try {
        await resolveAccount(accountId, user.orgId);
        if (!(await checkAccess(request, reply, accountId, 'chat'))) return;

        const campaign = await prisma.friendBlastCampaign.findFirst({
          where: { id, orgId: user.orgId, zaloAccountId: accountId },
        });
        if (!campaign) return reply.code(404).send({ error: 'campaign not found' });
        if (campaign.state !== 'paused') {
          return reply.code(409).send({ error: `cannot resume campaign in state ${campaign.state}` });
        }

        const updated = await tenantTransaction(async (tx) => {
          return tx.friendBlastCampaign.update({ where: { id }, data: { state: 'running' } });
        });
        await enqueueFriendBlastTick(id, user.orgId, Date.now() % 1_000_000);
        return reply.send({ campaign: updated });
      } catch (err) {
        return handleError(reply, err, 'friend-blast:resume');
      }
    },
  );

  // ── POST /:id/cancel ──────────────────────────────────────────────────────
  app.post<{ Params: CampaignParams }>(
    '/api/v1/zalo-accounts/:accountId/friend-blasts/:id/cancel',
    { preHandler: requireGrant('friend_blast', 'delete') },
    async (request, reply) => {
      const { accountId, id } = request.params;
      const user = request.user!;
      try {
        await resolveAccount(accountId, user.orgId);
        if (!(await checkAccess(request, reply, accountId, 'chat'))) return;

        const campaign = await prisma.friendBlastCampaign.findFirst({
          where: { id, orgId: user.orgId, zaloAccountId: accountId },
        });
        if (!campaign) return reply.code(404).send({ error: 'campaign not found' });
        if (campaign.state === 'completed' || campaign.state === 'cancelled') {
          return reply.code(409).send({ error: `cannot cancel campaign in state ${campaign.state}` });
        }

        const updated = await tenantTransaction(async (tx) => {
          return tx.friendBlastCampaign.update({
            where: { id },
            data: { state: 'cancelled', completedAt: new Date() },
          });
        });
        return reply.send({ campaign: updated });
      } catch (err) {
        return handleError(reply, err, 'friend-blast:cancel');
      }
    },
  );

  // ── Blacklist sub-resource (scoped theo :accountId) ─────────────────────
  app.get<{ Params: AccountParams }>(
    '/api/v1/zalo-accounts/:accountId/friend-blasts/blacklist',
    async (request, reply) => {
      const { accountId } = request.params;
      const user = request.user!;
      try {
        const account = await resolveAccount(accountId, user.orgId);
        if (!(await checkAccess(request, reply, accountId, 'read'))) return;

        const entries = await prisma.friendBlacklist.findMany({
          where: { orgId: user.orgId, zaloAccountId: account.id },
          orderBy: { createdAt: 'desc' },
        });
        return reply.send({ entries });
      } catch (err) {
        return handleError(reply, err, 'friend-blast:blacklist:list');
      }
    },
  );

  app.post<{ Params: AccountParams; Body: { friendUid: string; note?: string } }>(
    '/api/v1/zalo-accounts/:accountId/friend-blasts/blacklist',
    { preHandler: requireGrant('friend_blast', 'edit') },
    async (request, reply) => {
      const { accountId } = request.params;
      const user = request.user!;
      try {
        const account = await resolveAccount(accountId, user.orgId);
        if (!(await checkAccess(request, reply, accountId, 'chat'))) return;

        const { friendUid, note } = request.body ?? {};
        if (!friendUid) return reply.code(400).send({ error: 'friendUid required' });

        const entry = await prisma.friendBlacklist.upsert({
          where: { zaloAccountId_friendUid: { zaloAccountId: account.id, friendUid } },
          update: { note: note ?? null },
          create: { orgId: user.orgId, zaloAccountId: account.id, friendUid, note: note ?? null },
        });
        return reply.code(201).send({ entry });
      } catch (err) {
        return handleError(reply, err, 'friend-blast:blacklist:create');
      }
    },
  );

  app.delete<{ Params: AccountParams & { friendUid: string } }>(
    '/api/v1/zalo-accounts/:accountId/friend-blasts/blacklist/:friendUid',
    { preHandler: requireGrant('friend_blast', 'edit') },
    async (request, reply) => {
      const { accountId, friendUid } = request.params;
      const user = request.user!;
      try {
        const account = await resolveAccount(accountId, user.orgId);
        if (!(await checkAccess(request, reply, accountId, 'chat'))) return;

        await prisma.friendBlacklist.deleteMany({
          where: { orgId: user.orgId, zaloAccountId: account.id, friendUid },
        });
        return reply.code(204).send();
      } catch (err) {
        return handleError(reply, err, 'friend-blast:blacklist:delete');
      }
    },
  );
}
