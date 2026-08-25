/**
 * Phase 7 — Import Design Orders
 * Dry-run mặc định. Thêm --apply để ghi vào DB.
 *
 * node --env-file=.env --import tsx scripts/migration/design-orders/src/07-import-design-orders.ts
 * node --env-file=.env --import tsx .../07-import-design-orders.ts --apply
 * node --env-file=.env --import tsx .../07-import-design-orders.ts --limit=10
 *
 * Env: FIREBASE_IMPORT_CREDENTIALS, DATABASE_URL, TRACKER_PATH
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { cert, deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { checksumOf } from './lib/canonical-json.js';
import type { FirebaseOrder, FileCountHistoryEntry } from './lib/firebase-types.js';
import { validateGoldenRef } from './lib/salary-golden-ref.js';

const FIREBASE_DATABASE_URL = 'https://nha-yen-tracker-default-rtdb.asia-southeast1.firebasedatabase.app';
const FIREBASE_NODE = 'orders';
const EXPECTED_PROJECT_ID = 'nha-yen-tracker';
const TARGET_ORG_ID  = '4189574a-f0f9-46a5-be49-e5119dcc7376';
const TARGET_USER_ID = 'cfe210ab-2b34-47b7-8d9a-7cdf8364c07a';
const SOURCE_SYSTEM  = 'donnhayen_firebase';

const apply = process.argv.includes('--apply');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : undefined;
if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
  throw new Error('--limit phải là số nguyên dương');
}

const credPathRaw = process.env.FIREBASE_IMPORT_CREDENTIALS;
if (!credPathRaw) throw new Error('Thiếu FIREBASE_IMPORT_CREDENTIALS');
const credentialPath = resolve(credPathRaw);
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Thiếu DATABASE_URL');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

interface DesignerEntry { firebaseUsername: string; userId: string | null; status: string }
interface DesignerMapFile { mappings: DesignerEntry[]; unmatchedCount: number }

function makeRunId(): string {
  const d = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `${d}-${randomBytes(4).toString('hex')}`;
}

function resolvedFileCountHistory(src: FirebaseOrder): FileCountHistoryEntry[] | null {
  if (Array.isArray(src.fileCountHistory) && src.fileCountHistory.length > 0) return src.fileCountHistory;
  if (src.timestamps?.designing) return [{ count: src.fileCount ?? 0, changedAt: src.timestamps.designing }];
  return null;
}

function transformOrder(
  key: string,
  src: FirebaseOrder,
  designerMap: Map<string, string | null>,
  runId: string,
) {
  const rawSnap = { _firebaseKey: key, ...src };
  return {
    orderCode: src.orderCode,
    fileCount: typeof src.fileCount === 'number' ? src.fileCount : 0,
    isUrgent: Boolean(src.isUrgent),
    hasDesignFee: Boolean(src.hasDesignFee),
    isOutsource: Boolean(src.isOutsource),
    designerId: src.designerId ? (designerMap.get(src.designerId) ?? null) : null,
    status: src.status ?? 'demo',
    notes: src.notes ?? null,
    orgId: TARGET_ORG_ID,
    // Salary fields
    timestamps: (src.timestamps ?? null) as unknown,
    fileCountHistory: resolvedFileCountHistory(src) as unknown,
    designFeeTickedAt: src.designFeeTickedAt ? new Date(src.designFeeTickedAt) : null,
    outsourceKpiTickedAt: src.outsourceKpiTickedAt ? new Date(src.outsourceKpiTickedAt) : null,
    outsourceKpiFileCount: src.outsourceKpiFileCount ?? null,
    outsourceApprovedAt: src.outsourceApprovedAt ? new Date(src.outsourceApprovedAt) : null,
    outsourceApprovedBy: src.outsourceApprovedBy ?? null,
    outsourceApprovedBonus: src.outsourceApprovedBonus ?? null,
    approvedDesignerId: src.approvedDesignerId ?? null,
    // Provenance
    sourceSystem: SOURCE_SYSTEM,
    sourceExternalId: key,
    rawSnapshot: rawSnap as unknown,
    checksumSha256: checksumOf(rawSnap),
    importedAt: new Date(),
    importRunId: runId,
    createdAt: src.createdAt ? new Date(src.createdAt) : undefined,
  };
}
async function main() {
  const runId = makeRunId();
  const runsDir = join(process.cwd(), 'scripts/migration/design-orders/artifacts/runs', runId);
  await mkdir(runsDir, { recursive: true });

  // Validate admin user
  const target = await prisma.user.findFirst({
    where: { id: TARGET_USER_ID, orgId: TARGET_ORG_ID, isActive: true },
    select: { id: true, fullName: true, org: { select: { name: true } } },
  });
  if (!target) throw new Error('Không tìm thấy user active trong org đích');

  // Validate salary golden ref
  await validateGoldenRef();

  // Load designer map (must run 03 first)
  const mapPath = join(process.cwd(), 'scripts/migration/design-orders/artifacts/designer-map.json');
  let mapFile: DesignerMapFile;
  try { mapFile = JSON.parse(await readFile(mapPath, 'utf8')) as DesignerMapFile; }
  catch { throw new Error('Không đọc được designer-map.json — chạy 03-build-designer-map.ts trước'); }
  if (mapFile.unmatchedCount > 0) {
    throw new Error(`STOP GATE: ${mapFile.unmatchedCount} designer chưa được map. Kiểm tra 03 output.`);
  }
  const designerMap = new Map(mapFile.mappings.map((m) => [m.firebaseUsername, m.userId]));
  // 'rola' là alias cũ của 'nguyenrola' trong Firebase (xác nhận bởi CTO 04/08/2026)
  const nguyenrolaId = designerMap.get('nguyenrola');
  if (nguyenrolaId) designerMap.set('rola', nguyenrolaId);

  // Load Firebase
  const cred = JSON.parse(await readFile(credentialPath, 'utf8')) as { project_id?: string };
  if (cred.project_id !== EXPECTED_PROJECT_ID) throw new Error(`Firebase project mismatch: ${cred.project_id}`);
  const appName = `import-${runId}`;
  const app = getApps().find((a) => a.name === appName)
    ?? initializeApp({ credential: cert(cred as Parameters<typeof cert>[0]), databaseURL: FIREBASE_DATABASE_URL }, appName);
  try {
    const snap = await getDatabase(app).ref(FIREBASE_NODE).once('value');
    const raw = (snap.val() as Record<string, FirebaseOrder> | null) ?? {};
    const entries = Object.entries(raw);
    const invalid: string[] = [];
    const eligible = entries.flatMap(([k, v]) => {
      if (!v?.orderCode) { invalid.push(k); return []; }
      return [{ key: k, order: v }];
    });
    const selected = limit ? eligible.slice(0, limit) : eligible;
    const rows = selected.map(({ key, order }) => transformOrder(key, order, designerMap, runId));
    // Check existing by source_external_id
    const existingRows = rows.length
      ? await prisma.$queryRaw<{ source_external_id: string; checksum_sha256: string }[]>`
          SELECT source_external_id, checksum_sha256 FROM orders
          WHERE org_id = ${TARGET_ORG_ID} AND source_system = ${SOURCE_SYSTEM}
            AND source_external_id = ANY(${rows.map((r) => r.sourceExternalId)}::text[])`
      : [];
    const existingMap = new Map(existingRows.map((r) => [r.source_external_id, r.checksum_sha256]));
    const toCreate = rows.filter((r) => !existingMap.has(r.sourceExternalId));
    const toUpdate = rows.filter((r) => existingMap.has(r.sourceExternalId) && existingMap.get(r.sourceExternalId) !== r.checksumSha256);
    const unchanged = rows.filter((r) => existingMap.has(r.sourceExternalId) && existingMap.get(r.sourceExternalId) === r.checksumSha256);

    console.log(JSON.stringify({
      mode: apply ? 'APPLY' : 'DRY_RUN', runId,
      source: { total: entries.length, invalid: invalid.length, selected: selected.length },
      summary: { toCreate: toCreate.length, toUpdate: toUpdate.length, unchanged: unchanged.length },
    }, null, 2));

    if (!apply) { console.log('\nDRY_RUN hoàn tất. Thêm --apply để ghi.'); return; }

    // Upsert in batches
    const BATCH = 100;
    const all = [...toCreate, ...toUpdate];
    for (let i = 0; i < all.length; i += BATCH) {
      await prisma.$transaction(all.slice(i, i + BATCH).map((row) => {
        const { createdAt, ...data } = row;
        const createPayload = createdAt ? { ...data, createdAt } : data;
        return prisma.order.upsert({
          where: { orgId_sourceSystem_sourceExternalId: { orgId: TARGET_ORG_ID, sourceSystem: SOURCE_SYSTEM, sourceExternalId: row.sourceExternalId! } },
          update: data as Parameters<typeof prisma.order.update>[0]['data'],
          create: createPayload as Parameters<typeof prisma.order.create>[0]['data'],
        });
      }));
      console.log(`Upserted ${Math.min(i + BATCH, all.length)}/${all.length}`);
    }

    const rollback = [`-- Rollback run: ${runId}`, `DELETE FROM "orders" WHERE import_run_id = '${runId}' AND source_system = '${SOURCE_SYSTEM}';`].join('\n');
    await writeFile(join(runsDir, 'rollback.sql'), rollback, 'utf8');
    console.log(JSON.stringify({ result: 'success', runId, created: toCreate.length, updated: toUpdate.length }, null, 2));
    console.log(`Rollback SQL: ${join(runsDir, 'rollback.sql')}`);
  } finally { await deleteApp(app); }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
