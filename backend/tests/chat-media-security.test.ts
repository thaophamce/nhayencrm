import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.APP_URL = 'https://crm.example.com';
process.env.LOCAL_PUBLIC_URL = 'https://media.example.com/files';
process.env.S3_PUBLIC_URL = 'https://cdn.example.com';
process.env.MEDIA_REMOTE_HOST_ALLOWLIST = '*.pancake.example';

const { assertUserProvidedMediaUrlAllowed, fetchRemoteMediaBuffer } = await import('../src/modules/chat/chat-media-helpers.js');

describe('assertUserProvidedMediaUrlAllowed', () => {
  it('allows configured storage hosts', () => {
    expect(() => assertUserProvidedMediaUrlAllowed('https://cdn.example.com/media/a.webp')).not.toThrow();
  });

  it('allows explicit wildcard hosts only as subdomains', () => {
    expect(() => assertUserProvidedMediaUrlAllowed('https://img.pancake.example/a.jpg')).not.toThrow();
    expect(() => assertUserProvidedMediaUrlAllowed('https://pancake.example/a.jpg')).toThrow();
  });

  it('blocks arbitrary hosts and URL credentials', () => {
    expect(() => assertUserProvidedMediaUrlAllowed('https://evil.example/a.jpg')).toThrow(/not allowed/);
    expect(() => assertUserProvidedMediaUrlAllowed('https://user:pass@cdn.example.com/a.jpg')).toThrow(/credentials/);
  });
});


describe('fetchRemoteMediaBuffer', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('blocks direct private-network targets before fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchRemoteMediaBuffer('http://127.0.0.1/secret')).rejects.toThrow(/private network/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('revalidates redirects and blocks metadata/private targets', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: 'http://169.254.169.254/latest/meta-data' },
    })));
    await expect(fetchRemoteMediaBuffer('http://93.184.216.34/start')).rejects.toThrow(/private network/);
  });

  it('rejects responses larger than configured byte cap', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array(11), {
      status: 200,
      headers: { 'content-length': '11' },
    })));
    await expect(fetchRemoteMediaBuffer('http://93.184.216.34/file', { maxBytes: 10 })).rejects.toThrow(/exceeds 10 bytes/);
  });

  it('validates image bytes instead of trusting Content-Type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not-an-image', {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    })));
    await expect(fetchRemoteMediaBuffer('http://93.184.216.34/fake.jpg', { requireImage: true }))
      .rejects.toThrow(/not a supported image/);
  });
});
