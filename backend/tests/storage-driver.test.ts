import { describe, expect, it } from 'vitest';
import { mimeToExt } from '../src/shared/storage/types.js';

describe('storage extension selection contract', () => {
  it('prefers MIME extension for transformed image bytes', () => {
    expect(mimeToExt('image/webp')).toBe('.webp');
    expect(mimeToExt('image/jpeg')).toBe('.jpg');
  });

  it('leaves unknown MIME for driver original-name fallback', () => {
    expect(mimeToExt('application/pdf')).toBe('');
  });
});
