import { describe, expect, it } from 'vitest';
import {
  decodePancakePageId,
  inferPancakeContent,
  isPancakeSelfMessage,
  pancakeMessageKey,
  parsePancakeDate,
  parsePancakeConversationId,
} from '../../scripts/pancake-history-import-lib.js';

describe('Pancake Zalo history import mapping', () => {
  const pageId = 'pzl_1784457661676424639';

  it('parses user and group conversation ids', () => {
    expect(parsePancakeConversationId('pzl_u_1784457661676424639_123', pageId))
      .toEqual({ threadType: 'user', externalThreadId: '123' });
    expect(parsePancakeConversationId('pzl_g_1784457661676424639_456', pageId))
      .toEqual({ threadType: 'group', externalThreadId: '456' });
  });

  it('maps attachment types into the CRM renderer shape', () => {
    expect(inferPancakeContent({
      id: 'm1',
      inserted_at: '2026-01-01T00:00:00Z',
      attachments: [{ type: 'image', url: 'https://cdn.test/photo.jpg' }],
    })).toMatchObject({ contentType: 'image', content: 'https://cdn.test/photo.jpg' });

    const file = inferPancakeContent({
      id: 'm2',
      inserted_at: '2026-01-01T00:00:00Z',
      attachments: [{ type: 'file', url: 'https://cdn.test/a.pdf', title: 'a.pdf', mime_type: 'application/pdf' }],
    });
    expect(file.contentType).toBe('file');
    expect(JSON.parse(file.content)).toMatchObject({ href: 'https://cdn.test/a.pdf', name: 'a.pdf' });
  });

  it('detects self messages and creates a namespaced idempotency key', () => {
    expect(isPancakeSelfMessage({ id: 'm', inserted_at: '', from: { id: pageId } }, pageId)).toBe(true);
    expect(isPancakeSelfMessage({ id: 'm', inserted_at: '', from: { id: 'pzl_u_123' } }, pageId)).toBe(false);
    expect(pancakeMessageKey('abc')).toBe('pancake:abc');
  });

  it('decodes the page id without exposing the token elsewhere', () => {
    const token = [
      Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
      Buffer.from(JSON.stringify({ id: pageId })).toString('base64url'),
      'signature',
    ].join('.');
    expect(decodePancakePageId(token)).toBe(pageId);
  });

  it('treats timezone-less Pancake timestamps as UTC', () => {
    expect(parsePancakeDate('2026-07-29T08:19:03.222000').toISOString())
      .toBe('2026-07-29T08:19:03.222Z');
  });
});
