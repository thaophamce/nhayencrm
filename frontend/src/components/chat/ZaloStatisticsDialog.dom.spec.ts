// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ZaloStatisticsDialog from './ZaloStatisticsDialog.vue';

const { apiGetMock } = vi.hoisted(() => ({ apiGetMock: vi.fn() }));
vi.mock('@/api/index', () => ({ api: { get: apiGetMock } }));

describe('ZaloStatisticsDialog metrics', () => {
  beforeEach(() => {
    apiGetMock.mockReset().mockResolvedValue({
      data: {
        scope: 'all',
        connectedCount: 1,
        accounts: [{ id: 'nick-1', displayName: 'Nick 1', status: 'connected' }],
        totals: {
          sent: 3,
          received: 5,
          total: 8,
          friendRequests: 7,
          unread: 4,
          uniqueInboundCustomers: 2,
        },
        conversationsByHour: Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 })),
      },
    });
  });

  it('replaces average response time with the number of customers who sent messages', async () => {
    const wrapper = mount(ZaloStatisticsDialog, {
      props: { modelValue: false, accountIds: ['nick-1'] },
      global: {
        stubs: {
          VDialog: { template: '<div><slot /></div>' },
          VIcon: true,
          VAvatar: true,
          VImg: true,
        },
      },
    });

    await wrapper.setProps({ modelValue: true });
    await flushPromises();

    expect(wrapper.text()).toContain('Số lượng khách nhắn tin');
    expect(wrapper.text()).not.toContain('Thời gian phản hồi trung bình');
    const cards = wrapper.findAll('.metrics-grid article');
    expect(cards[3].find('h3').text()).toBe('Lời mời kết bạn');
    expect(cards[3].find('strong').text()).toBe('7');
    expect(cards[5].find('strong').text()).toBe('2');
    expect(apiGetMock).toHaveBeenCalledWith('/chat/statistics', {
      params: expect.objectContaining({
        accountIds: 'nick-1',
        from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      }),
    });
  });
});
