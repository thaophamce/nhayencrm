/**
 * Salary Golden Reference — gọi trực tiếp TRACKER/src/utils/salary.js.
 * KHÔNG re-implement công thức lương. Source of truth duy nhất là salary.js.
 *
 * Env: TRACKER_PATH — đường dẫn đến thư mục gốc TRACKER (không cần trailing slash)
 * Default: ../../../../../../TRACKER tính từ thư mục backend/
 */
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { FirebaseOrder } from './firebase-types.js';

export interface MonthlySalaryResult {
  fileSalary: number;
  approvedBonus: number;
  designFee: number;
  outsourceKpi: number;
  outsourceApprovedBonus: number;
  total: number;
}

let _salaryModule: Record<string, (...args: unknown[]) => unknown> | null = null;

async function loadSalaryModule() {
  if (_salaryModule) return _salaryModule;
  const trackerPath = process.env.TRACKER_PATH
    ?? resolve(process.cwd(), '../TRACKER');
  const salaryPath = join(trackerPath, 'src/utils/salary.js');
  // Dynamic import — salary.js uses ES module syntax
  const imported = await import(pathToFileURL(salaryPath).href) as any;
  _salaryModule = (imported.default ?? imported) as Record<string, (...args: unknown[]) => unknown>;
  return _salaryModule;
}

/**
 * Tính lương cho một designer trong một tháng từ danh sách đơn.
 * @param designerId  Firebase username (e.g. 'hoangvy')
 * @param month       'YYYY-MM' format
 * @param orders      Tất cả đơn của org (Firebase format)
 */
export async function calculateSalaryForMonth(
  designerId: string,
  month: string,
  orders: FirebaseOrder[],
): Promise<MonthlySalaryResult> {
  const mod = await loadSalaryModule();
  const fn = mod['calculateSalaryForMonth'] as (
    orders: unknown[],
    month: string,
    designerId?: string,
  ) => unknown;
  if (typeof fn !== 'function') {
    throw new Error('salary.js: calculateSalaryForMonth không phải function — kiểm tra TRACKER_PATH');
  }
  const designerOrders = orders.filter(order => order.designerId === designerId);
  return fn(designerOrders, month, designerId) as MonthlySalaryResult;
}

export async function validateGoldenRef(): Promise<void> {
  const mod = await loadSalaryModule();
  const required = ['calculateSalaryForMonth', 'getFileCountHistory'];
  for (const fn of required) {
    if (typeof mod[fn] !== 'function') {
      throw new Error(`salary.js thiếu export: ${fn}`);
    }
  }
  console.log('[golden-ref] salary.js loaded OK, exports verified.');
}
