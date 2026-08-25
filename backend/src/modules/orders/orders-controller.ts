// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import type { FastifyRequest, FastifyReply } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma, tenantTransaction } from '../../shared/database/prisma-client.js';
import { ORDER_STATUS_VALUES } from './order-status.js';
import { calculateImportedMonthlySalaryStats } from './design-salary-calculator.js';
import { userHasGrant } from '../rbac/permission-group-service.js';
import type { Action } from '../rbac/permission-types.js';
import {
  DEFAULT_ORG_TIMEZONE,
  getFixedOffsetMinutes,
  getMonthRangeInOffset,
  getMonthValueInOffset,
} from '../../shared/utils/fixed-offset-time.js';

// Cấu hình lương mặc định đồng bộ từ Tracker
const SALARY_CONFIG = {
  PER_FILE: 20000,
  APPROVED_BONUS: 10000,
  DESIGN_FEE: 100000
};

async function canManageDesignOrders(userId: string, action: Action): Promise<boolean> {
  return userHasGrant(userId, 'orders', action);
}

export async function getOrders(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user!;
  const { search, designerId, status, dateFrom, dateTo, limit = 20, offset = 0 } = request.query as any;

  const where: any = { orgId: user.orgId };
  const canEdit = await canManageDesignOrders(user.id, 'edit');
  const parsedLimit = Number(limit);
  const parsedOffset = Number(offset);
  const pageLimit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, Math.trunc(parsedLimit))) : 20;
  const pageOffset = Number.isFinite(parsedOffset) ? Math.max(0, Math.trunc(parsedOffset)) : 0;

  if (search) {
    where.orderCode = { contains: search, mode: 'insensitive' };
  }
  if (!canEdit) {
    // Designer: backend-enforced personal scope. Query designerId từ client không thể nới rộng.
    where.designerId = user.id;
  } else if (designerId) {
    where.designerId = designerId;
  }
  if (status) {
    where.status = status;
  }
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setDate(end.getDate() + 1);
      where.createdAt.lt = end;
    }
  }

  // Nếu user là nhân viên bình thường (Designer), chỉ cho phép họ xem đơn hàng được gán cho chính họ
  // Shared board: every authenticated user can view orders in their organization.

  try {
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          designer: {
            select: { id: true, fullName: true, role: true }
          },
          statusHistory: {
            include: {
              changedBy: { select: { fullName: true } }
            },
            orderBy: { changedAt: 'desc' },
            take: 50,
          }
        },
        orderBy: { createdAt: 'desc' },
        take: pageLimit,
        skip: pageOffset,
      }),
      prisma.order.count({ where }),
    ]);

    return { orders, total };
  } catch (error) {
    console.error('[OrdersController] getOrders error:', error);
    return reply.status(500).send({ error: 'Không thể tải danh sách đơn hàng' });
  }
}

export async function getOrderByConversation(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user!;
  const { conversationId } = request.params as any;

  try {
    const canEdit = await canManageDesignOrders(user.id, 'edit');
    const order = await prisma.order.findFirst({
      where: { conversationId, orgId: user.orgId, ...(!canEdit ? { designerId: user.id } : {}) },
      include: {
        designer: { select: { id: true, fullName: true, role: true } },
        statusHistory: {
          include: { changedBy: { select: { fullName: true } } },
          orderBy: { changedAt: 'asc' }
        }
      }
    });
    return { order: order || null };
  } catch (error) {
    console.error('[OrdersController] getOrderByConversation error:', error);
    return reply.status(500).send({ error: 'Không thể tải đơn hàng của nhóm' });
  }
}

export async function createOrder(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user!;
  const isAdminOrManager = await canManageDesignOrders(user.id, 'create');

  if (!isAdminOrManager) {
    return reply.status(403).send({ error: 'Bạn không có quyền tạo đơn hàng' });
  }

  const { orderCode, fileCount, deadline, isUrgent, hasDesignFee, isOutsource, designerId, status, notes, conversationId } = request.body as any;

  if (!orderCode) {
    return reply.status(400).send({ error: 'Mã đơn hàng không được để trống' });
  }

  if (status && !ORDER_STATUS_VALUES.includes(status)) {
    return reply.status(400).send({ error: 'Trạng thái đơn hàng không hợp lệ' });
  }

  try {
    // Check trùng mã đơn
    const duplicate = await prisma.order.findFirst({
      where: { orderCode, orgId: user.orgId }
    });
    if (duplicate) {
      return reply.status(400).send({ error: 'Mã đơn hàng này đã tồn tại trong hệ thống' });
    }

    if (conversationId) {
      const duplicateConv = await prisma.order.findFirst({
        where: { conversationId }
      });
      if (duplicateConv) {
        return reply.status(400).send({ error: 'Nhóm này đã có đơn hàng khác' });
      }
    }

    const orderStatus = status || 'demo';

    const now = new Date();
    const nowIso = now.toISOString();
    const timestamps: Record<string, string> = {};
    if (orderStatus === 'approved') {
      timestamps.designing = nowIso;
      timestamps.approved = nowIso;
    } else {
      timestamps[orderStatus] = nowIso;
    }
    const hasStartedDesigning = orderStatus === 'designing' || orderStatus === 'approved';

    const order = await prisma.$transaction(async tx => {
      const created = await tx.order.create({ data: {
        orderCode,
        fileCount: Number(fileCount) || 0,
        deadline: deadline ? new Date(deadline) : null,
        isUrgent: !!isUrgent,
        hasDesignFee: !!hasDesignFee,
        isOutsource: !!isOutsource,
        designerId: designerId || null,
        notes: notes || '',
        orgId: user.orgId,
        status: orderStatus,
        conversationId: conversationId || null,
        timestamps,
        fileCountHistory: hasStartedDesigning ? [{ count: Number(fileCount) || 0, changedAt: nowIso }] : [],
        designFeeTickedAt: hasDesignFee ? now : null,
      }});
      await tx.orderStatusHistory.create({ data: {
        orderId: created.id,
        status: orderStatus,
        changedById: user.id,
      }});
      return created;
    });

    // Tạo lịch sử trạng thái ban đầu
    /* Initial history is written once inside the transaction above. */

    // Nếu gán luôn designer và trạng thái là designing hoặc approved, ghi nhận lịch sử tương ứng
    /* Salary milestones live in timestamps/fileCountHistory, not duplicate status rows. */

    return order;
  } catch (error) {
    console.error('[OrdersController] createOrder error:', error);
    return reply.status(500).send({ error: 'Tạo đơn hàng thất bại' });
  }
}

export async function updateOrder(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user!;
  const { id } = request.params as any;
  const { orderCode, fileCount, deadline, isUrgent, hasDesignFee, isOutsource, designerId, status, notes } = request.body as any;

  if (status && !ORDER_STATUS_VALUES.includes(status)) {
    return reply.status(400).send({ error: 'Trạng thái đơn hàng không hợp lệ' });
  }

  try {
    const existing = await prisma.order.findFirst({
      where: { id, orgId: user.orgId }
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Đơn hàng không tồn tại' });
    }

    const isAdminOrManager = await canManageDesignOrders(user.id, 'edit');

    if (!isAdminOrManager) {
      return reply.status(403).send({ error: 'Tài khoản Designer chỉ có quyền xem đơn thiết kế' });
    }

    // Admin/Manager cập nhật thoải mái
    const updateData: any = {};
    if (orderCode) updateData.orderCode = orderCode;
    const now = new Date();
    const nowIso = now.toISOString();
    const nextFileCount = fileCount !== undefined ? Number(fileCount) : existing.fileCount;
    const timestamps = existing.timestamps && typeof existing.timestamps === 'object' && !Array.isArray(existing.timestamps)
      ? { ...(existing.timestamps as Record<string, unknown>) }
      : {};
    const fileCountHistory = Array.isArray(existing.fileCountHistory)
      ? [...existing.fileCountHistory] as Array<Record<string, unknown>>
      : [];
    const nextStatus = status || existing.status;
    if (fileCount !== undefined) {
      updateData.fileCount = nextFileCount;
      if (nextFileCount !== existing.fileCount && (timestamps.designing || nextStatus === 'designing' || nextStatus === 'approved')) {
        fileCountHistory.push({ count: nextFileCount, changedAt: nowIso });
        updateData.fileCountHistory = fileCountHistory;
      }
    }
    if (deadline !== undefined) updateData.deadline = deadline ? new Date(deadline) : null;
    if (isUrgent !== undefined) updateData.isUrgent = !!isUrgent;
    if (hasDesignFee !== undefined) {
      updateData.hasDesignFee = !!hasDesignFee;
      if (!!hasDesignFee !== existing.hasDesignFee) updateData.designFeeTickedAt = hasDesignFee ? now : null;
    }
    if (isOutsource !== undefined) updateData.isOutsource = !!isOutsource;
    if (designerId !== undefined) updateData.designerId = designerId || null;
    if (notes !== undefined) updateData.notes = notes;

    if (status && status !== existing.status) {
      updateData.status = status;
      if ((status === 'designing' || status === 'approved') && !timestamps.designing) {
        timestamps.designing = nowIso;
        if (fileCount === undefined || nextFileCount === existing.fileCount) {
          fileCountHistory.push({ count: nextFileCount, changedAt: nowIso });
        }
      }
      timestamps[status] = nowIso;
      updateData.timestamps = timestamps;
      updateData.fileCountHistory = fileCountHistory;
    }

    const updated = await prisma.$transaction(async tx => {
      if (status && status !== existing.status) {
        await tx.orderStatusHistory.create({ data: { orderId: id, status, changedById: user.id } });
      }
      return tx.order.update({ where: { id }, data: updateData, include: { designer: true } });
    });
    return updated;
  } catch (error) {
    console.error('[OrdersController] updateOrder error:', error);
    return reply.status(500).send({ error: 'Cập nhật đơn hàng thất bại' });
  }
}

export async function deleteOrder(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user!;
  const isAdminOrManager = await canManageDesignOrders(user.id, 'delete');

  if (!isAdminOrManager) {
    return reply.status(403).send({ error: 'Bạn không có quyền xóa đơn hàng' });
  }

  const { id } = request.params as any;

  try {
    const result = await prisma.order.deleteMany({
      where: { id, orgId: user.orgId }
    });
    if (result.count === 0) {
      return reply.status(404).send({ error: 'Đơn hàng không tồn tại' });
    }
    return { success: true };
  } catch (error) {
    console.error('[OrdersController] deleteOrder error:', error);
    return reply.status(500).send({ error: 'Xóa đơn hàng thất bại' });
  }
}

export async function getSalaryReport(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user!;
  const { month } = request.query as { month?: string };

  const targetMonth = month || new Date().toISOString().slice(0, 7);

  try {
    const canViewAllSalary = user.role === 'owner' || user.role === 'admin' || await canManageDesignOrders(user.id, 'view_all');

    // CRM-native orders: salary derived from OrderStatusHistory rows
    const salaryOrders = await prisma.order.findMany({
      where: {
        orgId: user.orgId,
        designerId: canViewAllSalary ? { not: null } : user.id,
      },
      select: {
        designerId: true, fileCount: true, fileCountHistory: true, timestamps: true,
        status: true, hasDesignFee: true, designFeeTickedAt: true,
      },
    });
    const salaryStats = calculateImportedMonthlySalaryStats(salaryOrders, targetMonth);
    const designerIds = [...salaryStats.keys()];
    const designers = designerIds.length > 0
      ? await prisma.user.findMany({
          where: {
            orgId: user.orgId,
            id: { in: designerIds },
          },
          select: { id: true, fullName: true, role: true },
        })
      : [];

    const reportData = designers.map(d => {
      const stats = salaryStats.get(d.id);
      const orderCount = stats?.orderCount ?? 0;
      const totalFiles = stats?.totalFiles ?? 0;
      const approvedCount = stats?.approvedCount ?? 0;
      const designFeeCount = stats?.designFeeCount ?? 0;

      const fileSalary = totalFiles * SALARY_CONFIG.PER_FILE;
      const bonusSalary = approvedCount * SALARY_CONFIG.APPROVED_BONUS;
      const designFeeSalary = designFeeCount * SALARY_CONFIG.DESIGN_FEE;
      const totalSalary = fileSalary + bonusSalary + designFeeSalary;

      return {
        designerId: d.id,
        designerName: d.fullName,
        orderCount,
        totalFiles,
        approvedCount,
        designFeeCount,
        fileSalary,
        bonusSalary,
        designFeeSalary,
        totalSalary
      };
    });

    reportData.sort((a, b) => b.totalSalary - a.totalSalary);
    return { month: targetMonth, report: reportData };
  } catch (error) {
    console.error('[OrdersController] getSalaryReport error:', error);
    return reply.status(500).send({ error: 'Không thể tính toán báo cáo lương' });
  }
}

export async function getOrderStats(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user!;
  const { month } = request.query as { month?: string }; // định dạng YYYY-MM

  if (month && !getMonthRangeInOffset(month)) {
    return reply.status(400).send({ error: 'Tháng thống kê không hợp lệ' });
  }

  try {
    const [canEdit, org] = await Promise.all([
      canManageDesignOrders(user.id, 'edit'),
      prisma.organization.findUnique({ where: { id: user.orgId }, select: { timezone: true } }),
    ]);
    const timezone = org?.timezone || DEFAULT_ORG_TIMEZONE;
    const targetMonth = month || getMonthValueInOffset(new Date(), timezone);
    const monthRange = getMonthRangeInOffset(targetMonth, timezone)!;
    const { startDate, endDate, daysInMonth } = monthRange;
    const baseWhere: any = { orgId: user.orgId, ...(!canEdit ? { designerId: user.id } : {}) };
    const monthWhere = { ...baseWhere, createdAt: { gte: startDate, lt: endDate } };

    const designerSql = canEdit ? Prisma.empty : Prisma.sql`AND "designer_id" = ${user.id}`;
    const offsetMinutes = getFixedOffsetMinutes(timezone);
    type DailyCountRow = { day: number; count: bigint };

    const [grouped, monthlyGrouped, dailyRows] = await tenantTransaction(
      tx => Promise.all([
        // Giữ contract toàn thời gian cho Dashboard điều hành và client cũ.
        tx.order.groupBy({ by: ['status'], where: baseWhere, _count: { _all: true } }),
        // Màn Tổng quan Đơn thiết kế dùng bộ số liệu tháng riêng này.
        tx.order.groupBy({ by: ['status'], where: monthWhere, _count: { _all: true } }),
        tx.$queryRaw<DailyCountRow[]>(Prisma.sql`
          SELECT
            EXTRACT(DAY FROM ("created_at" + ${offsetMinutes} * INTERVAL '1 minute'))::int AS day,
            COUNT(*)::bigint AS count
          FROM "orders"
          WHERE "org_id" = ${user.orgId}
            AND "created_at" >= ${startDate}
            AND "created_at" < ${endDate}
            ${designerSql}
          GROUP BY 1
          ORDER BY 1
        `),
      ]),
      { isolationLevel: 'RepeatableRead' },
    );

    const emptyStatusCounts = (): Record<string, number> => ({
      demo: 0,
      designing: 0,
      approved: 0,
      cancelled: 0,
    });
    const byStatus = emptyStatusCounts();
    for (const g of grouped) {
      byStatus[g.status] = g._count._all;
    }
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

    const monthlyByStatus = emptyStatusCounts();
    for (const g of monthlyGrouped) {
      monthlyByStatus[g.status] = g._count._all;
    }
    const monthlyTotal = Object.values(monthlyByStatus).reduce((a, b) => a + b, 0);

    const daily: number[] = new Array(daysInMonth).fill(0);
    for (const row of dailyRows) {
      const day = Number(row.day);
      if (day >= 1 && day <= daysInMonth) daily[day - 1] = Number(row.count);
    }
    const dailyLabels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));

    return {
      month: targetMonth,
      total,
      byStatus,
      monthlyTotal,
      monthlyByStatus,
      daily,
      dailyLabels,
    };
  } catch (error) {
    console.error('[OrdersController] getOrderStats error:', error);
    return reply.status(500).send({ error: 'Không thể tải thống kê đơn hàng' });
  }
}
