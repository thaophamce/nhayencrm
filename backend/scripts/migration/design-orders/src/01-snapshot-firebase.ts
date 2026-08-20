/**
 * Phase 1 — Firebase Snapshot
 * Đọc toàn bộ /orders từ Firebase RTDB (nha-yen-tracker) và lưu ra artifact.
 *
 * Chạy từ thư mục backend/:
 *   node --env-file=.env --import tsx scripts/migration/design-orders/src/01-snapshot-firebase.ts
 *
 * Env:  FIREBASE_IMPORT_CREDENTIALS — đường dẫn tuyệt đối đến serviceAccountKey.json
 *
 * Output: scripts/migration/design-orders/artifacts/snapshots/<RUN_ID>/
 *   orders.raw.json         — dữ liệu thô (Record<firebaseKey, order>)
 *   snapshot.canonical.json — JSON đã sắp xếp keys (deterministic)
 *   snapshot.sha256.txt     — SHA-256 của canonical JSON
 *   meta.json               — runId, timestamp, số đơn, checksum
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { cert, deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { canonicalize, sha256hex } from './lib/canonical-json.js';

const FIREBASE_DATABASE_URL = 'https://nha-yen-tracker-default-rtdb.asia-southeast1.firebasedatabase.app';
const FIREBASE_NODE = 'orders';
const EXPECTED_PROJECT_ID = 'nha-yen-tracker';

const credentialPathRaw = process.env.FIREBASE_IMPORT_CREDENTIALS;
if (!credentialPathRaw) throw new Error('Thiếu FIREBASE_IMPORT_CREDENTIALS');
const credentialPath = resolve(credentialPathRaw);

function generateRunId(): string {
  const now = new Date();
  const d = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `${d}-${randomBytes(4).toString('hex')}`;
}

async function main() {
  const runId = generateRunId();
  const snapshotDir = join(
    process.cwd(),
    'scripts/migration/design-orders/artifacts/snapshots',
    runId,
  );
  await mkdir(snapshotDir, { recursive: true });

  const rawCred = await readFile(credentialPath, 'utf8');
  const credential = JSON.parse(rawCred) as { project_id?: string };
  // Never log private_key
  console.log(JSON.stringify({ step: 'credential_check', project_id: credential.project_id }));

  if (credential.project_id !== EXPECTED_PROJECT_ID) {
    throw new Error(
      `Firebase project mismatch: expected "${EXPECTED_PROJECT_ID}", got "${credential.project_id}"`,
    );
  }

  const appName = `design-snapshot-${runId}`;
  const app = getApps().find((a) => a.name === appName)
    ?? initializeApp({ credential: cert(credential as Parameters<typeof cert>[0]), databaseURL: FIREBASE_DATABASE_URL }, appName);

  try {
    console.log(`[${runId}] Đọc ${FIREBASE_DATABASE_URL}/${FIREBASE_NODE} ...`);
    const snap = await getDatabase(app).ref(FIREBASE_NODE).once('value');
    const raw = (snap.val() as Record<string, unknown> | null) ?? {};
    const totalRecords = Object.keys(raw).length;
    console.log(`[${runId}] Đọc xong: ${totalRecords} đơn`);

    const canonicalStr = canonicalize(raw);
    const checksum = sha256hex(canonicalStr);

    const meta = {
      runId,
      capturedAt: new Date().toISOString(),
      firebaseProject: EXPECTED_PROJECT_ID,
      firebaseNode: FIREBASE_NODE,
      totalRecords,
      checksumSha256: checksum,
    };

    await writeFile(join(snapshotDir, 'orders.raw.json'), JSON.stringify(raw, null, 2), 'utf8');
    await writeFile(join(snapshotDir, 'snapshot.canonical.json'), canonicalStr, 'utf8');
    await writeFile(join(snapshotDir, 'snapshot.sha256.txt'), checksum, 'utf8');
    await writeFile(join(snapshotDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');

    console.log(JSON.stringify({ result: 'success', ...meta }, null, 2));
    console.log(`\nSnapshot saved: ${snapshotDir}`);
    console.log(`\n=> Dùng cho Phase 7: --snapshot-dir="${snapshotDir}"`);
  } finally {
    await deleteApp(app);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
