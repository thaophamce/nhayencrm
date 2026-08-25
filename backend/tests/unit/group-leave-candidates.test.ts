import { describe, expect, it } from 'vitest';
import {
  evaluateGroupLeaveCandidate,
  inactiveCalendarDaysBangkok,
  normalizeVietnameseSearch,
  parseBusinessGroupCode,
} from '../../src/modules/zalo/group-leave-candidates.js';

describe('parseBusinessGroupCode', () => {
  it('maps C to 2025 and D to 2026', () => {
    expect(parseBusinessGroupCode('C251207 chốt in')).toMatchObject({ date: '2025-12-25', sequence: 7 });
    expect(parseBusinessGroupCode('D010822 đang giao')).toMatchObject({ date: '2026-08-01', sequence: 22 });
  });

  it('rejects impossible dates, lowercase prefixes, and codes not at the start', () => {
    expect(parseBusinessGroupCode('D310222 đang giao')).toBeNull();
    expect(parseBusinessGroupCode('d010822 đang giao')).toBeNull();
    expect(parseBusinessGroupCode('khách D010822 đang giao')).toBeNull();
  });
});

describe('normalizeVietnameseSearch', () => {
  it('ignores case, Vietnamese accents, and repeated whitespace', () => {
    expect(normalizeVietnameseSearch('  ĐANG   THIẾT KẾ ')).toBe('dang thiet ke');
  });
});

describe('inactiveCalendarDaysBangkok', () => {
  it('counts Bangkok calendar-day boundaries instead of elapsed 24-hour periods', () => {
    expect(inactiveCalendarDaysBangkok(
      new Date('2026-08-12T16:55:00.000Z'),
      new Date('2026-08-12T17:05:00.000Z'),
    )).toBe(1);
  });
});

describe('evaluateGroupLeaveCandidate', () => {
  it('requires old date, enough inactivity, and at least one OR keyword match', () => {
    const result = evaluateGroupLeaveCandidate({
      id: 'g1', name: 'D010822 - ĐANG GIAO', totalMember: 6,
      lastMessageAt: new Date('2026-05-01T00:00:00.000Z'),
    }, {
      beforeDate: '2026-09-01', inactiveDays: 60,
      statuses: ['approved', 'shipping'], customKeywords: [], search: '',
      now: new Date('2026-08-13T00:00:00.000Z'),
    });
    expect(result.exclusionReasons).toEqual([]);
    expect(result.candidate?.matchedKeywords).toEqual(['Đang giao']);
  });

  it('reports overlapping reasons without making an unknown group eligible', () => {
    const result = evaluateGroupLeaveCandidate({ id: 'g2', name: 'sai mã', totalMember: 5, lastMessageAt: null }, {
      beforeDate: '2026-09-01', inactiveDays: 60,
      statuses: ['shipping'], customKeywords: [], search: '',
      now: new Date('2026-08-13T00:00:00.000Z'),
    });
    expect(result.candidate).toBeNull();
    expect(result.exclusionReasons).toEqual(expect.arrayContaining(['invalid_name', 'unknown_activity', 'keyword_not_matched']));
  });
});
