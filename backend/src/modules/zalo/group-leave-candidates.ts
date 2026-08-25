export type LeaveStatusId = 'designing' | 'approved' | 'shipping';
export type ExclusionReason = 'invalid_name' | 'unknown_activity' | 'date_not_before' | 'activity_too_recent' | 'keyword_not_matched' | 'search_not_matched';

export const GROUP_LEAVE_STATUS_PRESETS: Record<LeaveStatusId, { label: string; aliases: string[] }> = {
  designing: { label: 'Đang thiết kế / Đang TK', aliases: ['đang thiết kế', 'đang tk'] },
  approved: { label: 'Chốt in', aliases: ['chốt in'] },
  shipping: { label: 'Đang giao', aliases: ['đang giao', 'đang giao hàng'] },
};

export interface ParsedGroupCode { raw: string; yearPrefix: 'C' | 'D'; date: string; sequence: number }
export interface SourceGroup { id: string; name: string; totalMember: number; lastMessageAt: Date | null }
export interface CandidateFilter { beforeDate: string; inactiveDays: number; statuses: LeaveStatusId[]; customKeywords: string[]; search: string; now: Date }
export interface GroupLeaveCandidate {
  id: string; name: string; totalMember: number; parsedCode: ParsedGroupCode;
  matchedKeywords: string[]; lastMessageAt: string; inactiveDays: number;
}

export function normalizeVietnameseSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, m => m === 'Đ' ? 'D' : 'd')
    .toLowerCase().trim().replace(/\s+/g, ' ');
}

export function parseBusinessGroupCode(name: string): ParsedGroupCode | null {
  const match = name.match(/^\s*([CD])(\d{2})(\d{2})(\d{2})(?=\D|$)/);
  if (!match) return null;
  const [, prefix, dd, mm, seq] = match;
  const year = prefix === 'C' ? 2025 : 2026;
  const day = Number(dd); const month = Number(mm);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { raw: match[0].trim(), yearPrefix: prefix as 'C' | 'D', date: `${year}-${mm}-${dd}`, sequence: Number(seq) };
}

const bangkokFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' });
function bangkokDayNumber(date: Date): number {
  const p = Object.fromEntries(bangkokFormatter.formatToParts(date).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]));
  return Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 86_400_000);
}
export function inactiveCalendarDaysBangkok(lastMessageAt: Date, now: Date): number {
  return Math.max(0, bangkokDayNumber(now) - bangkokDayNumber(lastMessageAt));
}

export function evaluateGroupLeaveCandidate(group: SourceGroup, filter: CandidateFilter): { candidate: GroupLeaveCandidate | null; exclusionReasons: ExclusionReason[] } {
  const reasons: ExclusionReason[] = [];
  const parsed = parseBusinessGroupCode(group.name);
  if (!parsed) reasons.push('invalid_name');
  else if (parsed.date >= filter.beforeDate) reasons.push('date_not_before');
  const inactive = group.lastMessageAt ? inactiveCalendarDaysBangkok(group.lastMessageAt, filter.now) : null;
  if (inactive === null) reasons.push('unknown_activity');
  else if (inactive < filter.inactiveDays) reasons.push('activity_too_recent');

  const normalizedName = normalizeVietnameseSearch(group.name);
  const matchedKeywords: string[] = [];
  for (const id of filter.statuses) {
    const preset = GROUP_LEAVE_STATUS_PRESETS[id];
    if (preset?.aliases.some(a => normalizedName.includes(normalizeVietnameseSearch(a)))) matchedKeywords.push(preset.label);
  }
  for (const keyword of filter.customKeywords) {
    if (normalizedName.includes(normalizeVietnameseSearch(keyword))) matchedKeywords.push(keyword.trim());
  }
  if (!matchedKeywords.length) reasons.push('keyword_not_matched');
  if (filter.search) {
    const q = normalizeVietnameseSearch(filter.search);
    if (!normalizedName.includes(q) && !normalizeVietnameseSearch(group.id).includes(q)) reasons.push('search_not_matched');
  }
  if (reasons.length || !parsed || inactive === null || !group.lastMessageAt) return { candidate: null, exclusionReasons: reasons };
  return { candidate: { id: group.id, name: group.name, totalMember: group.totalMember, parsedCode: parsed, matchedKeywords: [...new Set(matchedKeywords)], lastMessageAt: group.lastMessageAt.toISOString(), inactiveDays: inactive }, exclusionReasons: [] };
}
