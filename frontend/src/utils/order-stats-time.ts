import { getOrgParts } from '@/composables/use-org-timezone';

export function getOrderStatsMonthValue(date = new Date()): string {
  const parts = getOrgParts(date);
  return parts
    ? `${parts.year}-${String(parts.month).padStart(2, '0')}`
    : date.toISOString().slice(0, 7);
}

export function selectMonthlyOrderOverviewStats(data: Record<string, any>): Record<string, any> {
  return {
    ...data,
    total: data.monthlyTotal ?? data.total,
    byStatus: data.monthlyByStatus ?? data.byStatus,
  };
}
