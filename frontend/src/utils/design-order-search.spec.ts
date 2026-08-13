import { describe, expect, it } from 'vitest';
import { extractDesignOrderCode, getConversationDisplayName } from './design-order-search';

describe('extractDesignOrderCode', () => {
  it.each([
    ['D040822 ĐANG TK 08/11', 'D040822'],
    [' D180709 - đang giao', 'D180709'],
    ['d050848 - đạt tk 21/11', 'D050848'],
  ])('extracts the leading design order code from %s', (name, expected) => {
    expect(extractDesignOrderCode(name)).toBe(expected);
  });

  it.each([null, undefined, '', 'Khách chưa có mã', 'Mã D040822 nằm giữa tên'])(
    'returns an empty query when there is no leading order code: %s',
    (name) => {
      expect(extractDesignOrderCode(name)).toBe('');
    },
  );
});

describe('getConversationDisplayName', () => {
  it('uses the group name for group conversations', () => {
    expect(getConversationDisplayName({
      threadType: 'group',
      groupName: 'D040822 ĐANG TK',
      aliasInNick: 'Tên cá nhân không được dùng',
    })).toBe('D040822 ĐANG TK');
  });

  it.each([
    [{ aliasInNick: 'D100001 Alias', crmName: 'D100002 CRM', fullName: 'D100003 Full' }, 'D100001 Alias'],
    [{ crmName: 'D100002 CRM', fullName: 'D100003 Full' }, 'D100002 CRM'],
    [{ fullName: 'D100003 Full' }, 'D100003 Full'],
    [{}, null],
  ])('uses the direct-chat fallback chain %#', (source, expected) => {
    expect(getConversationDisplayName({ threadType: 'user', ...source })).toBe(expected);
  });
});
