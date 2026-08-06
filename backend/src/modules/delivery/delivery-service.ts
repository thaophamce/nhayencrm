// SPDX-License-Identifier: AGPL-3.0-or-later
import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { amount, cleanText, DELIVERY_METHODS, DELIVERY_STATUSES, isAllowed, PAYMENT_STATUSES } from './delivery-validation.js';
import { getPancakeTrackingByReference, PancakeIntegrationError } from '../orders/pancake-order-service.js';

type User = { id: string; orgId: string; role?: string };
type Input = Record<string, unknown>;

function serialize(row: any) {
  return { ...row, totalAmount: Number(row.totalAmount), deposit: Number(row.deposit), codAmount: Number(row.codAmount), shippingFee: Number(row.shippingFee), remainingAmount: row.paymentStatus === 'paid' ? 0 : Math.max(0, Number(row.totalAmount) - Number(row.deposit)) };
}
function data(input: Input, partial = false) {
  const result: Record<string, unknown> = {};
  const code = cleanText(input.orderCode, 100);
  if (!partial || input.orderCode !== undefined) result.orderCode = code;
  for (const key of ['totalAmount', 'deposit', 'codAmount', 'shippingFee']) if (!partial || input[key] !== undefined) result[key] = amount(input[key]);
  if (!partial || input.quantity !== undefined) result.quantity = Math.max(1, Math.floor(Number(input.quantity) || 1));
  for (const key of ['productType','warehouseName','recipientName','recipientPhone','addressLine','provinceName','districtName','wardName','carrierName','trackingCode','trackingLink','pancakeOrderId','contactId','conversationId','designOrderId','notes']) if (!partial || input[key] !== undefined) result[key] = cleanText(input[key], key === 'notes' || key === 'addressLine' ? 2000 : 300);
  if (!partial || input.createdDate !== undefined) result.createdDate = input.createdDate ? new Date(String(input.createdDate)) : new Date();
  if (!partial || input.paymentStatus !== undefined) result.paymentStatus = input.paymentStatus;
  if (!partial || input.deliveryMethod !== undefined) result.deliveryMethod = input.deliveryMethod;
  if (!partial || input.deliveryStatus !== undefined) result.deliveryStatus = input.deliveryStatus;
  return result;
}
function validate(d: Record<string, any>) {
  if ('orderCode' in d && !d.orderCode) throw new Error('Mã đơn không được để trống');
  for (const key of ['totalAmount','deposit','codAmount','shippingFee']) if (key in d && d[key] < 0) throw new Error(`${key} không hợp lệ`);
  if ('paymentStatus' in d && !isAllowed(d.paymentStatus, PAYMENT_STATUSES)) throw new Error('Trạng thái thanh toán không hợp lệ');
  if ('deliveryMethod' in d && !isAllowed(d.deliveryMethod, DELIVERY_METHODS)) throw new Error('Hình thức giao không hợp lệ');
  if ('deliveryStatus' in d && !isAllowed(d.deliveryStatus, DELIVERY_STATUSES)) throw new Error('Trạng thái giao không hợp lệ');
  if (d.createdDate instanceof Date && Number.isNaN(d.createdDate.getTime())) throw new Error('Ngày tạo không hợp lệ');
}
async function audit(user: User, action: string, id: string, details: object) { await prisma.activityLog.create({ data: { orgId: user.orgId, userId: user.id, category: 'system', action, entityType: 'delivery_order', entityId: id, details } }); }

export async function list(user: User, q: Record<string, unknown>) {
  const page = Math.max(1, Number(q.page) || 1), limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
  const where: any = { orgId: user.orgId, deletedAt: null };
  if (q.search) where.OR = ['orderCode','recipientName','recipientPhone','trackingCode','notes'].map((field) => ({ [field]: { contains: String(q.search), mode: 'insensitive' } }));
  if (isAllowed(q.paymentStatus, PAYMENT_STATUSES)) where.paymentStatus = q.paymentStatus;
  if (isAllowed(q.deliveryMethod, DELIVERY_METHODS)) where.deliveryMethod = q.deliveryMethod;
  if (isAllowed(q.deliveryStatus, DELIVERY_STATUSES)) where.deliveryStatus = q.deliveryStatus;
  if (q.overdue === 'true') {
    const daysThreshold = Number(q.days) || 4;
    where.paymentStatus = { not: 'paid' };
    where.createdDate = { lt: new Date(Date.now() - daysThreshold * 86400000) };
  }
  const [rows,total] = await Promise.all([prisma.deliveryOrder.findMany({ where, include: { createdBy: { select: { id:true, fullName:true } }, events: { orderBy: { createdAt:'desc' }, take: 3 } }, orderBy:{createdDate:'desc'}, skip:(page-1)*limit, take:limit }), prisma.deliveryOrder.count({where})]);
  return { orders: rows.map(serialize), total, page, limit, totalPages: Math.ceil(total/limit) };
}
export async function get(user: User, id: string) { const row=await prisma.deliveryOrder.findFirst({where:{id,orgId:user.orgId,deletedAt:null},include:{createdBy:{select:{id:true,fullName:true}},events:{orderBy:{createdAt:'desc'}}}}); return row?serialize(row):null; }
export async function create(user: User, input: Input) { const d=data(input); validate(d); const row=await prisma.$transaction(async tx=>{const created=await tx.deliveryOrder.create({data:{...d,orgId:user.orgId,createdById:user.id} as any});await tx.deliveryStatusEvent.create({data:{deliveryOrderId:created.id,status:String(d.deliveryStatus||'pending'),statusText:'Tạo đơn giao vận',createdById:user.id}});return created});await audit(user,'delivery.create',row.id,{orderCode:row.orderCode});return serialize(row); }
export async function update(user: User, id: string, input: Input) { const existing=await prisma.deliveryOrder.findFirst({where:{id,orgId:user.orgId,deletedAt:null}});if(!existing)return null;const d=data(input,true);validate(d);const row=await prisma.$transaction(async tx=>{const updated=await tx.deliveryOrder.update({where:{id},data:d});if(d.deliveryStatus&&d.deliveryStatus!==existing.deliveryStatus)await tx.deliveryStatusEvent.create({data:{deliveryOrderId:id,status:String(d.deliveryStatus),statusText:cleanText(input.statusNote,500),source:'manual',createdById:user.id}});return updated});await audit(user,'delivery.update',id,{orderCode:existing.orderCode,fields:Object.keys(d)});return serialize(row); }
export async function remove(user: User,id:string){const existing=await prisma.deliveryOrder.findFirst({where:{id,orgId:user.orgId,deletedAt:null}});if(!existing)return false;await prisma.deliveryOrder.update({where:{id},data:{deletedAt:new Date()}});await audit(user,'delivery.delete',id,{orderCode:existing.orderCode});return true;}
export async function bulkCreate(user:User, input:Input){const codes=Array.isArray(input.orderCodes)?input.orderCodes.map(x=>cleanText(x,100)).filter(Boolean):[];if(!codes.length)throw new Error('Danh sách mã đơn trống');const unique=[...new Set(codes)] as string[];if(unique.length>500)throw new Error('Mỗi lần chỉ được nhập tối đa 500 mã đơn');const existing=await prisma.deliveryOrder.findMany({where:{orgId:user.orgId,orderCode:{in:unique}},select:{orderCode:true}});const dup=new Set(existing.map(x=>x.orderCode));const valid=unique.filter(x=>!dup.has(x));const created=await prisma.$transaction(valid.map(orderCode=>prisma.deliveryOrder.create({data:{orgId:user.orgId,orderCode,createdById:user.id,deliveryMethod:isAllowed(input.deliveryMethod,DELIVERY_METHODS)?input.deliveryMethod:'viettelpost'}})));await Promise.all(created.map(row=>audit(user,'delivery.create',row.id,{orderCode:row.orderCode,source:'bulk'})));return {created:created.map(serialize),duplicates:[...dup]};}

export async function activity(user: User, q: Record<string, unknown>) {
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 30));
  const where: any = { orgId: user.orgId, entityType: 'delivery_order', action: { startsWith: 'delivery.' } };
  if (q.action && ['delivery.create', 'delivery.update', 'delivery.delete', 'delivery.tracking_sync'].includes(String(q.action))) where.action = String(q.action);
  if (q.userId) where.userId = String(q.userId);
  if (q.search) where.OR = [
    { details: { path: ['orderCode'], string_contains: String(q.search) } },
    { user: { fullName: { contains: String(q.search), mode: 'insensitive' } } },
  ];
  const [rows, total, users] = await Promise.all([
    prisma.activityLog.findMany({ where, include: { user: { select: { id: true, fullName: true, email: true } } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.activityLog.count({ where }),
    prisma.user.findMany({ where: { orgId: user.orgId, activityLogs: { some: { entityType: 'delivery_order' } } }, select: { id: true, fullName: true, email: true }, orderBy: { fullName: 'asc' } }),
  ]);
  return { activities: rows, users, total, page, limit, totalPages: Math.ceil(total / limit) };
}
// Dữ liệu cũ từ site giao vận có thể dùng "thiep"/"thiệp" thay cho mã FE mới
// "invitation". Áo và ảnh luôn được tách khỏi doanh thu thiệp.
export function isInvitationProduct(value: unknown): boolean {
  const key = String(value ?? '').trim().toLocaleLowerCase('vi-VN');
  return key === 'invitation' || key === 'thiep' || key === 'thiệp' || key.includes('thiệp');
}
export async function stats(user:User){const where={orgId:user.orgId,deletedAt:null};const [rows,overdue]=await Promise.all([prisma.deliveryOrder.findMany({where,select:{totalAmount:true,deposit:true,paymentStatus:true,deliveryStatus:true,productType:true}}),prisma.deliveryOrder.count({where:{...where,paymentStatus:{not:'paid'},createdDate:{lt:new Date(Date.now()-4*86400000)}}})]);return rows.reduce((a:any,r:any)=>{a.totalOrders++;if(isInvitationProduct(r.productType)){a.revenue+=Number(r.totalAmount);a.deposit+=Number(r.deposit);a.outstanding+=r.paymentStatus==='paid'?0:Math.max(0,Number(r.totalAmount)-Number(r.deposit));}a.byDeliveryStatus[r.deliveryStatus]=(a.byDeliveryStatus[r.deliveryStatus]||0)+1;return a},{totalOrders:0,revenue:0,deposit:0,outstanding:0,overdue,byDeliveryStatus:{}});}

export async function analytics(user: User, q: Record<string, unknown>) {
  const now = new Date();
  const from = q.from ? new Date(String(q.from)) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = q.to ? new Date(String(q.to)) : new Date(now.getFullYear(), now.getMonth() + 1, 1);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) throw new Error('Khoảng ngày không hợp lệ');
  const orders = await prisma.deliveryOrder.findMany({
    where: { orgId: user.orgId, deletedAt: null, createdDate: { gte: from, lt: to } },
    orderBy: { createdDate: 'desc' },
  });

  const overdueWhere = {
    orgId: user.orgId,
    deletedAt: null,
    paymentStatus: { not: 'paid' as const },
    createdDate: { lt: new Date(now.getTime() - 4 * 86400000) },
  };
  const [overdue4Days, overdueCount] = await Promise.all([
    prisma.deliveryOrder.findMany({
    where: {
      ...overdueWhere,
    },
    orderBy: { createdDate: 'asc' },
    take: 100,
    }),
    prisma.deliveryOrder.count({ where: overdueWhere }),
  ]);

  const base: any = {
    totalOrders: 0, revenue: 0, deposit: 0, outstanding: 0, paidRevenue: 0, overdue: overdueCount,
    byDay: {}, byMethod: {}, byWarehouse: {}, byProduct: {}, byStatus: {},
    recent: [], overdueOrders: overdue4Days.map(serialize),
  };
  for (const row of orders) {
    const total = Number(row.totalAmount), deposit = Number(row.deposit), remaining = row.paymentStatus === 'paid' ? 0 : Math.max(0, total - deposit);
    const day = row.createdDate.toISOString().slice(0, 10);
    const isInvitation = isInvitationProduct(row.productType);
    base.totalOrders++;
    if (isInvitation) {
      base.revenue += total; base.deposit += deposit; base.outstanding += remaining;
      base.paidRevenue += row.paymentStatus === 'paid' ? total : Math.min(deposit, total);
    }
    const add = (bucket: any, key: string, includeFinancials = true) => { bucket[key] ||= { count: 0, revenue: 0, outstanding: 0, quantity: 0 }; bucket[key].count++; if(includeFinancials){bucket[key].revenue += total; bucket[key].outstanding += remaining;} bucket[key].quantity += row.quantity; };
    add(base.byDay, day, isInvitation); add(base.byMethod, row.deliveryMethod, isInvitation); add(base.byProduct, row.productType); add(base.byStatus, row.deliveryStatus, isInvitation); if (row.warehouseName) add(base.byWarehouse, row.warehouseName, isInvitation);
  }
  base.recent = orders.slice(0, 8).map(serialize);
  base.byDay = Object.entries(base.byDay).map(([date, value]) => ({ date, ...(value as object) }));
  return base;
}

const PANCAKE_DELIVERY_STATUS: Record<string, string> = {
  pending: 'pending', ready_to_pick: 'confirmed', picking: 'confirmed', picked: 'shipping',
  shipping: 'shipping', delivering: 'shipping', delivered: 'delivered', success: 'delivered',
  failed: 'failed', delivery_failed: 'failed', returning: 'returned', returned: 'returned', cancelled: 'cancelled',
};

function normalizedDeliveryStatus(status: unknown, text: unknown): string | null {
  const key = `${String(status || '')} ${String(text || '')}`.toLocaleLowerCase('vi-VN');
  for (const [source, target] of Object.entries(PANCAKE_DELIVERY_STATUS)) if (key.includes(source)) return target;
  if (key.includes('giao thành công') || key.includes('đã giao')) return 'delivered';
  if (key.includes('đang giao') || key.includes('đã lấy') || key.includes('lấy hàng')) return 'shipping';
  if (key.includes('hoàn')) return 'returned';
  if (key.includes('hủy')) return 'cancelled';
  if (key.includes('thất bại')) return 'failed';
  return null;
}

function trackingPayload(order: any) {
  const shipping = order?.shipping;
  if (!shipping) return { found: false, orderCode: order?.orderCode || null, tracking: null };
  return {
    found: true,
    orderCode: order.orderCode || null,
    tracking: {
      carrier: shipping.carrier || '', serviceName: shipping.serviceName || '', trackingCode: shipping.trackingCode || '',
      fee: Number(shipping.fee) || 0, status: shipping.status || '', statusText: shipping.statusText || '',
      location: shipping.location || '', note: shipping.note || '', updatedAt: shipping.updatedAt || null,
      pickedUpAt: shipping.pickedUpAt || null, firstDeliveryAt: shipping.firstDeliveryAt || null,
      expectedDeliveryAt: shipping.expectedDeliveryAt || null, deliveryName: shipping.deliveryName || '',
      deliveryPhone: shipping.deliveryPhone || '', trackingLink: shipping.trackingLink || '',
      history: Array.isArray(shipping.history) ? shipping.history : [],
    },
  };
}

export async function refreshPancakeTracking(user: User, id: string) {
  const existing = await prisma.deliveryOrder.findFirst({ where: { id, orgId: user.orgId, deletedAt: null } });
  if (!existing) return null;
  const reference = existing.pancakeOrderId || existing.orderCode;
  const { order } = await getPancakeTrackingByReference({ ...user, role: user.role || '' }, reference);
  const payload = trackingPayload(order);
  if (!payload.found || !payload.tracking) return { ...payload, deliveryOrder: serialize(existing) };

  const tracking = payload.tracking;
  const status = normalizedDeliveryStatus(tracking.status, tracking.statusText);
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.deliveryOrder.update({
      where: { id },
      data: {
        pancakeOrderId: String(order.id || existing.pancakeOrderId || '') || null,
        carrierName: cleanText(tracking.carrier, 300), trackingCode: cleanText(tracking.trackingCode, 300),
        trackingLink: cleanText(tracking.trackingLink, 300), shippingFee: amount(tracking.fee),
        ...(status ? { deliveryStatus: status } : {}),
      },
    });
    for (const event of [...tracking.history].reverse()) {
      const externalUpdatedAt = event.updatedAt ? new Date(event.updatedAt) : null;
      const validDate = externalUpdatedAt && !Number.isNaN(externalUpdatedAt.getTime()) ? externalUpdatedAt : null;
      const duplicate = await tx.deliveryStatusEvent.findFirst({ where: { deliveryOrderId: id, source: 'pancake', status: String(event.status || ''), externalUpdatedAt: validDate } });
      if (!duplicate) await tx.deliveryStatusEvent.create({ data: { deliveryOrderId: id, status: String(event.status || status || 'shipping'), statusText: cleanText(event.status, 500), location: cleanText(event.location, 500), note: cleanText(event.note, 1000), source: 'pancake', externalUpdatedAt: validDate } });
    }
    return row;
  });
  await audit(user, 'delivery.tracking_sync', id, { carrier: tracking.carrier, trackingCode: tracking.trackingCode, status: tracking.status });
  return { ...payload, deliveryOrder: serialize(updated) };
}

export { PancakeIntegrationError };

export function duplicateError(error:unknown){return error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002';}
