/** Read-only parity check: TRACKER snapshot salary vs CRM imported-column calculation. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { calculateImportedMonthlySalaryStats } from '../../../../src/modules/orders/design-salary-calculator.js';

const TARGET_ORG_ID = '4189574a-f0f9-46a5-be49-e5119dcc7376';
const SOURCE_SYSTEM = 'donnhayen_firebase';
const MONTHS = ['2026-07', '2026-06', '2026-05'];
const ACTIVE_DESIGNERS = [
  'hoangvy', 'thienbinh', 'baoanh', 'anhminh', 'datthanh', 'tiendat',
  'hongthuy', 'huuthuan', 'hoanglam', 'anhtu', 'baosang', 'metuan',
  'minhkhang', 'nguyenrola', 'theanh', 'khanhlinh',
];

type SalaryResult = { totalSalary?: number; totalFiles?: number; approvedCount?: number; designFeeCount?: number };
type SalaryFn = (orders: unknown[], month: string, username?: string) => SalaryResult;
type DesignerMap = { mappings: Array<{ firebaseUsername: string; userId: string }> };

async function loadSalary(trackerPath: string): Promise<SalaryFn> {
  const imported = await import(pathToFileURL(join(trackerPath, 'src/utils/salary.js')).href) as any;
  const mod = imported.default ?? imported;
  if (typeof mod.calculateSalaryForMonth !== 'function') throw new Error('calculateSalaryForMonth not found');
  return mod.calculateSalaryForMonth;
}

async function main() {
  const trackerPath = process.env.TRACKER_PATH;
  const connStr = process.env.DATABASE_URL;
  if (!trackerPath || !connStr) throw new Error('TRACKER_PATH and DATABASE_URL are required');

  const calculateSalary = await loadSalary(trackerPath);
  const base = join(process.cwd(), 'scripts/migration/design-orders');
  const snapshot = JSON.parse(await readFile(join(base, 'artifacts/snapshots/20260804150204-4a806e65/orders.raw.json'), 'utf8')) as Record<string, any>;
  const designerMap = JSON.parse(await readFile(join(base, 'artifacts/designer-map.json'), 'utf8')) as DesignerMap;
  const userIdByUsername = new Map(designerMap.mappings.map(m => [m.firebaseUsername, m.userId]));

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: connStr }) });
  try {
    const dbOrders = await prisma.order.findMany({
      where: { orgId: TARGET_ORG_ID, sourceSystem: SOURCE_SYSTEM },
      select: { designerId: true, fileCount: true, fileCountHistory: true, timestamps: true, status: true, hasDesignFee: true, designFeeTickedAt: true },
    });
    const sourceOrders = Object.values(snapshot);
    let differences = 0;
    console.log('designer       month    source     crm       diff  files  approved  fees');

    for (const month of MONTHS) {
      const crmStats = calculateImportedMonthlySalaryStats(dbOrders, month);
      for (const username of ACTIVE_DESIGNERS) {
        const userId = userIdByUsername.get(username);
        if (!userId) throw new Error(`Missing designer mapping: ${username}`);
        // Firebase used the legacy alias "rola" before "nguyenrola". The importer
        // intentionally maps both to the same CRM user, so golden input must too.
        const sourceUsernames = username === 'nguyenrola' ? ['nguyenrola', 'rola'] : [username];
        const source = calculateSalary(sourceOrders.filter(o => sourceUsernames.includes(o.designerId)), month);
        const crm = crmStats.get(userId) ?? { orderCount: 0, totalFiles: 0, approvedCount: 0, designFeeCount: 0 };
        const crmTotal = crm.totalFiles * 20000 + crm.approvedCount * 10000 + crm.designFeeCount * 100000;
        const diff = (source.totalSalary ?? 0) - crmTotal;
        const fieldsMatch = source.totalFiles === crm.totalFiles && source.approvedCount === crm.approvedCount && source.designFeeCount === crm.designFeeCount;
        if (diff !== 0 || !fieldsMatch) differences += 1;
        console.log(`${username.padEnd(14)} ${month} ${String(source.totalSalary ?? 0).padStart(9)} ${String(crmTotal).padStart(9)} ${String(diff).padStart(9)} ${String(crm.totalFiles).padStart(6)} ${String(crm.approvedCount).padStart(9)} ${String(crm.designFeeCount).padStart(5)}`);
      }
    }
    console.log(`\nSALARY RECONCILIATION: ${differences === 0 ? 'PASS - 0 differences' : `FAIL - ${differences} differences`}`);
    if (differences !== 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
