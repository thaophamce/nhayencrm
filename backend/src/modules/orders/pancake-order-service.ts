// SPDX-License-Identifier: AGPL-3.0-or-later
import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { zaloOps } from '../../shared/zalo-operations.js';
import { buildOrderGroupName } from './order-status.js';

const DEFAULT_BASE_URL = 'https://pos.pages.fm/api/v1';
const REQUEST_TIMEOUT_MS = 15_000;

type AuthUser = { id: string; orgId: string; role: string };
type PancakeOrder = Record<string, unknown> & {
  id?: string | number;
  display_id?: string | number | null;
  custom_id?: string | number | null;
  status?: number;
  status_name?: string;
};

export class PancakeIntegrationError extends Error {
  constructor(message: string, public readonly statusCode = 502, public readonly code = 'pancake_error') {
    super(message);
  }
}

export async function canManagePancake(user: AuthUser, action: 'access' | 'create' | 'edit' = 'access'): Promise<boolean> {
  if (!user?.id) return false;
  if (user.role === 'owner' || user.role === 'admin') return true;

  try {
    const { userHasGrant } = await import('../rbac/permission-group-service.js');
    const granted = await userHasGrant(user.id, 'delivery', action).catch(() => false)
      || await userHasGrant(user.id, 'orders', action).catch(() => false);
    if (granted) return true;
  } catch {}

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { isActive: true, permissionGroup: { select: { name: true } } },
  });

  if (row?.permissionGroup?.name === 'Admin' || row?.permissionGroup?.name === 'Manager') return true;
  return false;
}

function config() {
  const apiKey = process.env.PANCAKE_POS_API_KEY?.trim();
  const shopId = process.env.PANCAKE_POS_SHOP_ID?.trim();
  const baseUrl = (process.env.PANCAKE_POS_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const warehouseId = process.env.PANCAKE_POS_WAREHOUSE_ID?.trim();
  if (!apiKey || !shopId) {
    throw new PancakeIntegrationError('Chưa cấu hình PANCAKE_POS_API_KEY hoặc PANCAKE_POS_SHOP_ID', 503, 'pancake_not_configured');
  }
  return { apiKey, shopId, baseUrl, warehouseId };
}

function valueString(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof PancakeIntegrationError) return error.message;
  if (error instanceof Error && error.name === 'TimeoutError') return 'Pancake POS không phản hồi trong 15 giây';
  if (error instanceof Error && error.name === 'AbortError') return 'Pancake POS không phản hồi trong 15 giây';
  return 'Không gọi được Pancake POS';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOrderId(value: unknown): value is PancakeOrder {
  if (!isRecord(value)) return false;
  return value.id !== null && value.id !== undefined && value.id !== '';
}

/** H? tr? response tr?c ti?p theo OpenAPI v? c?c wrapper Pancake d?ng ? production. */
export function extractPancakeOrder(data: unknown): PancakeOrder | null {
  if (!isRecord(data)) return null;
  const nestedData = isRecord(data.data) ? data.data : null;
  const result = isRecord(data.result) ? data.result : null;
  const candidates: unknown[] = [data, data.order, nestedData, nestedData?.order, result, result?.order];
  return candidates.find(hasOrderId) ?? null;
}

function pancakeResponseSummary(data: unknown): Record<string, unknown> {
  if (!isRecord(data)) return { type: Array.isArray(data) ? 'array' : typeof data };
  return {
    keys: Object.keys(data).slice(0, 20),
    success: data.success,
    error: valueString(data.error),
    message: valueString(data.message),
    errorCode: data.error_code,
  };
}

async function callPancakeGet(path: string, params: Record<string, string> = {}): Promise<any> {
  const cfg = config();
  const url = new URL(`${cfg.baseUrl}/shops/${encodeURIComponent(cfg.shopId)}${path}`);
  url.searchParams.set('api_key', cfg.apiKey);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  let response: Response;
  try { response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }); }
  catch (error) { throw new PancakeIntegrationError(safeErrorMessage(error), 504, 'pancake_timeout'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success === false) throw new PancakeIntegrationError(valueString(data?.message || data?.error) || `Pancake POS request failed (HTTP ${response.status})`, 502);
  return data;
}

export async function getPancakeWarehouses(user: AuthUser) {
  if (!(await canManagePancake(user))) throw new PancakeIntegrationError('Forbidden', 403, 'forbidden');
  const data = await callPancakeGet('/warehouses');
  return Array.isArray(data?.data) ? data.data : [];
}

export async function searchPancakeProducts(user: AuthUser, search = '', pageNumber = 1, pageSize = 30) {
  if (!(await canManagePancake(user))) throw new PancakeIntegrationError('Forbidden', 403, 'forbidden');
  const data = await callPancakeGet('/products/variations', { search: search.trim(), page_number: String(Math.max(1, pageNumber)), page_size: String(Math.min(100, Math.max(1, pageSize))), product_status: 'not_locked' });
  return { products: Array.isArray(data?.data) ? data.data : [], total: Number(data?.total_entries || 0), pageNumber: Number(data?.page_number || pageNumber) };
}

export async function listPancakeOrders(user: AuthUser, options: { search?: string; pageNumber?: number; pageSize?: number; status?: string } = {}) {
  if (!(await canManagePancake(user))) throw new PancakeIntegrationError('Forbidden', 403, 'forbidden');
  const pageNumber = Math.max(1, Number(options.pageNumber) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(options.pageSize) || 100));
  const params: Record<string, string> = { page_number: String(pageNumber), page_size: String(pageSize) };
  if (options.search?.trim()) params.search = options.search.trim().slice(0, 100);
  if (options.status && /^\d+$/.test(options.status)) params['filter_status[]'] = options.status;
  const data = await callPancakeGet('/orders', params);
  const rows = Array.isArray(data?.data) ? data.data : [];
  return {
    orders: rows.map((order: any) => ({
      id: valueString(order.id) || '',
      creator: isRecord(order.creator) ? { name: valueString(order.creator.name) || '', avatarUrl: valueString(order.creator.avatar_url) } : null,
      total: Math.max(0, numberValue(order.total_price)),
      shippingCarrier: isRecord(order.partner) ? valueString(order.partner.partner_name) : null,
      warehouse: isRecord(order.warehouse_info) ? valueString(order.warehouse_info.name) || '' : '',
      customerName: valueString(order.bill_full_name) || valueString(order.shipping_address?.full_name) || '',
      phone: valueString(order.bill_phone_number) || valueString(order.shipping_address?.phone_number) || '',
      shippingAddress: valueString(order.shipping_address?.new_full_address) || valueString(order.shipping_address?.full_address) || '',
      status: typeof order.status === 'number' ? order.status : null,
      statusName: valueString(order.status_name) || '',
      insertedAt: valueString(order.inserted_at),
      orderLink: valueString(order.order_link),
    })),
    pageNumber: Number(data?.page_number || pageNumber),
    pageSize: Number(data?.page_size || pageSize),
    total: Number(data?.total_entries || 0),
    totalPages: Number(data?.total_pages || 0),
    aggregates: {
      cod: numberValue(data?.aggs?.cod?.value), prepaid: numberValue(data?.aggs?.prepaid?.value),
      partnerFee: numberValue(data?.aggs?.partner_fee?.value), shippingFee: numberValue(data?.aggs?.shipping_fee?.value),
    },
  };
}
async function callCreateOrder(conversationId: string, extra: Record<string, unknown> = {}): Promise<{ order: PancakeOrder; shopId: string }> {
  const cfg = config();
  const url = new URL(`${cfg.baseUrl}/shops/${encodeURIComponent(cfg.shopId)}/orders`);
  url.searchParams.set('api_key', cfg.apiKey);
  // Chỉ nhận trường nghiệp vụ an toàn; không cho client ghi đè shop/status/dấu vết chống trùng.
  // Only accept safe business fields; client cannot override shop, status, or idempotency trace.
  const allowedExtra: Record<string, unknown> = {};
  for (const key of ['warehouse_id', 'bill_full_name', 'bill_phone_number', 'bill_email', 'note_print'] as const) {
    if (extra[key] !== undefined && extra[key] !== null && extra[key] !== '') allowedExtra[key] = extra[key];
  }
  for (const key of ['shipping_fee', 'total_discount', 'cash', 'transfer_money'] as const) {
    const value = Number(extra[key]);
    if (Number.isFinite(value) && value >= 0) allowedExtra[key] = Math.round(value);
  }
  if (typeof extra.is_free_shipping === 'boolean') allowedExtra.is_free_shipping = extra.is_free_shipping;
  if (extra.shipping_address && typeof extra.shipping_address === 'object') {
    const address = extra.shipping_address as Record<string, unknown>;
    allowedExtra.shipping_address = {
      address: String(address.address || '').slice(0, 1000),
      full_address: String(address.full_address || address.address || '').slice(0, 1000),
      full_name: String(address.full_name || extra.bill_full_name || '').slice(0, 300),
      phone_number: String(address.phone_number || extra.bill_phone_number || '').slice(0, 50),
      country_code: '84',
    };
  }
  if (Array.isArray(extra.items)) {
    allowedExtra.items = extra.items.slice(0, 100).map((item: any) => ({
      variation_id: String(item?.variation_id || '').trim(), product_id: item?.product_id ? String(item.product_id) : undefined,
      quantity: Math.max(1, Math.floor(Number(item?.quantity) || 1)),
      variation_info: { name: String(item?.variation_info?.name || '').slice(0, 300), retail_price: Math.max(0, Math.round(Number(item?.variation_info?.retail_price) || 0)), detail: String(item?.variation_info?.detail || '').slice(0, 500) },
    })).filter((item: any) => item.variation_id);
  }
  const payload: Record<string, unknown> = {
    ...allowedExtra,
    shop_id: Number.isFinite(Number(cfg.shopId)) ? Number(cfg.shopId) : cfg.shopId,
    status: 0,
    note: `Tạo từ ZaloCRM - hội thoại ${conversationId}`,
    merge_order: false,
  };
  if (cfg.warehouseId && !payload.warehouse_id) payload.warehouse_id = cfg.warehouseId;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new PancakeIntegrationError(safeErrorMessage(error), 504, 'pancake_timeout');
  }

  const rawText = await response.text();
  let data: any = {};
  try { data = rawText ? JSON.parse(rawText) : {}; } catch { data = {}; }
  const upstream = valueString(data?.message || data?.error || data?.error_message);
  if (!response.ok || data?.success === false) {
    throw new PancakeIntegrationError(upstream ? `Pancake POS: ${upstream}` : `Pancake POS t? ch?i y?u c?u (HTTP ${response.status})`, 502);
  }
  const order = extractPancakeOrder(data);
  if (!order) {
// Kh?ng log URL v? query ch?a api_key. Ch? log shape v? tr??ng l?i, kh?ng log body/PII.
    console.error('[pancake] create order response missing order ID', {
      status: response.status,
      response: pancakeResponseSummary(data),
    });
    throw new PancakeIntegrationError(
      'Pancake POS ?? nh?n y?u c?u nh?ng kh?ng tr? ID ??n h?ng. Kh?ng t?o l?i ?? tr?nh tr?ng ??n.',
      502,
      'pancake_creation_uncertain',
    );
  }
  return { order, shopId: cfg.shopId };
}

function serializeLink(link: any) {
  return {
    id: link.id,
    conversationId: link.conversationId,
    shopId: link.shopId,
    pancakeOrderId: link.pancakeOrderId,
    displayId: link.displayId,
    customId: link.customId,
    orderCode: link.orderCode,
    status: link.pancakeStatus,
    statusName: link.pancakeStatusName,
    syncStatus: link.syncStatus,
    lastError: link.lastError,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
}

async function ensureLinkedCrmOrder(conversationId: string, orgId: string, orderCode: string, changedById: string) {
  const existing = await prisma.order.findFirst({
    where: { conversationId, orgId },
    select: { id: true, status: true, orderCode: true },
  });
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
    const raced = await tx.order.findFirst({
      where: { conversationId, orgId },
      select: { id: true, status: true, orderCode: true },
    });
    if (raced) return raced;

    const order = await tx.order.create({
      data: { orderCode, orgId, conversationId, status: 'demo', fileCount: 0, notes: '' },
      select: { id: true, status: true, orderCode: true },
    });
    await tx.orderStatusHistory.create({
      data: { orderId: order.id, status: 'demo', changedById },
    });
    return order;
  });
}

async function renameLinkedGroup(
  conversation: { id: string; orgId: string; zaloAccountId: string; externalThreadId: string | null },
  orderCode: string,
  status: string,
) {
  if (!conversation.externalThreadId) throw new Error('Hội thoại nhóm thiếu groupId Zalo');
  const groupName = buildOrderGroupName(orderCode, status);
  await zaloOps.renameGroup(conversation.zaloAccountId, groupName, conversation.externalThreadId);
  await prisma.conversation.update({ where: { id: conversation.id }, data: { groupName } });
}

function numberValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizePancakeOrder(order: Record<string, any>) {
  const address = isRecord(order.shipping_address) ? order.shipping_address : {};
  return {
    id: valueString(order.id),
    orderCode: valueString(order.display_id) || valueString(order.custom_id) || valueString(order.id),
    status: typeof order.status === 'number' ? order.status : null,
    statusName: valueString(order.status_name),
    customer: {
      name: valueString(order.bill_full_name) || valueString(address.full_name) || '',
      phone: valueString(order.bill_phone_number) || valueString(address.phone_number) || '',
      email: valueString(order.bill_email) || '',
      address: valueString(address.full_address) || valueString(address.address) || '',
    },
    recipient: {
      name: valueString(address.full_name) || valueString(order.bill_full_name) || '',
      phone: valueString(address.phone_number) || valueString(order.bill_phone_number) || '',
      address: valueString(address.full_address) || valueString(address.address) || '',
    },
    warehouseId: valueString(order.warehouse_id) || '',
    items: Array.isArray(order.items) ? order.items.map((item: any) => ({
      id: valueString(item?.id),
      variation_id: valueString(item?.variation_id) || '',
      product_id: valueString(item?.product_id) || '',
      name: valueString(item?.variation_info?.name) || '',
      detail: valueString(item?.variation_info?.detail) || '',
      quantity: Math.max(1, numberValue(item?.quantity)),
      price: Math.max(0, numberValue(item?.variation_info?.retail_price)),
    })) : [],
    shippingFee: Math.max(0, numberValue(order.shipping_fee)),
    discount: Math.max(0, numberValue(order.total_discount)),
    freeShipping: Boolean(order.is_free_shipping),
    cash: Math.max(0, numberValue(order.cash)),
    transferMoney: Math.max(0, numberValue(order.transfer_money)),
    note: valueString(order.note) || '',
    printNote: valueString(order.note_print) || '',
    createdAt: valueString(order.inserted_at),
    updatedAt: valueString(order.updated_at),
    totalPrice: Math.max(0, numberValue(order.total_price)),
    shipping: isRecord(order.partner) ? (() => {
      const partner = order.partner as Record<string, any>;
      const service = isRecord(partner.service_partner) ? partner.service_partner as Record<string, any> : {};
      const updates = Array.isArray(partner.extend_update) ? partner.extend_update : [];
      const latest = isRecord(updates[0]) ? updates[0] as Record<string, any> : {};
      return {
        carrier: valueString(partner.partner_name) || '',
        serviceName: valueString(service.SERVICE_NAME) || valueString(service.service_name) || valueString(service.ORDER_SERVICE) || valueString(partner.service_name) || '',
        trackingCode: valueString(partner.order_number_vtp) || valueString(partner.extend_code) || valueString(latest.tracking_id) || '',
        fee: Math.max(0, numberValue(order.partner_fee || partner.total_fee)),
        status: valueString(partner.partner_status) || '',
        statusText: valueString(latest.status) || valueString(partner.partner_status) || '',
        location: valueString(latest.location) || '',
        note: valueString(latest.note) || '',
        updatedAt: valueString(latest.updated_at) || valueString(partner.updated_at),
        pickedUpAt: valueString(partner.picked_up_at),
        firstDeliveryAt: valueString(partner.first_delivery_at),
        expectedDeliveryAt: valueString(service.DELIVERY_DATE) || valueString(order.estimate_delivery_date),
        deliveryName: valueString(partner.delivery_name) || '',
        deliveryPhone: valueString(partner.delivery_tel) || '',
        trackingLink: valueString(order.tracking_link) || '',
        history: updates.slice(0, 20).filter(isRecord).map((entry: Record<string, any>) => ({
          status: valueString(entry.status) || '', location: valueString(entry.location) || '',
          note: valueString(entry.note) || '', updatedAt: valueString(entry.updated_at),
        })),
      };
    })() : null,  };
}

export async function getPancakeTrackingByReference(user: AuthUser, reference: string) {
  if (!(await canManagePancake(user))) throw new PancakeIntegrationError('Forbidden', 403, 'forbidden');
  const value = reference.trim().slice(0, 100);
  if (!value || /[\/?#\x00-\x1f]/.test(value)) {
    throw new PancakeIntegrationError('Mã đơn Pancake không hợp lệ', 400, 'invalid_order_code');
  }

  let orderId = value;
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(value)) {
    const result = await callPancakeGet('/orders', { search: value, page_number: '1', page_size: '20' });
    const rows = Array.isArray(result?.data) ? result.data : [];
    const normalized = (candidate: unknown) => String(candidate ?? '').trim().toLocaleLowerCase('vi-VN');
    const expected = normalized(value);
    const referenceTokens = new Set((value.match(/[A-Za-z][A-Za-z0-9_-]{2,39}/g) || []).map(normalized));
    const identifiers = (row: any) => [row?.id, row?.display_id, row?.custom_id].map(normalized).filter(Boolean);
    const matched = rows.find((row: any) => identifiers(row).includes(expected))
      || rows.find((row: any) => identifiers(row).some((candidate) => referenceTokens.has(candidate)))
      || (rows.length === 1 ? rows[0] : null);
    const matchedId = String(matched?.id ?? '').trim();
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(matchedId)) {
      throw new PancakeIntegrationError('Không tìm thấy đơn Pancake', 404, 'order_not_found');
    }
    orderId = matchedId;
  }

  return getPancakeOrderDetail(user, orderId);
}

export async function getPancakeOrderDetail(user: AuthUser, orderCode: string) {
  if (!(await canManagePancake(user))) throw new PancakeIntegrationError('Forbidden', 403, 'forbidden');
  const code = orderCode.trim().replace(/^#/, '');

  // 1. Try Pancake POS API
  try {
    const data = await callPancakeGet(`/orders/${encodeURIComponent(code)}`);
    const raw = isRecord(data?.data) ? data.data : (isRecord(data) ? data : null);
    if (raw && raw.id) {
      const order = normalizePancakeOrder(raw as Record<string, any>);
      return {
        order: {
          ...order,
          creator: isRecord(raw.creator) ? { name: valueString(raw.creator.name) || '', avatarUrl: valueString(raw.creator.avatar_url) } : null,
          warehouse: isRecord(raw.warehouse_info) ? { name: valueString(raw.warehouse_info.name) || '', address: valueString(raw.warehouse_info.full_address) || '' } : null,
          cod: Math.max(0, numberValue(raw.cod)), prepaid: Math.max(0, numberValue(raw.prepaid)),
          surcharge: Math.max(0, numberValue(raw.surcharge)), moneyToCollect: Math.max(0, numberValue(raw.money_to_collect)),
          orderLink: valueString(raw.order_link), tags: Array.isArray(raw.tags) ? raw.tags.map((tag: any) => valueString(tag?.name)).filter(Boolean) : [],
        },
      };
    }
  } catch (err: any) {
    // Only a verified upstream 404 may fall back to the tenant-local mirror.
    // Timeouts and 5xx responses must remain visible to callers.
    if (!(err instanceof PancakeIntegrationError) || err.statusCode !== 404) throw err;
  }

  // 2. Check local DeliveryOrder in PostgreSQL DB
  try {
    const localDelivery = await prisma.deliveryOrder.findFirst({
      where: {
        orgId: user.orgId,
        deletedAt: null,
        OR: [
          { orderCode: { equals: code, mode: 'insensitive' } },
          { id: code },
          { pancakeOrderId: code }
        ]
      },
      include: { createdBy: { select: { fullName: true } } }
    });

    if (localDelivery) {
      return {
        order: {
          id: localDelivery.orderCode || localDelivery.id,
          displayId: localDelivery.orderCode,
          status: localDelivery.deliveryStatus === 'delivered' ? 4 : (localDelivery.deliveryStatus === 'shipping' ? 3 : 1),
          statusName: localDelivery.deliveryStatus === 'delivered' ? 'Thành công' : 'Đang giao',
          customerName: localDelivery.recipientName || 'Khách hàng',
          phone: localDelivery.recipientPhone || '',
          shippingAddress: localDelivery.addressLine || '',
          total: Number(localDelivery.totalAmount) || 0,
          cod: Number(localDelivery.codAmount) || 0,
          prepaid: Number(localDelivery.deposit) || 0,
          moneyToCollect: Math.max(0, Number(localDelivery.totalAmount) - Number(localDelivery.deposit)),
          shippingCarrier: localDelivery.carrierName || 'Giao vận',
          warehouse: localDelivery.warehouseName || 'Thiệp Cưới',
          notes: localDelivery.notes || '',
          creator: { name: localDelivery.createdBy?.fullName || 'Hệ thống' },
          items: []
        }
      };
    }
  } catch (dbErr) {
    throw new PancakeIntegrationError('Không thể tra cứu đơn hàng nội bộ', 500, 'local_order_lookup_failed');
  }

  throw new PancakeIntegrationError('Không tìm thấy đơn Pancake', 404, 'order_not_found');
}

function boundedString(value: unknown, maxLength: number): string {
  return String(value ?? '').trim().slice(0, maxLength);
}

function nonNegativeInteger(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new PancakeIntegrationError(`${field} kh?ng h?p l?`, 400, 'invalid_order_update');
  }
  return Math.round(number);
}

export async function updatePancakeOrder(user: AuthUser, orderCode: string, input: Record<string, unknown>) {
  if (!(await canManagePancake(user, 'edit'))) throw new PancakeIntegrationError('B?n kh?ng c? quy?n s?a ??n Pancake', 403, 'forbidden');
  const code = orderCode.trim();
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(code)) throw new PancakeIntegrationError('M? ??n Pancake kh?ng h?p l?', 400, 'invalid_order_code');
  if (!isRecord(input)) throw new PancakeIntegrationError('D? li?u c?p nh?t kh?ng h?p l?', 400, 'invalid_order_update');

  const payload: Record<string, unknown> = {};
  if (input.status !== undefined) {
    const status = Number(input.status);
    if (!Number.isInteger(status) || status < 0 || status > 6) throw new PancakeIntegrationError('Tr?ng th?i ??n kh?ng h?p l?', 400, 'invalid_order_status');
    payload.status = status;
  }
  for (const [key, max] of [['bill_full_name', 300], ['bill_phone_number', 50], ['bill_email', 320], ['note', 3000], ['note_print', 3000], ['warehouse_id', 100]] as const) {
    if (input[key] !== undefined) payload[key] = boundedString(input[key], max);
  }
  for (const key of ['shipping_fee', 'total_discount', 'cash', 'transfer_money', 'surcharge'] as const) {
    if (input[key] !== undefined) payload[key] = nonNegativeInteger(input[key], key);
  }
  if (input.is_free_shipping !== undefined) payload.is_free_shipping = Boolean(input.is_free_shipping);
  if (input.shipping_address !== undefined) {
    if (!isRecord(input.shipping_address)) throw new PancakeIntegrationError('??a ch? giao h?ng kh?ng h?p l?', 400, 'invalid_shipping_address');
    const address = input.shipping_address;
    payload.shipping_address = {
      address: boundedString(address.address ?? address.full_address, 1000),
      full_address: boundedString(address.full_address ?? address.address, 1000),
      full_name: boundedString(address.full_name ?? input.bill_full_name, 300),
      phone_number: boundedString(address.phone_number ?? input.bill_phone_number, 50),
      country_code: '84',
    };
  }
  if (input.items !== undefined) {
    if (!Array.isArray(input.items) || input.items.length > 100) throw new PancakeIntegrationError('Danh s?ch s?n ph?m kh?ng h?p l?', 400, 'invalid_order_items');
    payload.items = input.items.map((value, index) => {
      if (!isRecord(value)) throw new PancakeIntegrationError(`S?n ph?m ${index + 1} kh?ng h?p l?`, 400, 'invalid_order_items');
      const variationId = boundedString(value.variation_id, 100);
      if (!variationId) throw new PancakeIntegrationError(`S?n ph?m ${index + 1} thi?u variation_id`, 400, 'invalid_order_items');
      const quantity = nonNegativeInteger(value.quantity, `S? l??ng s?n ph?m ${index + 1}`);
      if (quantity < 1) throw new PancakeIntegrationError(`S? l??ng s?n ph?m ${index + 1} ph?i l?n h?n 0`, 400, 'invalid_order_items');
      const info = isRecord(value.variation_info) ? value.variation_info : {};
      return {
        variation_id: variationId,
        product_id: boundedString(value.product_id, 100) || undefined,
        quantity,
        variation_info: {
          name: boundedString(info.name, 300),
          detail: boundedString(info.detail, 500),
          retail_price: nonNegativeInteger(info.retail_price, `??n gi? s?n ph?m ${index + 1}`),
        },
      };
    });
  }
  if (!Object.keys(payload).length) throw new PancakeIntegrationError('Kh?ng c? d? li?u c?n c?p nh?t', 400, 'empty_order_update');

  const cfg = config();
  const url = new URL(`${cfg.baseUrl}/shops/${encodeURIComponent(cfg.shopId)}/orders/${encodeURIComponent(code)}`);
  url.searchParams.set('api_key', cfg.apiKey);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new PancakeIntegrationError(safeErrorMessage(error), 504, 'pancake_timeout');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success === false) {
    const upstream = valueString(data?.message || data?.error || data?.error_message);
    throw new PancakeIntegrationError(upstream ? `Pancake POS: ${upstream}` : `Pancake POS t? ch?i c?p nh?t (HTTP ${response.status})`, 502, 'pancake_update_failed');
  }

  return getPancakeOrderDetail(user, code);
}

export async function syncPancakeOrderByConversation(conversationId: string, user: AuthUser) {
  if (!(await canManagePancake(user, 'edit'))) throw new PancakeIntegrationError('Forbidden', 403, 'forbidden');
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, orgId: user.orgId, deletedAt: null },
    select: { groupName: true },
  });
  if (!conversation) throw new PancakeIntegrationError('Không tìm thấy hội thoại', 404, 'conversation_not_found');

  const linked = await prisma.pancakeOrderLink.findFirst({
    where: { conversationId, orgId: user.orgId },
    select: { orderCode: true, pancakeOrderId: true },
  });
  const groupCode = conversation.groupName?.trim().match(/^#?([A-Za-z][A-Za-z0-9_-]{2,39})(?:\s|$)/)?.[1] || null;
  const orderCode = linked?.orderCode || linked?.pancakeOrderId || groupCode;
  if (!orderCode) return { order: null, reason: 'order_code_not_found' };
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(orderCode)) throw new PancakeIntegrationError('Mã đơn Pancake không hợp lệ', 400, 'invalid_order_code');

  try {
    const data = await callPancakeGet(`/orders/${encodeURIComponent(orderCode)}`);
    const order = isRecord(data?.data) ? data.data : (isRecord(data) ? data : null);
    if (!order || !order.id) return { order: null, orderCode, reason: 'order_not_found' };
    return { order: normalizePancakeOrder(order), orderCode };
  } catch (error) {
    if (error instanceof PancakeIntegrationError && /HTTP 404/.test(error.message)) return { order: null, orderCode, reason: 'order_not_found' };
    throw error;
  }
}
export async function getPancakeLink(conversationId: string, orgId: string) {
  const link = await prisma.pancakeOrderLink.findFirst({ where: { conversationId, orgId } });
  return link ? serializeLink(link) : null;
}

export async function createPancakeOrderForConversation(
  conversationId: string,
  user: AuthUser,
  extra: Record<string, unknown> = {},
) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, orgId: user.orgId, deletedAt: null },
    select: { id: true, orgId: true, threadType: true, zaloAccountId: true, externalThreadId: true, groupName: true },
  });
  if (!conversation) throw new PancakeIntegrationError('Không tìm thấy hội thoại', 404, 'conversation_not_found');
  if (conversation.threadType === 'group' && !conversation.externalThreadId) throw new PancakeIntegrationError('Group conversation is missing Zalo group ID', 400, 'group_id_missing');
  if (!(await canManagePancake(user, 'create'))) throw new PancakeIntegrationError('Bạn không có quyền tạo đơn Pancake', 403, 'forbidden');

  const cfg = config();
  const existing = await prisma.pancakeOrderLink.findFirst({ where: { conversationId, orgId: user.orgId } });
  if (existing?.pancakeOrderId) return { link: serializeLink(existing), alreadyExisted: true, renameSucceeded: existing.syncStatus === 'complete' };
  if (existing?.syncStatus === 'creating' || existing?.syncStatus === 'unknown') {
    throw new PancakeIntegrationError('Yêu cầu tạo đơn đang xử lý hoặc chưa xác định kết quả. Không tạo lại để tránh trùng đơn.', 409, 'pancake_creation_uncertain');
  }

  let lock: any;
  try {
    lock = existing
      ? await prisma.pancakeOrderLink.update({ where: { id: existing.id }, data: { syncStatus: 'creating', lastError: null } })
      : await prisma.pancakeOrderLink.create({ data: { orgId: user.orgId, conversationId, shopId: cfg.shopId, createdById: user.id, syncStatus: 'creating' } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const raced = await prisma.pancakeOrderLink.findFirst({ where: { conversationId, orgId: user.orgId } });
      if (raced) return { link: serializeLink(raced), alreadyExisted: true, renameSucceeded: raced.syncStatus === 'complete' };
    }
    throw error;
  }

  let created: { order: PancakeOrder; shopId: string };
  try {
    created = await callCreateOrder(conversationId, extra);
  } catch (error) {
    const uncertain = error instanceof PancakeIntegrationError &&
      (error.code === 'pancake_timeout' || error.code === 'pancake_creation_uncertain');
    await prisma.pancakeOrderLink.update({
      where: { id: lock.id },
      data: { syncStatus: uncertain ? 'unknown' : 'failed', lastError: safeErrorMessage(error) },
    });
    throw error;
  }

  const pancakeOrderId = String(created.order.id);
  const displayId = valueString(created.order.display_id);
  const customId = valueString(created.order.custom_id);
  const orderCode = displayId || customId || pancakeOrderId;
  let link = await prisma.pancakeOrderLink.update({
    where: { id: lock.id },
    data: {
      shopId: created.shopId,
      pancakeOrderId,
      displayId,
      customId,
      orderCode,
      pancakeStatus: typeof created.order.status === 'number' ? created.order.status : null,
      pancakeStatusName: valueString(created.order.status_name),
      syncStatus: 'created',
      rawResponse: created.order as Prisma.InputJsonValue,
      lastError: null,
    },
  });

  let crmOrder: { id: string; status: string; orderCode: string };
  try {
    crmOrder = await ensureLinkedCrmOrder(conversation.id, conversation.orgId, orderCode, user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không tạo được đơn CRM mặc định';
    link = await prisma.pancakeOrderLink.update({
      where: { id: link.id },
      data: { syncStatus: 'created', lastError: `Đã tạo đơn Pancake ${orderCode}, nhưng không gắn được trạng thái chưa demo: ${message}` },
    });
    return { link: serializeLink(link), alreadyExisted: false, renameSucceeded: false };
  }

  let renameSucceeded = conversation.threadType !== 'group';
  if (conversation.threadType === 'group') {
    try {
      await renameLinkedGroup(conversation, crmOrder.orderCode, crmOrder.status);
      renameSucceeded = true;
      link = await prisma.pancakeOrderLink.update({ where: { id: link.id }, data: { syncStatus: 'complete', lastError: null } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not rename Zalo group';
      link = await prisma.pancakeOrderLink.update({ where: { id: link.id }, data: { syncStatus: 'rename_failed', lastError: message } });
    }
  } else {
    link = await prisma.pancakeOrderLink.update({ where: { id: link.id }, data: { syncStatus: 'complete', lastError: null } });
  }

  return { link: serializeLink(link), alreadyExisted: false, renameSucceeded };
}

export async function retryPancakeGroupRename(conversationId: string, user: AuthUser) {
  if (!(await canManagePancake(user, 'edit'))) throw new PancakeIntegrationError('Bạn không có quyền đổi tên nhóm', 403, 'forbidden');
  const link = await prisma.pancakeOrderLink.findFirst({ where: { conversationId, orgId: user.orgId } });
  if (!link?.pancakeOrderId || !link.orderCode) throw new PancakeIntegrationError('Hội thoại chưa có đơn Pancake để đổi tên', 404, 'pancake_link_not_found');
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, orgId: user.orgId },
    select: { id: true, orgId: true, zaloAccountId: true, externalThreadId: true },
  });
  if (!conversation) throw new PancakeIntegrationError('Không tìm thấy hội thoại', 404, 'conversation_not_found');
  try {
    const crmOrder = await ensureLinkedCrmOrder(conversation.id, conversation.orgId, link.orderCode, user.id);
    await renameLinkedGroup(conversation, crmOrder.orderCode, crmOrder.status);
    const updated = await prisma.pancakeOrderLink.update({ where: { id: link.id }, data: { syncStatus: 'complete', lastError: null } });
    return serializeLink(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không đổi được tên nhóm Zalo';
    await prisma.pancakeOrderLink.update({ where: { id: link.id }, data: { syncStatus: 'rename_failed', lastError: message } });
    throw new PancakeIntegrationError(`Đã có đơn ${link.orderCode}, nhưng chưa đổi được tên nhóm Zalo`, 502, 'rename_failed');
  }
}
