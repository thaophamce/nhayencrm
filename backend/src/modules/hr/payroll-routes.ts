// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * payroll-routes.ts — REST API Lương HR. Auth + orgId scope; view_all/edit gated trong controller.
 * Độc lập với báo cáo lương designer (orders).
 */
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { listPayroll, myPayroll, upsertPayroll } from './payroll-controller.js';

export async function payrollRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/payroll/me', myPayroll);
  app.put('/api/v1/payroll/:userId', upsertPayroll);
  // Đặt cuối để '/me' không bị nuốt.
  app.get('/api/v1/payroll', listPayroll);
}
