// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { extractPancakeOrder } from '../../src/modules/orders/pancake-order-service.js';

describe('extractPancakeOrder', () => {
  const order = { id: 1418, display_id: 42 };

  it.each([
    ['direct', order],
    ['order wrapper', { order }],
    ['data wrapper', { success: true, data: order }],
    ['nested data/order wrapper', { success: true, data: { order } }],
    ['result wrapper', { result: order }],
    ['nested result/order wrapper', { result: { order } }],
  ])('extracts %s response', (_name, response) => {
    expect(extractPancakeOrder(response)).toEqual(order);
  });

  it.each([
    null,
    [],
    {},
    { success: true },
    { data: [] },
    { data: { order: { id: null } } },
  ])('rejects response without order ID: %j', (response) => {
    expect(extractPancakeOrder(response)).toBeNull();
  });
});
