import { describe, expect, it } from 'vitest';
import {
  applyListenerClosureStatus,
  isNormalListenerClosure,
  resolveZaloStatus,
} from '../../src/modules/zalo/zalo-status.js';

describe('resolveZaloStatus', () => {
  it('ưu tiên pool connected khi DB còn kẹt qr_pending', () => {
    expect(resolveZaloStatus('qr_pending', 'connected')).toBe('connected');
  });

  it('giữ trạng thái DB khi nick chưa có instance trong pool', () => {
    expect(resolveZaloStatus('qr_pending')).toBe('qr_pending');
  });

  it('ưu tiên trạng thái mất kết nối realtime thay vì DB connected cũ', () => {
    expect(resolveZaloStatus('connected', 'disconnected')).toBe('disconnected');
  });
});

describe('isNormalListenerClosure', () => {
  it('phân loại code 1000 là đóng bình thường', () => {
    expect(isNormalListenerClosure(1000, 'NORMAL_CLOSURE')).toBe(true);
  });

  it('không che lỗi đóng bất thường', () => {
    expect(isNormalListenerClosure(1006, 'ABNORMAL_CLOSURE')).toBe(false);
  });
});

describe('applyListenerClosureStatus', () => {
  it('giữ API usable khi zca-js xoay listener bằng NORMAL_CLOSURE', () => {
    const instance = { status: 'connected' };
    expect(applyListenerClosureStatus(instance, 1000, 'NORMAL_CLOSURE')).toBe(false);
    expect(instance.status).toBe('connected');
  });

  it('hạ trạng thái khi listener đóng bất thường', () => {
    const instance = { status: 'connected' };
    expect(applyListenerClosureStatus(instance, 1006, 'ABNORMAL_CLOSURE')).toBe(true);
    expect(instance.status).toBe('disconnected');
  });
});
