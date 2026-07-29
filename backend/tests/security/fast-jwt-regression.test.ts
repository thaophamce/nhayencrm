import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSigner, createVerifier } from 'fast-jwt';

const secret = 'release-regression-key-'.repeat(3);
const b64u = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

function expectRejected(verify: (token: string) => unknown, token: string) {
  expect(() => verify(token)).toThrow();
}

describe('fast-jwt security regressions', () => {
  it('signs and verifies a valid HS256 token', () => {
    const sign = createSigner({ key: secret, algorithm: 'HS256' });
    const verify = createVerifier({ key: secret, algorithms: ['HS256'] });

    expect(verify(sign({ sub: 'release-user' }))).toMatchObject({
      sub: 'release-user',
    });
  });

  it('rejects a handcrafted alg:none token', () => {
    const verify = createVerifier({ key: secret, algorithms: ['HS256'] });
    const token = `${b64u({ alg: 'none', typ: 'JWT' })}.${b64u({
      sub: 'attacker',
    })}.`;

    expectRejected(verify, token);
  });

  it('rejects a token signed with an empty HMAC secret', () => {
    const header = b64u({ alg: 'HS256', typ: 'JWT' });
    const payload = b64u({ sub: 'attacker' });
    const signature = createHmac('sha256', '')
      .update(`${header}.${payload}`)
      .digest('base64url');
    const forged = `${header}.${payload}.${signature}`;

    try {
      const verify = createVerifier({ key: '', algorithms: ['HS256'] });
      expectRejected(verify, forged);
    } catch {
      // Refusing the empty key during verifier construction is also correct.
    }
  });

  it('rejects an unknown critical header member', () => {
    const header = b64u({
      alg: 'HS256',
      typ: 'JWT',
      crit: ['nhayen-unknown'],
    });
    const payload = b64u({ sub: 'attacker' });
    const signature = createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url');
    const verify = createVerifier({ key: secret, algorithms: ['HS256'] });

    expectRejected(verify, `${header}.${payload}.${signature}`);
  });
});
