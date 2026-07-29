/**
 * Import đơn giao vận từ Firebase Realtime Database vào CRM.
 *
 * Mặc định chỉ dry-run, không ghi DB:
 *   node --env-file=.env --import tsx scripts/import-firebase-delivery-orders.ts --limit=5
 *
 * Ghi toàn bộ sau khi duyệt dry-run:
 *   node --env-file=.env --import tsx scripts/import-firebase-delivery-orders.ts --apply
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cert, deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const FIREBASE_DATABASE_URL = 'https://nhayen-giaovan-90a84-default-rtdb.asia-southeast1.firebasedatabase.app';
const FIREBASE_NODE = 'orders';
const TARGET_USER_ID = 'cfe210ab-2b34-47b7-8d9a-7cdf8364c07a';
const TARGET_ORG_ID = '4189574a-f0f9-46a5-be49-e5119dcc7376';
const TARGET_LOGIN = 'admin';
// H?t 30/06/2026 theo Asia/Bangkok (UTC+7); d?ng m?c lo?i tr?.
const CREATED_BEFORE = new Date('2026-06-30T17:00:00.000Z');
const PAYMENT_STATUSES = new Set(['unpaid', 'deposited', 'paid']);
const DELIVERY_METHODS = new Set(['viettelpost', 'grab', 'chanh-xe', 'pickup']);

const apply = process.argv.includes('--apply');
const separateLimitIndex = process.argv.indexOf('--limit');
const inlineLimitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limitWasProvided = separateLimitIndex >= 0 || inlineLimitArg !== undefined;
const limitRaw = separateLimitIndex >= 0
  ? process.argv[separateLimitIndex + 1]
  : inlineLimitArg?.slice('--limit='.length);
const parsedLimit = limitWasProvided ? Number(limitRaw) : undefined;
if (limitWasProvided && (!Number.isInteger(parsedLimit) || Number(parsedLimit) <= 0)) {
  throw new Error('--limit phải là số nguyên dương');
}
const limit = parsedLimit;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Thiếu DATABASE_URL');
const credentialPathRaw = process.env.FIREBASE_IMPORT_CREDENTIALS;
if (!credentialPathRaw) throw new Error('Thiếu FIREBASE_IMPORT_CREDENTIALS');
const credentialPath = resolve(credentialPathRaw);

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

type FirebaseOrder = Record<string, unknown>;
type MappedOrder = {
  firebaseKey: string;
  orderCode: string;
  sourceOrderCode: string;
  duplicateNumber: number;
  productType: string;
  quantity: number;
  createdDate: Date;
  totalAmount: number;
  deposit: number;
  paymentStatus: string;
  deliveryMethod: string;
  deliveryStatus: string;
  warehouseName: string | null;
  notes: string | null;
  codAmount: number;
};

function text(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().slice(0, max);
  return normalized || null;
}

function nonNegativeAmount(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function mapOrder(firebaseKey: string, source: FirebaseOrder): MappedOrder | null {
  const orderCode = text(source.orderCode, 100);
  if (!orderCode) return null;

  const totalAmount = nonNegativeAmount(source.totalAmount);
  const deposit = nonNegativeAmount(source.deposit);
  const paymentStatus = typeof source.paymentStatus === 'string' && PAYMENT_STATUSES.has(source.paymentStatus)
    ? source.paymentStatus
    : 'unpaid';
  const deliveryMethod = typeof source.deliveryMethod === 'string' && DELIVERY_METHODS.has(source.deliveryMethod)
    ? source.deliveryMethod
    : 'viettelpost';
  const timestamp = Number(source.createdDate);
  const createdDate = Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp) : new Date();
  const rawQuantity = Math.floor(Number(source.quantity));

  return {
    firebaseKey,
    orderCode,
    sourceOrderCode: orderCode,
    duplicateNumber: 1,
    productType: text(source.productType, 300) ?? 'invitation',
    quantity: Number.isFinite(rawQuantity) && rawQuantity > 0 ? rawQuantity : 1,
    createdDate: Number.isNaN(createdDate.getTime()) ? new Date() : createdDate,
    totalAmount,
    deposit,
    paymentStatus,
    deliveryMethod,
    deliveryStatus: 'pending',
    warehouseName: text(source.warehouseId, 300),
    notes: text(source.notes, 2000),
    codAmount: paymentStatus === 'paid' ? 0 : Math.max(totalAmount - deposit, 0),
  };
}

function dbData(order: MappedOrder) {
  return {
    productType: order.productType,
    quantity: order.quantity,
    createdDate: order.createdDate,
    totalAmount: order.totalAmount,
    deposit: order.deposit,
    paymentStatus: order.paymentStatus,
    deliveryMethod: order.deliveryMethod,
    deliveryStatus: order.deliveryStatus,
    warehouseName: order.warehouseName,
    notes: order.notes,
    codAmount: order.codAmount,
    createdById: TARGET_USER_ID,
    deletedAt: null,
  };
}

async function main() {
  const target = await prisma.user.findFirst({
    where: { id: TARGET_USER_ID, orgId: TARGET_ORG_ID, email: TARGET_LOGIN, isActive: true },
    select: { id: true, orgId: true, email: true, fullName: true, role: true, org: { select: { name: true } } },
  });
  if (!target) throw new Error('Không tìm thấy tài khoản admin đích đúng ID, tổ chức và trạng thái hoạt động');

  const credential = JSON.parse(await readFile(credentialPath, 'utf8')) as { project_id?: string };
  if (credential.project_id !== 'nhayen-giaovan-90a84') {
    throw new Error('Firebase credential không thuộc project nhayen-giaovan-90a84');
  }

  const firebaseApp = getApps().find((item) => item.name === 'delivery-import') ?? initializeApp({
    credential: cert(credential as Parameters<typeof cert>[0]),
    databaseURL: FIREBASE_DATABASE_URL,
  }, 'delivery-import');

  try {
    const snapshot = await getDatabase(firebaseApp).ref(FIREBASE_NODE).once('value');
    const raw = snapshot.val() as Record<string, FirebaseOrder> | null;
    const entries = raw ? Object.entries(raw) : [];
    const invalid: Array<{ firebaseKey: string; reason: string }> = [];
    const eligible: MappedOrder[] = [];

    for (const [firebaseKey, source] of entries) {
      const mapped = mapOrder(firebaseKey, source ?? {});
      if (!mapped) {
        invalid.push({ firebaseKey, reason: 'Thi?u orderCode' });
        continue;
      }
      if (mapped.createdDate >= CREATED_BEFORE) continue;
      eligible.push(mapped);
    }

    const selected = limit ? eligible.slice(0, limit) : eligible;
    const occurrenceByCode = new Map<string, number>();
    const duplicateSource: Array<{ firebaseKey: string; sourceOrderCode: string; assignedOrderCode: string }> = [];
    const orders = selected.map((order) => {
      const duplicateNumber = (occurrenceByCode.get(order.sourceOrderCode) ?? 0) + 1;
      occurrenceByCode.set(order.sourceOrderCode, duplicateNumber);
      if (duplicateNumber === 1) return order;

      const suffix = ` [tr\u00f9ng ${duplicateNumber}]`;
      const assignedOrderCode = `${order.sourceOrderCode.slice(0, 100 - suffix.length)}${suffix}`;
      duplicateSource.push({ firebaseKey: order.firebaseKey, sourceOrderCode: order.sourceOrderCode, assignedOrderCode });
      return { ...order, orderCode: assignedOrderCode, duplicateNumber };
    });
    const existing = orders.length ? await prisma.deliveryOrder.findMany({
      where: { orgId: TARGET_ORG_ID, orderCode: { in: orders.map((order) => order.orderCode) } },
      select: { orderCode: true },
    }) : [];
    const existingCodes = new Set(existing.map((order) => order.orderCode));

    console.log(JSON.stringify({
      mode: apply ? 'APPLY' : 'DRY_RUN',
      target: {
        login: target.email,
        fullName: target.fullName,
        role: target.role,
        organization: target.org.name,
        userId: target.id,
        orgId: target.orgId,
      },
      source: {
        node: `/${FIREBASE_NODE}`,
        totalRecords: entries.length,
        cutoffExclusiveUtc: CREATED_BEFORE.toISOString(),
        cutoffLocal: 'H\u1ebft 30/06/2026 Asia/Bangkok',
        eligibleRecords: eligible.length,
        selectedRecords: selected.length,
      },
      summary: {
        validRecords: orders.length,
        wouldCreate: orders.filter((order) => !existingCodes.has(order.orderCode)).length,
        wouldUpdate: orders.filter((order) => existingCodes.has(order.orderCode)).length,
        invalid: invalid.length,
        duplicatePreservedWithSuffix: duplicateSource.length,
      },
      orders: orders.map((order) => ({
        firebaseKey: order.firebaseKey,
        action: existingCodes.has(order.orderCode) ? 'update' : 'create',
        orderCode: order.orderCode,
        sourceOrderCode: order.sourceOrderCode,
        duplicateNumber: order.duplicateNumber,
        createdDate: order.createdDate.toISOString(),
        totalAmount: order.totalAmount,
        deposit: order.deposit,
        paymentStatus: order.paymentStatus,
        deliveryMethod: order.deliveryMethod,
        codAmount: order.codAmount,
        productType: order.productType,
        quantity: order.quantity,
        warehouseName: order.warehouseName,
        notes: order.notes,
      })),
      invalid,
      duplicateSource,
    }, null, 2));

    if (!apply) {
      console.log('\nDRY_RUN hoàn tất. DB không thay đổi.');
      return;
    }

    let processed = 0;
    const batchSize = 100;
    for (let offset = 0; offset < orders.length; offset += batchSize) {
      const batch = orders.slice(offset, offset + batchSize);
      await prisma.$transaction(batch.map((order) => prisma.deliveryOrder.upsert({
        where: { orgId_orderCode: { orgId: TARGET_ORG_ID, orderCode: order.orderCode } },
        update: dbData(order),
        create: {
          orgId: TARGET_ORG_ID,
          orderCode: order.orderCode,
          ...dbData(order),
          events: {
            create: {
              status: 'pending',
              statusText: 'Import từ Firebase',
              source: 'firebase_import',
              createdById: TARGET_USER_ID,
            },
          },
        },
      })));
      processed += batch.length;
      console.log(`Đã ghi ${processed}/${orders.length} đơn`);
    }

    console.log(JSON.stringify({
      result: 'success',
      created: orders.filter((order) => !existingCodes.has(order.orderCode)).length,
      updated: orders.filter((order) => existingCodes.has(order.orderCode)).length,
      skippedInvalid: invalid.length,
      preservedDuplicateSource: duplicateSource.length,
    }, null, 2));
  } finally {
    await deleteApp(firebaseApp);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
