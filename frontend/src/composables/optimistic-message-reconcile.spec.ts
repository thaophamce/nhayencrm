import { describe, expect, it } from 'vitest';
import { reconcileOptimisticMessage, upsertRealtimeMessage } from './optimistic-message-reconcile';

type Message = { id: string; echoId?: string; isLocal?: boolean; content: string };

describe('optimistic message reconcile ordering', () => {
  const echoId = 'echo-1';
  const placeholder: Message = { id: 'local-echo-1', echoId, isLocal: true, content: 'hello' };
  const real: Message = { id: 'real-1', echoId, isLocal: false, content: 'hello' };

  it('replaces placeholder when HTTP arrives first', () => {
    expect(reconcileOptimisticMessage([placeholder], echoId, real)).toEqual([real]);
  });

  it('keeps real message when socket already reconciled first', () => {
    expect(reconcileOptimisticMessage([real], echoId, real)).toEqual([real]);
  });

  it('removes only placeholder when real and placeholder both exist', () => {
    expect(reconcileOptimisticMessage([placeholder, real], echoId, real)).toEqual([real]);
  });
});

describe('realtime message upsert', () => {
  it('replaces a pending media row when the backend confirms the same id', () => {
    const pending: Message = { id: 'media-1', content: 'pending' };
    const confirmed: Message = { id: 'media-1', content: 'confirmed' };
    expect(upsertRealtimeMessage([pending], confirmed)).toEqual([confirmed]);
  });

  it('appends a new socket message', () => {
    const existing: Message = { id: 'old-1', content: 'old' };
    const incoming: Message = { id: 'new-1', content: 'new' };
    expect(upsertRealtimeMessage([existing], incoming)).toEqual([existing, incoming]);
  });
});
