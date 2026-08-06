// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * attendance-routes.ts — REST API chấm công (tự check-in) + cấu hình HR.
 * Mọi route yêu cầu JWT auth + scope orgId. view_all / config gated trong controller.
 */
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import {
  checkin,
  myAttendance,
  listAttendance,
  getConfig,
  putConfig,
} from './attendance-controller.js';

export async function attendanceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.post('/api/v1/attendance/checkin', checkin);
  app.get('/api/v1/attendance/me', myAttendance);
  app.get('/api/v1/attendance/config', getConfig);
  app.put('/api/v1/attendance/config', putConfig);
  // Đặt sau /me và /config để không nuốt các path con.
  app.get('/api/v1/attendance', listAttendance);
}
