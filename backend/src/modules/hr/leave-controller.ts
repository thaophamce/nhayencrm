// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * leave-controller.ts — nghỉ phép: user tự gửi đơn, admin/manager duyệt.
 *
 * Port GIAOVAN: type normal|multi_day|emergency; session morning|afternoon|full|multi;
 * status pending|approved|rejected. Nghỉ phép KHÔNG tự trừ chấm công/lương (chỉ hiển thị).
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { userHasGrant } from '../rbac/permission-group-service.js';
import { sendSystemNotificationToUser } from '../system-notifications/system-notify-service.js';
import { sendNewLeaveEmail, sendReviewedLeaveEmail } from './leave-email-service.js';

const LEAVE_TYPES = ['normal', 'multi_day', 'emergency'];
const LEAVE_SESSIONS = ['morning', 'afternoon', 'full', 'multi'];
const LEAVE_STATUSES = ['pending', 'approved', 'rejected'];

const LEAVE_USER_SELECT = { id: true, fullName: true, email: true } as const;

// Nhãn tiếng Việt cho nội dung thông báo Zalo (đồng bộ constants/hr.ts phía FE).
const TYPE_LABEL: Record<string, string> = {
  normal: 'Nghỉ phép',
  multi_day: 'Nghỉ nhiều ngày',
  emergency: 'Nghỉ khẩn',
};
const SESSION_LABEL: Record<string, string> = {
  morning: 'buổi sáng',
  afternoon: 'buổi chiều',
  full: 'cả ngày',
  multi: 'nhiều ngày',
};

function isValidDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function leaveDateRange(startDate: string, endDate: string): string {
  return startDate === endDate ? startDate : `${startDate} → ${endDate}`;
}

/**
 * Báo Zalo cho toàn bộ owner/admin trong org khi có đơn nghỉ mới.
 * Fire-and-forget: bọc try/catch, KHÔNG để lỗi thông báo làm hỏng luồng tạo đơn
 * (nick hệ thống offline / user chưa Check Live → đơn vẫn tạo bình thường).
 */
async function notifyAdminsNewLeave(
  orgId: string,
  applicantName: string,
  leave: { type: string; session: string; startDate: string; endDate: string; reason: string },
): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { orgId, role: { in: ['owner', 'admin'] } },
      select: { id: true },
    });
    if (admins.length === 0) return;
    const typeLabel = TYPE_LABEL[leave.type] ?? leave.type;
    const sessionLabel = SESSION_LABEL[leave.session] ?? leave.session;
    const content =
      `${applicantName} vừa gửi đơn ${typeLabel.toLowerCase()} (${sessionLabel}).\n` +
      `Thời gian: ${leaveDateRange(leave.startDate, leave.endDate)}\n` +
      `Lý do: ${leave.reason}\n` +
      `Vào tab "Duyệt nghỉ phép" để xử lý.`;
    await Promise.allSettled(
      admins.map((a) =>
        sendSystemNotificationToUser({
          orgId,
          targetUserId: a.id,
          type: 'leave_request',
          title: '📩 Đơn nghỉ phép mới',
          content,
          priority: 'normal',
        }),
      ),
    );
  } catch (err) {
    logger.warn('[leave] notifyAdminsNewLeave failed (bỏ qua, không chặn tạo đơn):', err);
  }
}

/**
 * Báo Zalo lại cho nhân viên khi đơn được duyệt/từ chối. Fire-and-forget.
 */
async function notifyEmployeeReviewed(
  orgId: string,
  targetUserId: string,
  leave: { type: string; startDate: string; endDate: string; status: string; reviewNote: string | null },
): Promise<void> {
  try {
    const typeLabel = TYPE_LABEL[leave.type] ?? leave.type;
    const approved = leave.status === 'approved';
    const verb = approved ? 'đã được DUYỆT ✅' : 'bị TỪ CHỐI ❌';
    let content =
      `Đơn ${typeLabel.toLowerCase()} (${leaveDateRange(leave.startDate, leave.endDate)}) của bạn ${verb}.`;
    if (leave.reviewNote) content += `\nGhi chú: ${leave.reviewNote}`;
    await sendSystemNotificationToUser({
      orgId,
      targetUserId,
      type: 'leave_reviewed',
      title: approved ? '✅ Đơn nghỉ được duyệt' : '❌ Đơn nghỉ bị từ chối',
      content,
      priority: 'normal',
    });
  } catch (err) {
    logger.warn('[leave] notifyEmployeeReviewed failed (bỏ qua, không chặn duyệt):', err);
  }
}

// ── POST /leave — user tự gửi đơn ────────────────────────────────────────────
export async function createLeave(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
  try {
    const user = request.user!;
    const body = (request.body ?? {}) as {
      type?: string;
      session?: string;
      startDate?: string;
      endDate?: string;
      reason?: string;
    };

    if (!LEAVE_TYPES.includes(body.type ?? '')) {
      return reply.status(400).send({ error: 'type_invalid', hint: 'type = normal|multi_day|emergency' });
    }
    if (!LEAVE_SESSIONS.includes(body.session ?? '')) {
      return reply.status(400).send({ error: 'session_invalid', hint: 'session = morning|afternoon|full|multi' });
    }
    if (!isValidDate(body.startDate) || !isValidDate(body.endDate)) {
      return reply.status(400).send({ error: 'date_invalid', hint: 'startDate/endDate = YYYY-MM-DD' });
    }
    if (body.endDate! < body.startDate!) {
      return reply.status(400).send({ error: 'date_range_invalid', hint: 'endDate phải ≥ startDate' });
    }
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length === 0) {
      return reply.status(400).send({ error: 'reason_required', hint: 'Nhập lý do nghỉ' });
    }

    const record = await prisma.leaveRequest.create({
      data: {
        orgId: user.orgId,
        userId: user.id,
        type: body.type!,
        session: body.session!,
        startDate: body.startDate!,
        endDate: body.endDate!,
        reason,
        status: 'pending',
      },
      include: { user: { select: LEAVE_USER_SELECT } },
    });
    // Báo Zalo cho admin duyệt (fire-and-forget, không chặn response).
    void notifyAdminsNewLeave(user.orgId, record.user?.fullName || record.user?.email || 'Nhân viên', {
      type: record.type,
      session: record.session,
      startDate: record.startDate,
      endDate: record.endDate,
      reason: record.reason,
    });
    void sendNewLeaveEmail({
      staffName: record.user?.fullName || record.user?.email || 'Nhân viên',
      employeeEmail: record.user?.email,
      type: record.type,
      session: record.session,
      startDate: record.startDate,
      endDate: record.endDate,
      reason: record.reason,
    });
    return record;
  } catch (err) {
    logger.error('[leave] createLeave error:', err);
    return reply.status(500).send({ error: 'Failed to create leave request' });
  }
}

// ── GET /leave/me — đơn của chính user ───────────────────────────────────────
export async function myLeaves(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
  try {
    const user = request.user!;
    const { status } = (request.query ?? {}) as { status?: string };
    const where: any = { orgId: user.orgId, userId: user.id };
    if (status) {
      if (!LEAVE_STATUSES.includes(status)) return reply.status(400).send({ error: 'status_invalid' });
      where.status = status;
    }
    const records = await prisma.leaveRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { reviewedBy: { select: LEAVE_USER_SELECT } },
    });
    return { records };
  } catch (err) {
    logger.error('[leave] myLeaves error:', err);
    return reply.status(500).send({ error: 'Failed to load leave requests' });
  }
}

// ── GET /leave — admin/manager xem tất cả (gated view_all) ────────────────────
export async function listLeaves(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
  try {
    const user = request.user!;
    const allowed = await userHasGrant(user.id, 'leave', 'view_all');
    if (!allowed) return reply.status(403).send({ error: 'forbidden', code: 'RBAC_FORBIDDEN' });

    const { status, userId, month } = (request.query ?? {}) as {
      status?: string;
      userId?: string;
      month?: string;
    };
    const where: any = { orgId: user.orgId };
    if (status) {
      if (!LEAVE_STATUSES.includes(status)) return reply.status(400).send({ error: 'status_invalid' });
      where.status = status;
    }
    if (userId) where.userId = userId;
    if (month) {
      if (!/^\d{4}-\d{2}$/.test(month)) return reply.status(400).send({ error: 'month_invalid' });
      // Đơn giao thoa tháng: startDate trong tháng là đủ cho danh sách duyệt.
      where.startDate = { startsWith: month };
    }
    const records = await prisma.leaveRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: LEAVE_USER_SELECT },
        reviewedBy: { select: LEAVE_USER_SELECT },
      },
    });
    return { records };
  } catch (err) {
    logger.error('[leave] listLeaves error:', err);
    return reply.status(500).send({ error: 'Failed to load leave requests' });
  }
}

// ── PATCH /leave/:id/review — admin duyệt/từ chối (gated leave.edit) ──────────
export async function reviewLeave(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
  try {
    const user = request.user!;
    const allowed = await userHasGrant(user.id, 'leave', 'edit');
    if (!allowed) return reply.status(403).send({ error: 'forbidden', code: 'RBAC_FORBIDDEN' });

    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { status?: string; reviewNote?: string };
    if (body.status !== 'approved' && body.status !== 'rejected') {
      return reply.status(400).send({ error: 'status_invalid', hint: 'status = approved|rejected' });
    }

    const existing = await prisma.leaveRequest.findFirst({
      where: { id, orgId: user.orgId },
      select: { id: true, status: true },
    });
    if (!existing) return reply.status(404).send({ error: 'not_found' });

    const record = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: body.status,
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewNote: typeof body.reviewNote === 'string' ? body.reviewNote.trim() || null : null,
      },
      include: {
        user: { select: LEAVE_USER_SELECT },
        reviewedBy: { select: LEAVE_USER_SELECT },
      },
    });
    // Báo Zalo lại cho nhân viên (fire-and-forget, không chặn response).
    void notifyEmployeeReviewed(user.orgId, record.userId, {
      type: record.type,
      startDate: record.startDate,
      endDate: record.endDate,
      status: record.status,
      reviewNote: record.reviewNote,
    });
    void sendReviewedLeaveEmail({
      staffName: record.user?.fullName || record.user?.email || 'Nhân viên',
      employeeEmail: record.user?.email,
      type: record.type,
      session: record.session,
      startDate: record.startDate,
      endDate: record.endDate,
      reason: record.reason,
      status: record.status,
      reviewNote: record.reviewNote,
    });
    return record;
  } catch (err) {
    logger.error('[leave] reviewLeave error:', err);
    return reply.status(500).send({ error: 'Failed to review leave request' });
  }
}
