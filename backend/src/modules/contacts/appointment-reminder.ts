/**
 * appointment-reminder.ts — Cron job that emits Socket.IO reminders
 * for appointments scheduled tomorrow.
 * Runs daily at 08:00 Vietnam time (01:00 UTC).
 */
import cron from 'node-cron';
import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { withTenant } from '../../shared/tenant/tenant-context.js';
import { logger } from '../../shared/utils/logger.js';

export function startAppointmentReminder(io: Server): void {
  // 01:00 UTC = 08:00 Vietnam time (UTC+7)
  cron.schedule('0 1 * * *', async () => {
    logger.info('[reminder] Checking tomorrow appointments...');

    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const startOfDay = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 0, 0, 0);
      const endOfDay = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 23, 59, 59, 999);

      const appointments = await prisma.appointment.findMany({
        where: {
          appointmentDate: { gte: startOfDay, lte: endOfDay },
          status: 'scheduled',
          reminderSent: false,
        },
        include: {
          contact: { select: { fullName: true, phone: true } },
          assignedUser: { select: { id: true, fullName: true } },
        },
      });

      for (const apt of appointments) {
        io.emit('appointment:reminder', {
          appointmentId: apt.id,
          contactName: apt.contact.fullName,
          contactPhone: apt.contact.phone,
          date: apt.appointmentDate,
          time: apt.appointmentTime,
          type: apt.type,
          assignedUserId: apt.assignedUserId,
          assignedUserName: apt.assignedUser?.fullName,
        });

        await withTenant(apt.orgId, () =>
          prisma.appointment.update({
            where: { id: apt.id },
            data: { reminderSent: true },
          })
        );
      }

      logger.info(`[reminder] Sent ${appointments.length} reminder(s)`);
    } catch (err) {
      logger.error('[reminder] Cron job error:', err);
    }
  });

  logger.info('[reminder] Appointment reminder cron started (daily 01:00 UTC)');

  // Auto-flip scheduled → overdue mỗi 5 phút khi appointmentDate < now.
  // (Trước: 30 min — quá lag. Frontend giờ tính effectiveStatus client-side nhưng
  // cron vẫn cần để DB đồng bộ cho query filter / report.)
  async function flipOverdue() {
    try {
      const now = new Date();
      const result = await prisma.appointment.updateMany({
        where: { status: 'scheduled', appointmentDate: { lt: now } },
        data: { status: 'overdue' },
      });
      if (result.count > 0) {
        logger.info(`[appointment] Auto-flipped ${result.count} scheduled → overdue`);
      }
    } catch (err) {
      logger.error('[appointment] Overdue auto-flip error:', err);
    }
  }

  cron.schedule('*/5 * * * *', flipOverdue);
  // Catch-up ngay khi container start — fix rows quá hạn lúc server xuống
  void flipOverdue();

  logger.info('[appointment] Overdue auto-flip cron started (every 5 min + on-boot)');

  // 2026-06-16 — sau giờ hẹn `appointmentActionDelayMinutes` phút (org cấu hình) → gửi
  // tin Zalo kèm LINK để sale bấm đánh dấu Hoàn thành/Huỷ. Mỗi lịch gửi 1 lần (cờ actionPromptSent).
  async function sendActionPrompts() {
    try {
      const now = new Date();
      // Prefilter rộng (buffer 12h): appointmentDate là 00:00 UTC của NGÀY; giờ thật ở
      // appointmentTime có thể trước/sau mốc đó → lấy dư rồi lọc chính xác bằng dueMs bên dưới.
      const prefilterMax = new Date(now.getTime() + 12 * 60 * 60_000);
      const candidates = await prisma.appointment.findMany({
        where: { status: { in: ['scheduled', 'overdue'] }, actionPromptSent: false, appointmentDate: { lte: prefilterMax } },
        select: { id: true, orgId: true, appointmentDate: true, appointmentTime: true },
        take: 200,
      });
      if (!candidates.length) return;
      const orgIds = [...new Set(candidates.map((c) => c.orgId))];
      const orgs = await prisma.organization.findMany({
        where: { id: { in: orgIds } },
        select: { id: true, appointmentZaloReminderEnabled: true, appointmentActionDelayMinutes: true, timezone: true },
      });
      const orgMap = new Map(orgs.map((o) => [o.id, o]));
      const { sendAppointmentActionPrompt, appointmentStartMs } = await import('./appointment-zalo-service.js');
      let sent = 0;
      for (const c of candidates) {
        const o = orgMap.get(c.orgId);
        if (!o?.appointmentZaloReminderEnabled) continue;
        // Mốc gửi link = GIỜ HẸN THẬT (ghép ngày+appointmentTime theo tz org) + delay phút.
        const startMs = appointmentStartMs(c.appointmentDate, c.appointmentTime, o.timezone || '+07:00');
        const dueMs = startMs + (o.appointmentActionDelayMinutes ?? 15) * 60_000;
        if (now.getTime() < dueMs) continue; // chưa tới mốc (giờ hẹn + delay)
        // Set cờ TRƯỚC khi gửi (tránh gửi trùng nếu cron chồng / send chậm).
        await withTenant(c.orgId, () =>
          prisma.appointment.update({ where: { id: c.id }, data: { actionPromptSent: true } }),
        );
        await sendAppointmentActionPrompt(c.id);
        sent++;
      }
      if (sent > 0) logger.info(`[appointment] Sent ${sent} action-prompt link(s)`);
    } catch (err) {
      logger.error('[appointment] action-prompt cron error:', err);
    }
  }
  cron.schedule('*/5 * * * *', sendActionPrompts);
  logger.info('[appointment] Action-prompt link cron started (every 5 min)');
}
