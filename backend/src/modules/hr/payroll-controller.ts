// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * payroll-controller.ts — Lương HR (độc lập với "Báo cáo lương designer" hoa hồng ở orders).
 *
 * Công thức port từ GIAOVAN (source-of-truth):
 *   thanhTien       = round(baseSalary × workDays / (workingDays || 26))
 *   overtimeAmount  = round((baseSalary / 208) × (otHours×1.5 + otSundayHours×2.0))
 *   insurance       = hasInsurance ? bhxh+bhyt+bhtn : 0
 *   totalSalary     = thanhTien + overtimeAmount + kpi + allowance
 *   netSalary       = totalSalary − advance − fillOrder − insurance
 * Cho phép override thủ công (isManualOverride) đè giá trị auto.
 *
 * KHÔNG import gì từ orders-controller — hai site tách biệt hoàn toàn.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { userHasGrant } from '../rbac/permission-group-service.js';
import { normalizeHrConfig, type HrConfig } from './hr-config.js';

export interface SalaryInput {
  baseSalary: number;
  workDays: number;
  workingDays: number;
  overtimeHours: number;
  overtimeSundayHours: number;
  kpiAmount: number;
  allowanceAmount: number;
  advanceAmount: number;
  fillOrderAmount: number;
  hasInsurance: boolean;
}

export interface SalaryComputed extends SalaryInput {
  overtimeAmount: number;
  thanhTien: number;
  insuranceAmount: number;
  totalSalary: number;
  netSalary: number;
}

// Hằng số OT: baseSalary / 208 giờ/tháng (26 công × 8h). Hệ số ngày thường 1.5, CN 2.0.
const OT_MONTHLY_HOURS = 208;
const OT_RATE_WEEKDAY = 1.5;
const OT_RATE_SUNDAY = 2.0;

/**
 * computeSalary — thuần, test được. Áp đúng công thức GIAOVAN.
 * insurance lấy từ hrConfig (bhxh/bhyt/bhtn), chỉ cộng khi hasInsurance.
 */
export function computeSalary(input: SalaryInput, config: HrConfig): SalaryComputed {
  const workingDays = input.workingDays > 0 ? input.workingDays : config.workingDaysPerMonth || 26;
  const thanhTien = Math.round((input.baseSalary * input.workDays) / workingDays);

  const overtimeAmount = Math.round(
    (input.baseSalary / OT_MONTHLY_HOURS) *
      (input.overtimeHours * OT_RATE_WEEKDAY + input.overtimeSundayHours * OT_RATE_SUNDAY),
  );

  const insuranceAmount = input.hasInsurance
    ? config.insurance.bhxh + config.insurance.bhyt + config.insurance.bhtn
    : 0;

  const totalSalary = thanhTien + overtimeAmount + input.kpiAmount + input.allowanceAmount;
  const netSalary = totalSalary - input.advanceAmount - input.fillOrderAmount - insuranceAmount;

  return {
    ...input,
    workingDays,
    overtimeAmount,
    thanhTien,
    insuranceAmount,
    totalSalary,
    netSalary,
  };
}

function isValidPeriod(p: unknown): p is string {
  return typeof p === 'string' && /^\d{4}-\d{2}$/.test(p);
}

async function loadHrConfig(orgId: string): Promise<HrConfig> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { hrConfig: true } });
  return normalizeHrConfig(org?.hrConfig ?? null);
}

/**
 * Số công đã chấm = số NGÀY có chấm công (tính ca sáng/chiều; tăng ca không tính công).
 * Đếm distinct date → công nguyên, khớp cột Int. Admin có thể override.
 */
async function autoWorkDays(orgId: string, userId: string, period: string): Promise<number> {
  const records = await prisma.attendanceRecord.findMany({
    where: { orgId, userId, date: { startsWith: period }, shift: { in: ['morning', 'afternoon'] } },
    select: { date: true },
    distinct: ['date'],
  });
  return records.length;
}

function numOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Map 1 SalaryRecord (DB) → payload trả FE. */
function toPayload(rec: any, config: HrConfig): any {
  const insuranceAmount = rec.hasInsurance
    ? config.insurance.bhxh + config.insurance.bhyt + config.insurance.bhtn
    : 0;
  return { ...rec, insuranceAmount };
}

/** Tạo phiếu auto (chưa lưu) từ chấm công cho user chưa có bản ghi period. */
async function buildAutoRecord(orgId: string, userId: string, period: string, config: HrConfig): Promise<SalaryComputed> {
  const workDays = await autoWorkDays(orgId, userId, period);
  return computeSalary(
    {
      baseSalary: 0,
      workDays,
      workingDays: config.workingDaysPerMonth,
      overtimeHours: 0,
      overtimeSundayHours: 0,
      kpiAmount: 0,
      allowanceAmount: 0,
      advanceAmount: 0,
      fillOrderAmount: 0,
      hasInsurance: false,
    },
    config,
  );
}

// ── GET /payroll?period=YYYY-MM — admin/manager: bảng lương toàn org ──────────
export async function listPayroll(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
  try {
    const user = request.user!;
    const allowed = await userHasGrant(user.id, 'payroll', 'view_all');
    if (!allowed) return reply.status(403).send({ error: 'forbidden', code: 'RBAC_FORBIDDEN' });

    const { period } = (request.query ?? {}) as { period?: string };
    if (!isValidPeriod(period)) return reply.status(400).send({ error: 'period_invalid', hint: 'period = YYYY-MM' });

    const config = await loadHrConfig(user.orgId);

    // Mọi user active trong org, sort theo payrollOrder (admin set) rồi fullName.
    const users = await prisma.user.findMany({
      where: { orgId: user.orgId, isActive: true },
      select: { id: true, fullName: true, email: true },
      orderBy: [{ payrollOrder: 'asc' }, { fullName: 'asc' }],
    });
    const saved = await prisma.salaryRecord.findMany({
      where: { orgId: user.orgId, period },
    });
    const savedByUser = new Map(saved.map((r) => [r.userId, r]));

    const rows = [];
    for (const u of users) {
      const rec = savedByUser.get(u.id);
      if (rec) {
        rows.push({ user: u, record: toPayload(rec, config), isSaved: true });
      } else {
        const auto = await buildAutoRecord(user.orgId, u.id, period, config);
        rows.push({ user: u, record: { ...auto, period, isManualOverride: false }, isSaved: false });
      }
    }
    return { period, rows, config };
  } catch (err) {
    logger.error('[payroll] listPayroll error:', err);
    return reply.status(500).send({ error: 'Failed to load payroll' });
  }
}

// ── GET /payroll/me?period= — user xem phiếu của mình ─────────────────────────
export async function myPayroll(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
  try {
    const user = request.user!;
    const { period } = (request.query ?? {}) as { period?: string };
    if (!isValidPeriod(period)) return reply.status(400).send({ error: 'period_invalid', hint: 'period = YYYY-MM' });

    const config = await loadHrConfig(user.orgId);
    const rec = await prisma.salaryRecord.findFirst({
      where: { orgId: user.orgId, userId: user.id, period },
    });
    if (rec) return { period, record: toPayload(rec, config), isSaved: true };

    const auto = await buildAutoRecord(user.orgId, user.id, period, config);
    return { period, record: { ...auto, period, isManualOverride: false }, isSaved: false };
  } catch (err) {
    logger.error('[payroll] myPayroll error:', err);
    return reply.status(500).send({ error: 'Failed to load payslip' });
  }
}

// ── PUT /payroll/:userId?period= — admin nhập/override (gated payroll.edit) ────
export async function upsertPayroll(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
  try {
    const user = request.user!;
    const allowed = await userHasGrant(user.id, 'payroll', 'edit');
    if (!allowed) return reply.status(403).send({ error: 'forbidden', code: 'RBAC_FORBIDDEN' });

    const { userId } = request.params as { userId: string };
    const { period } = (request.query ?? {}) as { period?: string };
    if (!isValidPeriod(period)) return reply.status(400).send({ error: 'period_invalid', hint: 'period = YYYY-MM' });

    // Nhân viên phải thuộc org.
    const target = await prisma.user.findFirst({
      where: { id: userId, orgId: user.orgId },
      select: { id: true },
    });
    if (!target) return reply.status(404).send({ error: 'user_not_found' });

    const config = await loadHrConfig(user.orgId);
    const body = (request.body ?? {}) as Partial<SalaryInput> & {
      isManualOverride?: boolean;
      thanhTien?: number;
      overtimeAmount?: number;
      totalSalary?: number;
      netSalary?: number;
    };

    // Nền: bản ghi cũ nếu có, ngược lại auto từ chấm công.
    const existing = await prisma.salaryRecord.findFirst({ where: { orgId: user.orgId, userId, period } });
    const base: SalaryInput = existing
      ? {
          baseSalary: existing.baseSalary,
          workDays: existing.workDays,
          workingDays: existing.workingDays,
          overtimeHours: existing.overtimeHours,
          overtimeSundayHours: existing.overtimeSundayHours,
          kpiAmount: existing.kpiAmount,
          allowanceAmount: existing.allowanceAmount,
          advanceAmount: existing.advanceAmount,
          fillOrderAmount: existing.fillOrderAmount,
          hasInsurance: existing.hasInsurance,
        }
      : {
          baseSalary: 0,
          workDays: await autoWorkDays(user.orgId, userId, period),
          workingDays: config.workingDaysPerMonth,
          overtimeHours: 0,
          overtimeSundayHours: 0,
          kpiAmount: 0,
          allowanceAmount: 0,
          advanceAmount: 0,
          fillOrderAmount: 0,
          hasInsurance: false,
        };

    const input: SalaryInput = {
      baseSalary: Math.round(numOr(body.baseSalary, base.baseSalary)),
      workDays: numOr(body.workDays, base.workDays),
      workingDays: Math.round(numOr(body.workingDays, base.workingDays)),
      overtimeHours: numOr(body.overtimeHours, base.overtimeHours),
      overtimeSundayHours: numOr(body.overtimeSundayHours, base.overtimeSundayHours),
      kpiAmount: Math.round(numOr(body.kpiAmount, base.kpiAmount)),
      allowanceAmount: Math.round(numOr(body.allowanceAmount, base.allowanceAmount)),
      advanceAmount: Math.round(numOr(body.advanceAmount, base.advanceAmount)),
      fillOrderAmount: Math.round(numOr(body.fillOrderAmount, base.fillOrderAmount)),
      hasInsurance: typeof body.hasInsurance === 'boolean' ? body.hasInsurance : base.hasInsurance,
    };

    const computed = computeSalary(input, config);
    const isManual = body.isManualOverride !== false;

    const data = {
      orgId: user.orgId,
      userId,
      period: period!,
      baseSalary: input.baseSalary,
      workDays: Math.round(input.workDays),
      workingDays: input.workingDays,
      overtimeHours: input.overtimeHours,
      overtimeSundayHours: input.overtimeSundayHours,
      kpiAmount: input.kpiAmount,
      allowanceAmount: input.allowanceAmount,
      advanceAmount: input.advanceAmount,
      fillOrderAmount: input.fillOrderAmount,
      hasInsurance: input.hasInsurance,
      overtimeAmount: isManual && body.overtimeAmount !== undefined ? Math.round(body.overtimeAmount) : computed.overtimeAmount,
      thanhTien: isManual && body.thanhTien !== undefined ? Math.round(body.thanhTien) : computed.thanhTien,
      totalSalary: isManual && body.totalSalary !== undefined ? Math.round(body.totalSalary) : computed.totalSalary,
      netSalary: isManual && body.netSalary !== undefined ? Math.round(body.netSalary) : computed.netSalary,
      isManualOverride: isManual,
    };

    const record = existing
      ? await prisma.salaryRecord.update({ where: { id: existing.id }, data })
      : await prisma.salaryRecord.create({ data });

    return toPayload(record, config);
  } catch (err) {
    logger.error('[payroll] upsertPayroll error:', err);
    return reply.status(500).send({ error: 'Failed to save payroll' });
  }
}
