// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { ORDER_STATUS_VALUES } from './order-status.js';

// Cấu hình lương mặc định đồng bộ từ Tracker
const SALARY_CONFIG = {
  PER_FILE: 20000,
  APPROVED_BONUS: 10000,
  DESIGN_FEE: 100000
};

async function isAdminOrManagerUser(userId: string, role: string): Promise<boolean> {
  if (role === 'owner' || role === 'admin') return true;
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { permissionGroup: { select: { name: true } } },
  });
  return u?.permissionGroup?.name === 'Admin' || u?.permissionGroup?.name === 'Manager';
}

export async function getOrders(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user!;
  const { search, designerId, status, limit = 20, offset = 0 } = request.query as any;

  const where: any = { orgId: user.orgId };
  const parsedLimit = Number(limit);
  const parsedOffset = Number(offset);
  const pageLimit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, Math.trunc(parsedLimit))) : 20;
  const pageOffset = Number.isFinite(parsedOffset) ? Math.max(0, Math.trunc(parsedOffset)) : 0;

  if (search) {
    where.orderCode = { contains: search, mode: 'insensitive' };
  }
  if (designerId) {
    where.designerId = designerId;
  }
  if (status) {
    where.status = status;
  }

  // Nếu user là nhân viên bình thường (Designer), chỉ cho phép họ xem đơn hàng được gán cho chính họ
  const isAdminOrManager = await isAdminOrManagerUser(user.id, user.role);
  if (!isAdminOrManager) {
    where.designerId = user.id;
  }

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
    const order = await prisma.order.findFirst({
      where: { conversationId, orgId: user.orgId },
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
  const isAdminOrManager = await isAdminOrManagerUser(user.id, user.role);

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

    const order = await prisma.order.create({
      data: {
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
      }
    });

    // Tạo lịch sử trạng thái ban đầu
    await prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        status: orderStatus,
        changedById: user.id,
      }
    });

    // Nếu gán luôn designer và trạng thái là designing hoặc approved, ghi nhận lịch sử tương ứng
    if (designerId && (orderStatus === 'designing' || orderStatus === 'approved')) {
      await prisma.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: 'designing',
          changedById: user.id,
        }
      });
      if (orderStatus === 'approved') {
        await prisma.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: 'approved',
            changedById: user.id,
          }
        });
      }
    }

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

    const isAdminOrManager = await isAdminOrManagerUser(user.id, user.role);

    if (!isAdminOrManager) {
      // Designer chỉ được chuyển trạng thái đơn hàng của chính mình và ghi chú
      if (existing.designerId !== user.id) {
        return reply.status(403).send({ error: 'Bạn không có quyền chỉnh sửa đơn hàng này' });
      }

      const updateData: any = {};
      if (status && status !== existing.status) {
        updateData.status = status;
        await prisma.orderStatusHistory.create({
          data: { orderId: id, status, changedById: user.id }
        });
      }
      if (notes !== undefined) {
        updateData.notes = notes;
      }

      const updated = await prisma.order.update({
        where: { id },
        data: updateData,
        include: { designer: true }
      });
      return updated;
    }

    // Admin/Manager cập nhật thoải mái
    const updateData: any = {};
    if (orderCode) updateData.orderCode = orderCode;
    if (fileCount !== undefined) updateData.fileCount = Number(fileCount);
    if (deadline !== undefined) updateData.deadline = deadline ? new Date(deadline) : null;
    if (isUrgent !== undefined) updateData.isUrgent = !!isUrgent;
    if (hasDesignFee !== undefined) updateData.hasDesignFee = !!hasDesignFee;
    if (isOutsource !== undefined) updateData.isOutsource = !!isOutsource;
    if (designerId !== undefined) updateData.designerId = designerId || null;
    if (notes !== undefined) updateData.notes = notes;

    if (status && status !== existing.status) {
      updateData.status = status;
      await prisma.orderStatusHistory.create({
        data: { orderId: id, status, changedById: user.id }
      });
    }

    const updated = await prisma.order.update({
      where: { id },
      data: updateData,
      include: { designer: true }
    });
    return updated;
  } catch (error) {
    console.error('[OrdersController] updateOrder error:', error);
    return reply.status(500).send({ error: 'Cập nhật đơn hàng thất bại' });
  }
}

export async function deleteOrder(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user!;
  const isAdminOrManager = await isAdminOrManagerUser(user.id, user.role);

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
  const { month } = request.query as { month?: string }; // định dạng YYYY-MM

  const targetMonth = month || new Date().toISOString().slice(0, 7);
  const startDate = new Date(`${targetMonth}-01T00:00:00.000Z`);
  const endDate = new Date(new Date(startDate).setMonth(startDate.getMonth() + 1));

  try {
    // 1. Lấy tất cả designer (nhân viên trong tổ chức)
    const designers = await prisma.user.findMany({
      where: { orgId: user.orgId },
      select: { id: true, fullName: true, role: true }
    });

    // 2. Lấy toàn bộ đơn hàng có hoạt động trong tháng này
    const histories = await prisma.orderStatusHistory.findMany({
      where: {
        changedAt: { gte: startDate, lt: endDate },
        order: { orgId: user.orgId }
      },
      include: {
        order: true
      }
    });

    const reportData = designers.map(d => {
      // Lọc các hoạt động thiết kế của designer này
      const designerHistories = histories.filter(h => h.order.designerId === d.id);

      // Tổng số đơn (distinct) mà designer có hoạt động trong tháng
      const orderCount = new Set(designerHistories.map(h => h.orderId)).size;

      // Tính tổng số file thiết kế mới nhận trong tháng (lần đầu chuyển sang 'designing' hoặc tạo thẳng designing trong tháng)
      const designingOrders = designerHistories.filter(h => h.status === 'designing');
      const totalFiles = designingOrders.reduce((sum, h) => sum + h.order.fileCount, 0);

      // Tính tổng đơn chốt in trong tháng (chuyển sang 'approved' trong tháng)
      const approvedOrders = designerHistories.filter(h => h.status === 'approved');
      const approvedCount = approvedOrders.length;

      // Tính số lượng phí thiết kế (+100.000đ/đơn) được hưởng trong tháng này
      const designFeeOrders = designerHistories.filter(h => h.order.hasDesignFee && h.status === 'designing');
      const designFeeCount = designFeeOrders.length;

      // Tính lương và thưởng
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

    return {
      month: targetMonth,
      report: reportData
    };
  } catch (error) {
    console.error('[OrdersController] getSalaryReport error:', error);
    return reply.status(500).send({ error: 'Không thể tính toán báo cáo lương' });
  }
}

export async function getOrderStats(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user!;
  const { month } = request.query as { month?: string }; // định dạng YYYY-MM

  const targetMonth = month || new Date().toISOString().slice(0, 7);
  const startDate = new Date(`${targetMonth}-01T00:00:00.000Z`);
  const endDate = new Date(new Date(startDate).setMonth(startDate.getMonth() + 1));

  const isAdminOrManager = await isAdminOrManagerUser(user.id, user.role);

  try {
    const baseWhere: any = { orgId: user.orgId };
    if (!isAdminOrManager) {
      baseWhere.designerId = user.id;
    }

    // Đếm tổng theo trạng thái (toàn bộ, không giới hạn tháng)
    const grouped = await prisma.order.groupBy({
      by: ['status'],
      where: baseWhere,
      _count: { _all: true },
    });

    const byStatus: Record<string, number> = {
      demo: 0,
      designing: 0,
      approved: 0,
      cancelled: 0,
    };
    for (const g of grouped) {
      byStatus[g.status] = g._count._all;
    }
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

    // Đơn tạo trong tháng, gom theo ngày cho biểu đồ đường
    const monthOrders = await prisma.order.findMany({
      where: { ...baseWhere, createdAt: { gte: startDate, lt: endDate } },
      select: { createdAt: true },
    });

    const daysInMonth = new Date(endDate.getTime() - 1).getUTCDate();
    const daily: number[] = new Array(daysInMonth).fill(0);
    for (const o of monthOrders) {
      const day = o.createdAt.getUTCDate();
      daily[day - 1] = (daily[day - 1] || 0) + 1;
    }
    const dailyLabels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));

    return {
      month: targetMonth,
      total,
      byStatus,
      daily,
      dailyLabels,
    };
  } catch (error) {
    console.error('[OrdersController] getOrderStats error:', error);
    return reply.status(500).send({ error: 'Không thể tải thống kê đơn hàng' });
  }
}
