import { describe, expect, it } from 'vitest';
import { attendanceWindowState } from '../../src/modules/hr/attendance-controller.js';

describe('attendanceWindowState', () => {
  it('rejects check-in before the configured shift starts', () => {
    expect(attendanceWindowState(14 * 60 + 32, 19 * 60 + 30, 22 * 60)).toBe('before');
  });

  it('allows check-in at both boundaries and during the shift', () => {
    expect(attendanceWindowState(13 * 60 + 30, 13 * 60 + 30, 17 * 60 + 30)).toBe('open');
    expect(attendanceWindowState(15 * 60, 13 * 60 + 30, 17 * 60 + 30)).toBe('open');
    expect(attendanceWindowState(17 * 60 + 30, 13 * 60 + 30, 17 * 60 + 30)).toBe('open');
  });

  it('rejects check-in after the configured shift ends', () => {
    expect(attendanceWindowState(17 * 60 + 31, 13 * 60 + 30, 17 * 60 + 30)).toBe('ended');
  });
});
