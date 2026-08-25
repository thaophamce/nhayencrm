import { describe, expect, it } from 'vitest';
import { resolveZaloLiveStatus } from './zalo-live-status';

describe('resolveZaloLiveStatus', () => {
  it('replaces a stale disconnected conversation status with the live pool status', () => {
    expect(resolveZaloLiveStatus('nick-1', 'disconnected', [
      { id: 'nick-1', status: 'disconnected', liveStatus: 'connected' },
    ])).toBe('connected');
  });

  it('falls back to the conversation status before accounts have loaded', () => {
    expect(resolveZaloLiveStatus('nick-1', 'disconnected', [])).toBe('disconnected');
  });

  it('uses account status when the API has already normalized it to live status', () => {
    expect(resolveZaloLiveStatus('nick-1', 'disconnected', [
      { id: 'nick-1', status: 'connected' },
    ])).toBe('connected');
  });
});
