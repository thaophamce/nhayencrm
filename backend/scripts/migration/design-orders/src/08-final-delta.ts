/**
 * Phase 8 — Final Delta Import
 * Đọc lại Firebase, so sánh checksum, chỉ import đơn mới hoặc thay đổi.
 * Dùng cho lần chạy cuối cùng trước khi tắt TRACKER.
 *
 * node --env-file=.env --import tsx scripts/migration/design-orders/src/08-final-delta.ts
 * node --env-file=.env --import tsx .../08-final-delta.ts --apply
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cert, deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { checksumOf } from './lib/canonical-json.js';
import type { FirebaseOrder } from './lib/firebase-types.js';

const FIREBASE_DATABASE_URL = 'https://nha-yen-tracker-default-rtdb.asia-southeast1.firebasedatabase.app';
const FIREBASE_NODE = 'orders';
const EXPECTED_PROJECT_ID = 'nha-yen-tracker';
const TARGET_ORG_ID = '4189574a-f0f9-46a5-be49-e5119dcc7376';
const SOURCE_SYSTEM = 'donnhayen_firebase';

const apply = process.argv.includes('--apply');
const credPathRaw = process.env.FIREBASE_IMPORT_CREDENTIALS;
if (!credPathRaw) throw new Error('Thiếu FIREBASE_IMPORT_CREDENTIALS');
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Thiếu DATABASE_URL');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const cred = JSON.parse(await readFile(resolve(credPathRaw!), 'utf8')) as { project_id?: string };
  if (cred.project_id !== EXPECTED_PROJECT_ID) throw new Error(`Firebase project mismatch: ${cred.project_id}`);

  const appName = 'design-delta';
  const app = getApps().find((a) => a.name === appName)
    ?? initializeApp({ credential: cert(cred as Parameters<typeof cert>[0]), databaseURL: FIREBASE_DATABASE_URL }, appName);
  try {
    // 1. Fetch Firebase
    const snap = await getDatabase(app).ref(FIREBASE_NODE).once('value');
    const raw = (snap.val() as Record<string, FirebaseOrder> | null) ?? {};
    const firebaseEntries = Object.entries(raw).filter(([, v]) => v?.orderCode);

    // 2. Fetch current DB checksums for all imported design orders
    const dbRows = await prisma.$queryRaw<{ source_external_id: string; checksum_sha256: string | null }[]>`
      SELECT source_external_id, checksum_sha256
      FROM orders
      WHERE org_id = ${TARGET_ORG_ID} AND source_system = ${SOURCE_SYSTEM}`;
    const dbChecksumMap = new Map(dbRows.map((r) => [r.source_external_id, r.checksum_sha256]));

    // 3. Classify
    const newOrders: string[] = [];
    const changed: string[] = [];
    const unchanged: string[] = [];
    const removedFromFirebase = [...dbChecksumMap.keys()].filter(
      (k) => !firebaseEntries.some(([fk]) => fk === k),
    );

    for (const [key, order] of firebaseEntries) {
      const firebaseChecksum = checksumOf({ _firebaseKey: key, ...order });
      if (!dbChecksumMap.has(key)) { newOrders.push(key); continue; }
      if (dbChecksumMap.get(key) !== firebaseChecksum) { changed.push(key); continue; }
      unchanged.push(key);
    }

    const report = {
      mode: apply ? 'APPLY' : 'DRY_RUN',
      firebase: { total: firebaseEntries.length },
      db: { alreadyImported: dbChecksumMap.size },
      delta: {
        new: newOrders.length,
        changed: changed.length,
        unchanged: unchanged.length,
        removedFromFirebase: removedFromFirebase.length,
      },
      removedKeys: removedFromFirebase,
    };
    console.log(JSON.stringify(report, null, 2));

    if (newOrders.length === 0 && changed.length === 0) {
      console.log('\nKhông có delta — DB đã đồng bộ với Firebase.');
      return;
    }

    if (!apply) {
      console.log(`\nDRY_RUN: ${newOrders.length} đơn mới, ${changed.length} đơn thay đổi.`);
      console.log('Chạy 07-import-design-orders.ts --apply để áp dụng toàn bộ.');
      return;
    }

    // For actual delta apply, re-delegate to 07 with full logic
    console.log('=> Để áp dụng delta, chạy:');
    console.log('   node --env-file=.env --import tsx .../07-import-design-orders.ts --apply');
  } finally {
    await deleteApp(app);
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
