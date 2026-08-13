import { describe, expect, it } from 'vitest';
import { safeCssHexColor } from './safe-css-color';

describe('safeCssHexColor', () => {
  it.each(['#abc', '#ABC', '#123456', '  #a1B2c3  '])('accepts safe hex color %s', (value) => {
    expect(safeCssHexColor(value)).toBe(value.trim());
  });

  it.each([null, undefined, '', 'red', '#abcd', '#12345678', 'url(https://example.test)', '" onmouseover="x'])
    ('replaces unsafe color %s', (value) => {
      expect(safeCssHexColor(value)).toBe('#90A4AE');
    });
});
