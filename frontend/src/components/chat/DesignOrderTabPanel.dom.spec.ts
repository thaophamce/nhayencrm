// @vitest-environment jsdom
import { defineComponent, nextTick } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());

vi.mock('@/api/index', () => ({ api: { get: apiGet, patch: vi.fn() } }));
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: null, canAccess: () => false }),
}));
vi.mock('@/components/orders/CreateOrderModal.vue', () => ({
  default: defineComponent({ template: '<div />' }),
}));
vi.mock('@/components/orders/EditOrderModal.vue', () => ({
  default: defineComponent({ template: '<div />' }),
}));

import DesignOrderTabPanel from './DesignOrderTabPanel.vue';

const TextFieldStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
});

function mountPanel(conversationName: string | null) {
  return mount(DesignOrderTabPanel, {
    props: { conversationId: 'conversation-1', conversationName },
    global: {
      stubs: {
        'v-text-field': TextFieldStub,
        'v-icon': true,
        'v-menu': true,
        'v-list': true,
        'v-list-item': true,
      },
    },
  });
}

function orderResponse(orderCode: string) {
  return {
    data: {
      orders: [{ id: orderCode, orderCode, status: 'designing', deadline: null, fileCount: 0, designer: null }],
    },
  };
}

describe('DesignOrderTabPanel conversation search', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiGet.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fills and searches the leading order code when the tab opens', async () => {
    apiGet.mockResolvedValue(orderResponse('D040822'));
    const wrapper = mountPanel('D040822 ĐANG TK 08/11');
    await flushPromises();

    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('D040822');
    expect(apiGet).toHaveBeenCalledWith('/orders', {
      params: expect.objectContaining({ search: 'D040822' }),
    });
    expect(wrapper.text()).toContain('D040822');
    wrapper.unmount();
  });

  it('updates and searches again when the selected conversation changes', async () => {
    apiGet.mockResolvedValue({ data: { orders: [] } });
    const wrapper = mountPanel('D040822 ĐANG TK');
    await flushPromises();

    await wrapper.setProps({ conversationName: 'd180709 - đang giao' });
    await nextTick();
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('D180709');

    await vi.advanceTimersByTimeAsync(350);
    await flushPromises();
    expect(apiGet).toHaveBeenLastCalledWith('/orders', {
      params: expect.objectContaining({ search: 'D180709' }),
    });
    wrapper.unmount();
  });

  it('clears the query for a conversation without a leading order code', async () => {
    apiGet.mockResolvedValue({ data: { orders: [] } });
    const wrapper = mountPanel('D040822 ĐANG TK');
    await flushPromises();

    await wrapper.setProps({ conversationName: 'Khách chưa có mã' });
    await vi.advanceTimersByTimeAsync(350);
    await flushPromises();

    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('');
    expect(apiGet).toHaveBeenLastCalledWith('/orders', {
      params: expect.objectContaining({ search: undefined }),
    });
    wrapper.unmount();
  });

  it('ignores an older response that finishes after the new conversation search', async () => {
    let resolveOld!: (value: ReturnType<typeof orderResponse>) => void;
    let resolveNew!: (value: ReturnType<typeof orderResponse>) => void;
    apiGet
      .mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }))
      .mockReturnValueOnce(new Promise(resolve => { resolveNew = resolve; }));

    const wrapper = mountPanel('D040822 ĐANG TK');
    await wrapper.setProps({ conversationName: 'D180709 - đang giao' });
    await vi.advanceTimersByTimeAsync(350);

    resolveNew(orderResponse('D180709'));
    await flushPromises();
    expect(wrapper.text()).toContain('D180709');

    resolveOld(orderResponse('D040822'));
    await flushPromises();
    expect(wrapper.text()).toContain('D180709');
    expect(wrapper.text()).not.toContain('D040822');
    wrapper.unmount();
  });

  it('debounces rapid conversation changes and searches only the latest code', async () => {
    apiGet.mockResolvedValue({ data: { orders: [] } });
    const wrapper = mountPanel('D040822 ĐANG TK');
    await flushPromises();

    await wrapper.setProps({ conversationName: 'D180709 đang giao' });
    await vi.advanceTimersByTimeAsync(200);
    await wrapper.setProps({ conversationName: 'D050848 chốt in' });
    await vi.advanceTimersByTimeAsync(349);
    expect(apiGet).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();
    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(apiGet).toHaveBeenLastCalledWith('/orders', {
      params: expect.objectContaining({ search: 'D050848' }),
    });
    wrapper.unmount();
  });

  it('keeps the latest results and loading state when a stale request rejects', async () => {
    let rejectOld!: (reason?: unknown) => void;
    apiGet
      .mockReturnValueOnce(new Promise((_resolve, reject) => { rejectOld = reject; }))
      .mockResolvedValueOnce(orderResponse('D180709'));

    const wrapper = mountPanel('D040822 ĐANG TK');
    await wrapper.setProps({ conversationName: 'D180709 đang giao' });
    await vi.advanceTimersByTimeAsync(350);
    await flushPromises();
    expect(wrapper.text()).toContain('D180709');

    rejectOld(new Error('stale request failed'));
    await flushPromises();
    expect(wrapper.text()).toContain('D180709');
    expect(wrapper.find('.dop-skeletons').exists()).toBe(false);
    wrapper.unmount();
  });

  it('cancels a pending debounced search when the panel unmounts', async () => {
    apiGet.mockResolvedValue({ data: { orders: [] } });
    const wrapper = mountPanel('D040822 ĐANG TK');
    await flushPromises();

    await wrapper.setProps({ conversationName: 'D180709 đang giao' });
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(350);

    expect(apiGet).toHaveBeenCalledTimes(1);
  });
});
