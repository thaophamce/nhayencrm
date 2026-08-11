import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: null }),
}));

import { refreshOrgTimezone } from '@/composables/use-org-timezone';
import { getOrderStatsMonthValue, selectMonthlyOrderOverviewStats } from './order-stats-time';

describe('getOrderStatsMonthValue', () => {
  afterEach(() => refreshOrgTimezone('+07:00'));

  it('uses the configured organization timezone at a UTC month boundary', () => {
    const instant = new Date('2026-07-31T18:00:00.000Z');

    refreshOrgTimezone('+07:00');
    expect(getOrderStatsMonthValue(instant)).toBe('2026-08');

    refreshOrgTimezone('-05:00');
    expect(getOrderStatsMonthValue(instant)).toBe('2026-07');
  });

  it('selects month-scoped totals while retaining compatibility with older responses', () => {
    expect(selectMonthlyOrderOverviewStats({
      total: 468,
      byStatus: { demo: 6 },
      monthlyTotal: 41,
      monthlyByStatus: { demo: 4 },
    })).toMatchObject({ total: 41, byStatus: { demo: 4 } });

    expect(selectMonthlyOrderOverviewStats({
      total: 468,
      byStatus: { demo: 6 },
    })).toMatchObject({ total: 468, byStatus: { demo: 6 } });
  });
});
