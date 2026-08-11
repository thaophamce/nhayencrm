// @vitest-environment jsdom
import { defineComponent } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());

vi.mock('@/api/index', () => ({ api: { get: apiGet } }));
vi.mock('@/composables/use-org-timezone', () => ({
  getOrgParts: () => ({ year: 2026, month: 8, day: 11, hour: 10, minute: 0, second: 0, dayOfWeek: 2 }),
}));
vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  ArcElement: {}, Tooltip: {}, Legend: {}, CategoryScale: {}, LinearScale: {},
  PointElement: {}, LineElement: {}, Filler: {},
}));
vi.mock('vue-chartjs', () => ({
  Line: defineComponent({ template: '<div data-chart="line" />' }),
  Doughnut: defineComponent({ template: '<div data-chart="doughnut" />' }),
}));
vi.mock('@/components/orders/OrderAlertPanel.vue', () => ({
  default: defineComponent({
    setup(_props, { expose }) {
      expose({ refresh: vi.fn() });
      return {};
    },
    template: '<aside data-alert-panel />',
  }),
}));

import OrdersOverviewTab from './OrdersOverviewTab.vue';

describe('OrdersOverviewTab monthly statistics', () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  it('renders KPI values from the selected month instead of all-time totals', async () => {
    apiGet.mockResolvedValue({
      data: {
        total: 468,
        byStatus: { demo: 6, designing: 147, approved: 290, cancelled: 25 },
        monthlyTotal: 41,
        monthlyByStatus: { demo: 4, designing: 20, approved: 16, cancelled: 1 },
        daily: [3, 0, 10],
        dailyLabels: ['1', '2', '3'],
      },
    });

    const wrapper = mount(OrdersOverviewTab, {
      global: {
        stubs: {
          'v-icon': true,
          'v-progress-circular': true,
        },
      },
    });
    await flushPromises();

    expect(apiGet).toHaveBeenCalledWith('/orders/stats', { params: { month: '2026-08' } });
    expect(wrapper.findAll('.kpi-number').map(node => node.text())).toEqual(['41', '4', '20', '16', '1']);
    wrapper.unmount();
  });
});
