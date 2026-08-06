// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * leave-routes.ts — REST API nghỉ phép. Auth + orgId scope; view_all/edit gated trong controller.
 */
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { createLeave, myLeaves, listLeaves, reviewLeave } from './leave-controller.js';

export async function leaveRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.post('/api/v1/leave', createLeave);
  app.get('/api/v1/leave/me', myLeaves);
  app.patch('/api/v1/leave/:id/review', reviewLeave);
  // Đặt cuối để '/me' không bị nuốt.
  app.get('/api/v1/leave', listLeaves);
}
