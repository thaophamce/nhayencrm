import { describe, expect, it } from 'vitest';
import { buildOrderGroupName, getOrderStatusGroupLabel } from '../../src/modules/orders/order-status.js';

describe('order group name', () => {
  it('appends default demo status', () => {
    expect(buildOrderGroupName('D260713', 'demo')).toBe('D260713 ch\u01b0a demo');
  });

  it('trims order code', () => {
    expect(buildOrderGroupName('  D260713  ', 'demo')).toBe('D260713 ch\u01b0a demo');
  });

  it('keeps unknown status visible', () => {
    expect(getOrderStatusGroupLabel('waiting')).toBe('waiting');
  });
});