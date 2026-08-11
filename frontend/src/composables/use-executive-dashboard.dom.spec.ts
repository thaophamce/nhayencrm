// @vitest-environment jsdom
import { defineComponent } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/api', () => ({ api: { get: apiGet } }));

import { refreshOrgTimezone } from '@/composables/use-org-timezone';
import { useExecutiveDashboard } from './use-executive-dashboard';

describe('useExecutiveDashboard design month', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T18:00:00.000Z'));
    refreshOrgTimezone('+07:00');
    apiGet.mockReset();
    apiGet.mockImplementation(async (url: string) => {
      if (url === '/orders') return { data: { orders: [] } };
      if (url === '/attendance') return { data: { records: [] } };
      if (url === '/leave') return { data: { records: [] } };
      if (url === '/payroll') return { data: { rows: [] } };
      return { data: {} };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('requests order statistics for the organization-local month at a UTC boundary', async () => {
    const Harness = defineComponent({
      setup() {
        useExecutiveDashboard();
        return {};
      },
      template: '<div />',
    });

    const wrapper = mount(Harness);
    await flushPromises();

    expect(apiGet).toHaveBeenCalledWith('/orders/stats', { params: { month: '2026-08' } });
    wrapper.unmount();
  });
});
