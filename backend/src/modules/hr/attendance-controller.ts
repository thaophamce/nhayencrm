// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * attendance-controller.ts — chấm công (tự check-in) + cấu hình HR.
 *
 * Nghiệp vụ port từ GIAOVAN: 3 ca, grace 15', xác thực IP server-side, không check-out.
 * Trễ → bắt buộc lý do; status on_time|late + lateMinutes. Chống double-checkin qua
 * unique (orgId,userId,date,shift).
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { userHasGrant } from '../rbac/permission-group-service.js';
import {
  DEFAULT_HR_CONFIG,
  normalizeHrConfig,
  isIpAllowed,
  SHIFT_KEYS,
  type HrConfig,
  type ShiftKey,
} from './hr-config.js';

// ── helpers thời gian (múi giờ VN, không phụ thuộc TZ server) ────────────────
const TZ_OFFSET_MINUTES = 7 * 60; // Asia/Ho_Chi_Minh (UTC+7), không DST.

/** Trả về {date:'YYYY-MM-DD', minutes:phút-trong-ngày} theo giờ VN cho 1 mốc UTC. */
function nowInVN(base: Date): { date: string; minutes: number } {
  const shifted = new Date(base.getTime() + TZ_OFFSET_MINUTES * 60_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  return { date: `${y}-${m}-${d}`, minutes };
}

/** 'HH:mm' → phút trong ngày. */
function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((x) => Number(x));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/**
 * Tính trạng thái chấm công. Thuần — test được.
 * checkinMinutes ≤ start+grace → on_time. Ngược lại late, lateMinutes = checkin − start.
 */
export function computeAttendanceStatus(
  checkinMinutes: number,
  shiftStartMinutes: number,
  graceMinutes: number,
): { status: 'on_time' | 'late'; lateMinutes: number } {
  const deadline = shiftStartMinutes + graceMinutes;
  if (checkinMinutes <= deadline) return { status: 'on_time', lateMinutes: 0 };
  return { status: 'late', lateMinutes: checkinMinutes - shiftStartMinutes };
}

export function attendanceWindowState(
  checkinMinutes: number,
  shiftStartMinutes: number,
  shiftEndMinutes: number,
): 'before' | 'open' | 'ended' {
  if (checkinMinutes < shiftStartMinutes) return 'before';
  if (checkinMinutes > shiftEndMinutes) return 'ended';
  return 'open';
}

async function loadHrConfig(orgId: string): Promise<HrConfig> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { hrConfig: true } });
  return normalizeHrConfig(org?.hrConfig ?? null);
}

/** Lấy client IP thật (ưu tiên x-forwarded-for đầu chuỗi khi sau proxy). */
function clientIpOf(request: FastifyRequest): string {
  const xff = request.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) return xff.split(',')[0].trim();
  if (Array.isArray(xff) && xff.length > 0) return xff[0].split(',')[0].trim();
  return request.ip;
}

function isValidMonth(m: unknown): m is string {
  return typeof m === 'string' && /^\d{4}-\d{2}$/.test(m);
}

// ── POST /attendance/checkin ─────────────────────────────────────────────────
export async function checkin(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
  try {
    const user = request.user!;
    const body = (request.body ?? {}) as { shift?: string; lateReason?: string };
    const shift = body.shift as ShiftKey;
    if (!SHIFT_KEYS.includes(shift)) {
      return reply.status(400).send({ error: 'shift_invalid', hint: 'shift phải là morning|afternoon|overtime' });
    }

    const config = await loadHrConfig(user.orgId);

    // Xác thực IP server-side — không tin client.
    const clientIp = clientIpOf(request);
    if (!isIpAllowed(clientIp, config.allowedIps)) {
      return reply.status(403).send({
        error: 'ip_not_allowed',
        hint: 'Bạn phải chấm công trong mạng WiFi công ty',
        clientIp,
      });
    }

    const { date, minutes } = nowInVN(new Date());
    const shiftStart = hhmmToMinutes(config.shifts[shift].start);
    const shiftEnd = hhmmToMinutes(config.shifts[shift].end);
    const windowState = attendanceWindowState(minutes, shiftStart, shiftEnd);
    if (windowState === 'before') {
      return reply.status(403).send({
        error: 'shift_not_started',
        hint: `Ca này chỉ được chấm từ ${config.shifts[shift].start}`,
        opensAt: config.shifts[shift].start,
      });
    }
    if (windowState === 'ended') {
      return reply.status(403).send({
        error: 'shift_ended',
        hint: `Ca này đã kết thúc lúc ${config.shifts[shift].end}`,
        endedAt: config.shifts[shift].end,
      });
    }
    const { status, lateMinutes } = computeAttendanceStatus(minutes, shiftStart, config.graceMinutes);

    // Trễ → bắt buộc lý do.
    const lateReason = typeof body.lateReason === 'string' ? body.lateReason.trim() : '';
    if (status === 'late' && lateReason.length === 0) {
      return reply.status(400).send({
        error: 'late_reason_required',
        hint: 'Đi trễ phải nhập lý do',
        lateMinutes,
      });
    }

    // Chống double-checkin (unique orgId,userId,date,shift).
    const existing = await prisma.attendanceRecord.findFirst({
      where: { orgId: user.orgId, userId: user.id, date, shift },
      select: { id: true },
    });
    if (existing) {
      return reply.status(409).send({ error: 'already_checked_in', hint: 'Bạn đã chấm công ca này hôm nay' });
    }

    const record = await prisma.attendanceRecord.create({
      data: {
        orgId: user.orgId,
        userId: user.id,
        date,
        shift,
        checkinTime: new Date(),
        status,
        lateMinutes,
        lateReason: status === 'late' ? lateReason : null,
        clientIp,
      },
    });
    return record;
  } catch (err) {
    logger.error('[attendance] checkin error:', err);
    return reply.status(500).send({ error: 'Failed to check in' });
  }
}

// ── GET /attendance/me?month=YYYY-MM — lịch sử của chính user ─────────────────
export async function myAttendance(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
  try {
    const user = request.user!;
    const { month } = (request.query ?? {}) as { month?: string };
    const where: any = { orgId: user.orgId, userId: user.id };
    if (month) {
      if (!isValidMonth(month)) return reply.status(400).send({ error: 'month_invalid', hint: 'month = YYYY-MM' });
      where.date = { startsWith: month };
    }
    const records = await prisma.attendanceRecord.findMany({
      where,
      orderBy: [{ date: 'desc' }, { checkinTime: 'desc' }],
    });
    return { records };
  } catch (err) {
    logger.error('[attendance] myAttendance error:', err);
    return reply.status(500).send({ error: 'Failed to load attendance' });
  }
}

// ── GET /attendance?month=&userId= — admin/manager xem tất cả (gated view_all) ─
export async function listAttendance(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
  try {
    const user = request.user!;
    const allowed = await userHasGrant(user.id, 'attendance', 'view_all');
    if (!allowed) return reply.status(403).send({ error: 'forbidden', code: 'RBAC_FORBIDDEN' });

    const { month, userId } = (request.query ?? {}) as { month?: string; userId?: string };
    const where: any = { orgId: user.orgId };
    if (month) {
      if (!isValidMonth(month)) return reply.status(400).send({ error: 'month_invalid', hint: 'month = YYYY-MM' });
      where.date = { startsWith: month };
    }
    if (userId) where.userId = userId;

    const records = await prisma.attendanceRecord.findMany({
      where,
      orderBy: [{ date: 'desc' }, { checkinTime: 'desc' }],
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
    return { records };
  } catch (err) {
    logger.error('[attendance] listAttendance error:', err);
    return reply.status(500).send({ error: 'Failed to load attendance' });
  }
}

// ── GET /attendance/config ───────────────────────────────────────────────────
export async function getConfig(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
  try {
    const user = request.user!;
    const config = await loadHrConfig(user.orgId);
    return config;
  } catch (err) {
    logger.error('[attendance] getConfig error:', err);
    return reply.status(500).send({ error: 'Failed to load config' });
  }
}

// ── PUT /attendance/config (admin/owner) ─────────────────────────────────────
export async function putConfig(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
  try {
    const user = request.user!;
    if (!['owner', 'admin'].includes(user.role)) {
      // Ngoài owner/admin legacy, cho phép ai có payroll/attendance edit ở cấp org.
      const canEdit = await userHasGrant(user.id, 'attendance', 'view_all');
      if (!canEdit) return reply.status(403).send({ error: 'forbidden' });
    }
    const body = (request.body ?? {}) as Partial<HrConfig>;

    // Validate từng field trước khi merge (tránh ghi rác vào JSON).
    if (body.allowedIps !== undefined) {
      if (!Array.isArray(body.allowedIps) || !body.allowedIps.every((x) => typeof x === 'string')) {
        return reply.status(400).send({ error: 'allowedIps_invalid', hint: 'allowedIps phải là mảng chuỗi IP' });
      }
    }
    if (body.graceMinutes !== undefined) {
      const v = Number(body.graceMinutes);
      if (!Number.isFinite(v) || v < 0 || v > 120) {
        return reply.status(400).send({ error: 'graceMinutes_invalid', hint: 'graceMinutes 0..120' });
      }
    }
    if (body.workingDaysPerMonth !== undefined) {
      const v = Number(body.workingDaysPerMonth);
      if (!Number.isFinite(v) || v < 1 || v > 31) {
        return reply.status(400).send({ error: 'workingDaysPerMonth_invalid', hint: '1..31' });
      }
    }
    if (body.shifts !== undefined) {
      if (!body.shifts || typeof body.shifts !== 'object') {
        return reply.status(400).send({ error: 'shifts_invalid' });
      }
      const re = /^\d{2}:\d{2}$/;
      for (const k of SHIFT_KEYS) {
        const s = (body.shifts as any)[k];
        if (s === undefined) continue;
        if (!s || typeof s !== 'object' || !re.test(s.start) || !re.test(s.end)) {
          return reply.status(400).send({ error: 'shift_time_invalid', hint: `Ca ${k} cần start/end 'HH:mm'` });
        }
      }
    }
    if (body.insurance !== undefined) {
      const ins = body.insurance as any;
      if (!ins || typeof ins !== 'object'
        || ['bhxh', 'bhyt', 'bhtn'].some((f) => ins[f] !== undefined && (!Number.isFinite(Number(ins[f])) || Number(ins[f]) < 0))) {
        return reply.status(400).send({ error: 'insurance_invalid' });
      }
    }

    // Merge lên cấu hình hiện tại (đã normalize) rồi normalize lần nữa để đầy đủ field.
    const current = await loadHrConfig(user.orgId);
    const merged = normalizeHrConfig({
      allowedIps: body.allowedIps ?? current.allowedIps,
      graceMinutes: body.graceMinutes ?? current.graceMinutes,
      workingDaysPerMonth: body.workingDaysPerMonth ?? current.workingDaysPerMonth,
      shifts: {
        morning: { ...current.shifts.morning, ...(body.shifts as any)?.morning },
        afternoon: { ...current.shifts.afternoon, ...(body.shifts as any)?.afternoon },
        overtime: { ...current.shifts.overtime, ...(body.shifts as any)?.overtime },
      },
      insurance: { ...current.insurance, ...(body.insurance as any) },
    });

    await prisma.organization.update({ where: { id: user.orgId }, data: { hrConfig: merged as any } });
    return merged;
  } catch (err) {
    logger.error('[attendance] putConfig error:', err);
    return reply.status(500).send({ error: 'Failed to save config' });
  }
}

export { DEFAULT_HR_CONFIG };
