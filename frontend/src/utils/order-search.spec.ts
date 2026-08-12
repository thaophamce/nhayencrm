import { describe, expect, it } from 'vitest';
import { normalizeOrderSearch } from './order-search';

describe('normalizeOrderSearch', () => {
  it.each([
    ['D080827', 'D080827'],
    ['d080827', 'd080827'],
    ['D080827 - Đang tk - 30/9', 'D080827'],
    ['  D080827 tên khách', 'D080827'],
  ])('extracts an order code from %j', (input, expected) => {
    expect(normalizeOrderSearch(input)).toBe(expected);
  });

  it('keeps ordinary search text unchanged', () => {
    expect(normalizeOrderSearch('Đào Hoàng Lâm')).toBe('Đào Hoàng Lâm');
  });

  it('omits an empty search', () => {
    expect(normalizeOrderSearch('   ')).toBeUndefined();
  });
});
