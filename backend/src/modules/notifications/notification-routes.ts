// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Notification routes — computed on-the-fly notifications for the authenticated user.
 * Chuông công việc nội bộ: chấm công, duyệt nghỉ phép và lịch hẹn.
 */
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { getContactScope } from '../contacts/contact-scope.js';
import { normalizeHrConfig, SHIFT_KEYS } from '../hr/hr-config.js';
import { userHasGrant } from '../rbac/permission-group-service.js';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  detail: string;
  priority: string;
  createdAt: string;
}

const SHIFT_LABEL: Record<string, string> = { morning: 'ca sáng', afternoon: 'ca chiều', overtime: 'tăng ca' };

function orgNow(offset: string): { date: string; minutes: number } {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(offset || '+07:00');
  const sign = match?.[1] === '-' ? -1 : 1;
  const offsetMinutes = match ? sign * (Number(match[2]) * 60 + Number(match[3])) : 420;
  const shifted = new Date(Date.now() + offsetMinutes * 60_000);
  return {
    date: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

function hhmm(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export async function notificationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/notifications', async (request) => {
    const user = request.user!;
    const notifications: NotificationItem[] = [];

    const cScope = await getContactScope(user.id, user.orgId, user.role);
    const apptScope: any =
      !cScope.isOrgAdmin && cScope.accessibleContactIds !== null
        ? { contactId: { in: cScope.accessibleContactIds } }
        : {};

    // 1. Ca hiện tại đã mở nhưng nhân viên chưa chấm công.
    const org = await prisma.organization.findUnique({ where: { id: user.orgId }, select: { timezone: true, hrConfig: true } });
    const local = orgNow(org?.timezone || '+07:00');
    const config = normalizeHrConfig(org?.hrConfig);
    const checked = await prisma.attendanceRecord.findMany({
      where: { orgId: user.orgId, userId: user.id, date: local.date },
      select: { shift: true },
    });
    const checkedShifts = new Set(checked.map((item) => item.shift));
    for (const shift of SHIFT_KEYS) {
      const time = config.shifts[shift];
      if (local.minutes >= hhmm(time.start) && local.minutes <= hhmm(time.end) && !checkedShifts.has(shift)) {
        notifications.push({
          id: `attendance-${shift}`,
          type: 'warning',
          priority: 'high',
          title: `Chưa chấm công ${SHIFT_LABEL[shift]}`,
          detail: `Khung giờ ${time.start} – ${time.end}. Chấm công ngay trong khung giờ này.`,
          createdAt: new Date().toISOString(),
        });
      }
    }

    // 2. Người có quyền duyệt thấy số đơn nghỉ đang chờ xử lý.
    if (await userHasGrant(user.id, 'leave', 'edit')) {
      const pendingLeaves = await prisma.leaveRequest.count({ where: { orgId: user.orgId, status: 'pending' } });
      if (pendingLeaves > 0) notifications.push({
        id: 'leave-pending',
        type: 'warning',
        priority: 'high',
        title: `${pendingLeaves} đơn nghỉ phép chờ duyệt`,
        detail: 'Mở danh sách để duyệt hoặc từ chối đơn.',
        createdAt: new Date().toISOString(),
      });
    }

    // 3. Lịch hẹn hôm nay
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const todayApts = await prisma.appointment.findMany({
      where: {
        orgId: user.orgId,
        ...apptScope,
        appointmentDate: { gte: todayStart, lt: todayEnd },
        status: 'scheduled',
      },
      include: { contact: { select: { fullName: true } } },
      take: 5,
    });
    for (const apt of todayApts) {
      notifications.push({
        id: `apt-${apt.id}`,
        type: 'info',
        priority: 'medium',
        title: `Lịch hẹn: ${apt.contact?.fullName || 'KH'}`,
        detail: `${apt.appointmentTime || ''} - ${apt.notes || 'Tái khám'}`,
        createdAt: apt.appointmentDate.toISOString(),
      });
    }

    // 4. Lịch hẹn ngày mai
    const tomorrowStart = new Date(todayEnd);
    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

    const tmrApts = await prisma.appointment.count({
      where: {
        orgId: user.orgId,
        ...apptScope,
        appointmentDate: { gte: tomorrowStart, lt: tomorrowEnd },
        status: 'scheduled',
      },
    });
    if (tmrApts > 0) {
      notifications.push({
        id: 'tmr-apts',
        type: 'info',
        priority: 'low',
        title: `${tmrApts} lịch hẹn ngày mai`,
        detail: 'Chuẩn bị cho ngày mai',
        createdAt: new Date().toISOString(),
      });
    }

    return { notifications };
  });
}
