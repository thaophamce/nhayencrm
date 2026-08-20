/**
 * Phase 3 — Designer Mapping
 * Map Firebase designerId (username) → ZaloCRM User.id (UUID).
 *
 * Chạy từ thư mục backend/:
 *   node --env-file=.env --import tsx scripts/migration/design-orders/src/03-build-designer-map.ts
 *
 * Env: DATABASE_URL
 * Output: scripts/migration/design-orders/artifacts/designer-map.json
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const TARGET_ORG_ID = '4189574a-f0f9-46a5-be49-e5119dcc7376';

// Source of truth: TRACKER/src/constants.js DESIGNERS list
const TRACKER_DESIGNERS: Array<{ username: string; name: string }> = [
  { username: 'quangtruong', name: 'Phạm Quang Trường' },
  { username: 'hoangvy',     name: 'Phạm Vũ Hoàng Vy' },
  { username: 'thienbinh',   name: 'Vũ Thiên Bình' },
  { username: 'baoanh',      name: 'Hoàng Đình Bảo Anh' },
  { username: 'anhminh',     name: 'Phạm Công Anh Minh' },
  { username: 'datthanh',    name: 'Dương Đạt Thành' },
  { username: 'tiendat',     name: 'Phạm Tiến Đạt' },
  { username: 'hongthuy',    name: 'Nguyễn Thị Hồng Thủy' },
  { username: 'huuthuan',    name: 'Trần Quốc Hữu Thuận' },
  { username: 'hoanglam',    name: 'Đào Hoàng Lâm' },
  { username: 'anhtu',       name: 'Trần Lê Anh Tú' },
  { username: 'baosang',     name: 'Trần Hồ Bảo Sang' },
  { username: 'metuan',      name: 'Mè Tuấn' },
  { username: 'minhkhang',   name: 'Dương Minh Khang' },
  { username: 'nguyenrola',  name: 'Nguyễn Rola' },
  { username: 'theanh',      name: 'Trần Thế Anh' },
  { username: 'khanhlinh',   name: 'Bùi Khánh Linh' },
];

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Thiếu DATABASE_URL');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const users = await prisma.user.findMany({
    where: { orgId: TARGET_ORG_ID },
    select: { id: true, email: true, fullName: true, isActive: true },
  });

  // Match TRACKER username against email prefix (e.g. "hoangvy" matches "hoangvy@company.com")
  const byEmailPrefix = new Map(
    users
      .filter((u) => u.email)
      .map((u) => [u.email!.split('@')[0].toLowerCase(), u]),
  );

  const mappings = TRACKER_DESIGNERS.map(({ username, name }) => {
    const matched = byEmailPrefix.get(username.toLowerCase());
    const status = !matched
      ? 'unmatched'
      : matched.isActive
        ? 'active_matched'
        : 'inactive_historical_matched';

    return {
      firebaseUsername: username,
      trackerName: name,
      userId: matched?.id ?? null,
      crmFullName: matched?.fullName ?? null,
      isActive: matched?.isActive ?? null,
      status,
    };
  });

  const unmatched = mappings.filter((m) => m.status === 'unmatched');
  if (unmatched.length > 0) {
    console.warn(`WARN: ${unmatched.length} designer(s) không tìm thấy trong ZaloCRM:`);
    unmatched.forEach((m) => console.warn(`  - ${m.firebaseUsername} (${m.trackerName})`));
  }

  const output = {
    generatedAt: new Date().toISOString(),
    orgId: TARGET_ORG_ID,
    totalDesigners: mappings.length,
    activeMatched: mappings.filter((m) => m.status === 'active_matched').length,
    inactiveMatched: mappings.filter((m) => m.status === 'inactive_historical_matched').length,
    unmatchedCount: unmatched.length,
    mappings,
  };

  const artifactsDir = join(process.cwd(), 'scripts/migration/design-orders/artifacts');
  await mkdir(artifactsDir, { recursive: true });
  const outPath = join(artifactsDir, 'designer-map.json');
  await writeFile(outPath, JSON.stringify(output, null, 2), 'utf8');

  console.log(JSON.stringify({ result: 'success', ...output, mappings: undefined }, null, 2));
  console.log(`\nDesigner map saved: ${outPath}`);

  if (unmatched.length > 0) {
    console.error('\nSTOP GATE 3 FAIL: Còn designer unmatched. Kiểm tra login trong ZaloCRM trước khi chạy Phase 7.');
    process.exitCode = 1;
  } else {
    console.log('\nSTOP GATE 3: PASS');
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
