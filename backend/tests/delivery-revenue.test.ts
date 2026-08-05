import { describe, expect, it } from 'vitest';
import { isInvitationProduct } from '../src/modules/delivery/delivery-service.js';

describe('delivery revenue product classification', () => {
  it.each(['invitation', 'thiep', 'thiệp', 'Thiệp cưới'])('counts %s as invitation revenue', (value) => {
    expect(isInvitationProduct(value)).toBe(true);
  });

  it.each(['ao', 'anh', 'Áo', 'Ảnh', 'ao+anh'])('excludes %s from invitation revenue', (value) => {
    expect(isInvitationProduct(value)).toBe(false);
  });
});
