import { describe, expect, it } from 'vitest';
import { sanitizeCssHexColor } from '../../src/shared/utils/safe-css-color.js';

describe('sanitizeCssHexColor', () => {
  it.each(['#abc', '#ABC', '#123456', '  #a1B2c3  '])('accepts safe hex color %s', (value) => {
    expect(sanitizeCssHexColor(value)).toBe(value.trim());
  });

  it.each([null, undefined, '', 'red', '#abcd', '#12345678', 'url(https://example.test)', '" onmouseover="x'])
    ('replaces unsafe color %s', (value) => {
      expect(sanitizeCssHexColor(value)).toBe('#90A4AE');
    });

  it('supports a trusted context-specific fallback', () => {
    expect(sanitizeCssHexColor('not-a-color', '#1976D2')).toBe('#1976D2');
  });
});
