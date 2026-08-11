import { describe, expect, it } from 'vitest';
import { shouldRedirectDesignerToOrders } from './access-guards';

describe('Designer route guard', () => {
  it('allows the forced password-change page to prevent a redirect loop', () => {
    expect(shouldRedirectDesignerToOrders('Designer', '/setup-password', true)).toBe(false);
  });

  it('keeps Designer accounts inside the orders portal after onboarding', () => {
    expect(shouldRedirectDesignerToOrders('Designer', '/settings', false)).toBe(true);
    expect(shouldRedirectDesignerToOrders('Designer', '/orders', false)).toBe(false);
  });
});
