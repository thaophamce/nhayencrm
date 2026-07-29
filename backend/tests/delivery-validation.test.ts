// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { amount, cleanText, isAllowed, PAYMENT_STATUSES } from '../src/modules/delivery/delivery-validation.js';
describe('delivery validation',()=>{it('rejects negative/invalid amount',()=>{expect(amount(-1)).toBe(-1);expect(amount('x')).toBe(-1)});it('accepts payment status whitelist',()=>{expect(isAllowed('paid',PAYMENT_STATUSES)).toBe(true);expect(isAllowed('admin',PAYMENT_STATUSES)).toBe(false)});it('trims and caps text',()=>{expect(cleanText('  ABC  ',3)).toBe('ABC')})});
