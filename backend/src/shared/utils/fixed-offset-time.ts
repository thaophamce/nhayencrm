const DEFAULT_OFFSET = '+07:00';
const MONTH_VALUE_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export const DEFAULT_ORG_TIMEZONE = DEFAULT_OFFSET;

export function getFixedOffsetMinutes(timezone: string): number {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(timezone);
  if (!match) return getFixedOffsetMinutes(DEFAULT_OFFSET);

  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 23 || minutes > 59) return getFixedOffsetMinutes(DEFAULT_OFFSET);

  const sign = match[1] === '-' ? -1 : 1;
  return sign * (hours * 60 + minutes);
}

export function getMonthValueInOffset(date = new Date(), timezone = DEFAULT_OFFSET): string {
  const offsetMs = getFixedOffsetMinutes(timezone) * 60_000;
  return new Date(date.getTime() + offsetMs).toISOString().slice(0, 7);
}

export function getMonthRangeInOffset(month: string, timezone = DEFAULT_OFFSET): {
  startDate: Date;
  endDate: Date;
  daysInMonth: number;
} | null {
  const match = MONTH_VALUE_PATTERN.exec(month);
  if (!match) return null;

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (year < 2000 || year > 2100) return null;

  const offsetMs = getFixedOffsetMinutes(timezone) * 60_000;
  const startDate = new Date(Date.UTC(year, monthNumber - 1, 1) - offsetMs);
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  const endDate = new Date(Date.UTC(nextYear, nextMonth - 1, 1) - offsetMs);

  return {
    startDate,
    endDate,
    daysInMonth: new Date(Date.UTC(year, monthNumber, 0)).getUTCDate(),
  };
}

export function getDayOfMonthInOffset(date: Date, timezone = DEFAULT_OFFSET): number {
  const offsetMs = getFixedOffsetMinutes(timezone) * 60_000;
  return new Date(date.getTime() + offsetMs).getUTCDate();
}
