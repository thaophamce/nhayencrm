// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc

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

export async function groupBlastRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // POST / - tạo group blast draft + recipients (ở đây friendUid đóng vai trò là groupId/threadId)
  app.post<{ Params: AccountParams; Body: any }>(
    '/api/v1/zalo-accounts/:accountId/group-blasts',
    { preHandler: requireGrant('friend_blast', 'create') },
    async (request, reply) => {
      const { accountId } = request.params;
      const user = request.user!;
      try {
        const account = await resolveAccount(accountId, user.orgId);
        if (!(await checkAccess(request, reply, accountId, 'chat'))) return;

        const { messageText, imageUrl, imageFilename, pacing, groupUids } = (request.body ?? {}) as {
          messageText?: string;
          imageUrl?: string;
          imageFilename?: string;
          pacing?: unknown;
          groupUids?: string[];
        };
        if (!Array.isArray(groupUids) || groupUids.length === 0) {
          return reply.code(400).send({ error: 'groupUids required' });
        }
        if (!messageText && !imageUrl) {
          return reply.code(400).send({ error: 'messageText or imageUrl required' });
        }

        // Tận dụng bảng FriendBlastCampaign để lưu chiến dịch gửi tin nhóm
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

        const uniqueUids = Array.from(new Set(groupUids as string[]));
        // friendUid ở đây lưu ID nhóm (groupId)
        await prisma.friendBlastRecipient.createMany({
          data: uniqueUids.map((groupId) => ({ campaignId: campaign.id, friendUid: groupId, status: 'pending' })),
          skipDuplicates: true,
        });

        logger.info(`[group-blast] ${campaign.id} created — ${uniqueUids.length} groups staged`);
        return reply.code(201).send({ campaign });
      } catch (err) {
        return handleError(reply, err, 'group-blast:create');
      }
    },
  );
}
