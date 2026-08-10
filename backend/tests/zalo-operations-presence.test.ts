import { afterEach, describe, expect, it, vi } from 'vitest';

const getFriendOnlinesMock = vi.fn();
const loggerMock = {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
};

vi.mock('../src/modules/zalo/zalo-pool.js', () => ({
  zaloPool: {
    getInstance: vi.fn(() => ({
      status: 'connected',
      api: { getFriendOnlines: getFriendOnlinesMock },
    })),
  },
}));
vi.mock('../src/modules/zalo/zalo-rate-limiter.js', () => ({
  zaloRateLimiter: {
    checkLimits: vi.fn().mockResolvedValue({ allowed: true }),
    recordSend: vi.fn().mockResolvedValue(undefined),
    recordOperation: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../src/shared/utils/logger.js', () => ({ logger: loggerMock }));
vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: { zaloAccount: { findUnique: vi.fn() } },
}));

const { zaloOps } = await import('../src/shared/zalo-operations.js');

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('zaloOps.getFriendOnlines 404 circuit breaker', () => {
  it('returns an empty presence list, suppresses error spam, and retries after one hour', async () => {
    const accountId = 'presence-404-account';
    const now = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    getFriendOnlinesMock.mockRejectedValueOnce(Object.assign(
      new Error('Request failed with status code 404'),
      { response: { status: 404 } },
    ));

    await expect(zaloOps.getFriendOnlines(accountId)).resolves.toEqual({ onlines: [] });
    await expect(zaloOps.getFriendOnlines(accountId)).resolves.toEqual({ onlines: [] });
    expect(getFriendOnlinesMock).toHaveBeenCalledOnce();
    expect(loggerMock.error).not.toHaveBeenCalled();

    vi.mocked(Date.now).mockReturnValue(now + 60 * 60_000 + 1);
    getFriendOnlinesMock.mockResolvedValueOnce({ onlines: [{ userId: 'u1' }] });
    await expect(zaloOps.getFriendOnlines(accountId)).resolves.toEqual({ onlines: [{ userId: 'u1' }] });
    expect(getFriendOnlinesMock).toHaveBeenCalledTimes(2);
  });
});
