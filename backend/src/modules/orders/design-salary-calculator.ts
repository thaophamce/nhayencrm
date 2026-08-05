// SPDX-License-Identifier: AGPL-3.0-or-later

export interface ImportedDesignOrderSalaryInput {
  designerId: string | null;
  fileCount: number;
  fileCountHistory: unknown;
  timestamps: unknown;
  status: string;
  hasDesignFee: boolean;
  designFeeTickedAt: Date | string | null;
}

export interface ImportedMonthlySalaryStats {
  orderCount: number;
  totalFiles: number;
  approvedCount: number;
  designFeeCount: number;
}

interface FileCountEntry { count: number; changedAt: string }

function monthOf(value: unknown): string | null {
  if (!(typeof value === 'string' || value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 7);
}

function timestampsOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function fileCountEntries(order: ImportedDesignOrderSalaryInput): FileCountEntry[] {
  if (Array.isArray(order.fileCountHistory) && order.fileCountHistory.length > 0) {
    return order.fileCountHistory.flatMap((raw) => {
      if (!raw || typeof raw !== 'object') return [];
      const entry = raw as Record<string, unknown>;
      const count = Number(entry.count);
      const changedAt = typeof entry.changedAt === 'string' ? entry.changedAt : '';
      return Number.isFinite(count) && monthOf(changedAt)
        ? [{ count, changedAt }]
        : [];
    }).sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());
  }

  const designing = timestampsOf(order.timestamps).designing;
  return typeof designing === 'string' && monthOf(designing)
    ? [{ count: order.fileCount, changedAt: designing }]
    : [];
}

/** Mirrors TRACKER/src/utils/salary.js getMonthlyFileDeltas exactly. */
export function fileDeltaForMonth(order: ImportedDesignOrderSalaryInput, targetMonth: string): number {
  // TRACKER excludes file salary until the order has entered "designing",
  // even if a legacy/incomplete row already contains file-count history.
  if (!monthOf(timestampsOf(order.timestamps).designing)) return 0;

  const lastCountByMonth = new Map<string, number>();
  for (const entry of fileCountEntries(order)) {
    const month = monthOf(entry.changedAt);
    if (month) lastCountByMonth.set(month, entry.count);
  }

  let previousCount = 0;
  for (const month of [...lastCountByMonth.keys()].sort()) {
    const count = lastCountByMonth.get(month)!;
    const delta = Math.max(0, count - previousCount);
    if (month === targetMonth) return delta;
    previousCount = count;
  }
  return 0;
}

export function calculateImportedMonthlySalaryStats(
  orders: ImportedDesignOrderSalaryInput[],
  targetMonth: string,
): Map<string, ImportedMonthlySalaryStats> {
  const result = new Map<string, ImportedMonthlySalaryStats>();

  for (const order of orders) {
    if (!order.designerId) continue;
    const stats = result.get(order.designerId) ?? {
      orderCount: 0, totalFiles: 0, approvedCount: 0, designFeeCount: 0,
    };
    const timestamps = timestampsOf(order.timestamps);
    const fileDelta = fileDeltaForMonth(order, targetMonth);
    const approved = order.status === 'approved' && monthOf(timestamps.approved) === targetMonth;
    const feeMonth = monthOf(order.designFeeTickedAt) ?? monthOf(timestamps.designing);
    const designFee = order.hasDesignFee && feeMonth === targetMonth;

    if (fileDelta > 0) {
      stats.totalFiles += fileDelta;
      stats.orderCount += 1;
    }
    if (approved) {
      stats.approvedCount += 1;
      stats.orderCount += 1;
    }
    if (designFee) stats.designFeeCount += 1;
    result.set(order.designerId, stats);
  }

  return result;
}
