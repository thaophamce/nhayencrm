// @vitest-environment jsdom
import { defineComponent, nextTick } from 'vue';
import { mount, shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
const localStorageMock = {
  getItem: vi.fn((_key: string) => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(),
  length: 0,
};

vi.mock('@/api/index', () => ({ api: apiMock }));
vi.mock('@/api/socket', () => ({ createAppSocket: vi.fn() }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import NotificationBell from './NotificationBell.vue';
import { useZaloAccounts } from '@/composables/use-zalo-accounts';

describe('authenticated background fetches', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    });
    localStorageMock.getItem.mockReturnValue(null);
    apiMock.get.mockReset();
  });

  it('does not request notifications or Zalo accounts on a public page', async () => {
    const bell = shallowMount(NotificationBell);
    const AccountHarness = defineComponent({
      setup() {
        return useZaloAccounts();
      },
      template: '<div />',
    });
    const accounts = mount(AccountHarness);

    await (accounts.vm as unknown as { fetchAccounts: () => Promise<void> }).fetchAccounts();
    await nextTick();

    expect(apiMock.get).not.toHaveBeenCalled();
    bell.unmount();
    accounts.unmount();
  });
});
