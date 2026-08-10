import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAliasListMock = vi.fn();
const loggerMock = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: {} }));
vi.mock('../src/shared/utils/logger.js', () => ({ logger: loggerMock }));
vi.mock('../src/modules/zalo/zalo-pool.js', () => ({
  zaloPool: {
    getApi: vi.fn(() => ({ getAliasList: getAliasListMock })),
  },
}));
vi.mock('../src/modules/activity/activity-logger.js', () => ({ logActivity: vi.fn() }));

const { pullAliasMap } = await import('../src/modules/zalo/alias-sync.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('alias sync transient network retry', () => {
  it('recovers within the same sync cycle after a transient fetch failure', async () => {
    getAliasListMock
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce({ items: [{ userId: 'uid-1', alias: 'Khách VIP' }] });

    const aliases = await pullAliasMap('account-1');

    expect(getAliasListMock).toHaveBeenCalledTimes(2);
    expect(aliases.get('uid-1')).toBe('Khách VIP');
    expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('transient failure'));
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it('does not retry a non-network SDK error', async () => {
    getAliasListMock.mockRejectedValueOnce(new Error('permission denied'));

    const aliases = await pullAliasMap('account-1');

    expect(getAliasListMock).toHaveBeenCalledTimes(1);
    expect(aliases.size).toBe(0);
    expect(loggerMock.warn).toHaveBeenCalledOnce();
  });
});
