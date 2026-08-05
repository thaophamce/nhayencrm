import { describe, expect, it } from 'vitest';
import { buildDailyReportEmail, previousVietnamDay, type DailyReport } from '../src/modules/reports/daily-email-report.js';

describe('daily email report', () => {
  it('uses the complete previous Vietnam calendar day', () => {
    const range = previousVietnamDay(new Date('2026-08-04T01:00:00.000Z'));
    expect(range.start.toISOString()).toBe('2026-08-02T17:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-08-03T17:00:00.000Z');
    expect(range.label).toBe('03/08/2026');
  });

  it('renders all three report sections and escapes organization name', () => {
    const report: DailyReport = {
      orgName: 'Nhà Yến <CRM>', reportDate: '03/08/2026',
      delivery: { revenue: 1_200_000, outstanding: 200_000, totalOrders: 2, byMethod: { viettelpost: 2 } },
      design: { newDemo: 22, approved: 39, salary: 2_910_000 },
      messages: {
        newCustomers: 5, inboundMessages: 17,
        byAccount: [
          { name: 'Thiệp Cưới', newCustomers: 2, inboundMessages: 7 },
          { name: 'Thiệp Cưới Nhà Yến', newCustomers: 3, inboundMessages: 10 },
        ],
      },
    };
    const result = buildDailyReportEmail(report);
    expect(result.subject).toContain('03/08/2026');
    expect(result.html).toContain('Giao vận');
    expect(result.html).toContain('Đơn thiết kế');
    expect(result.html).toContain('Tin nhắn khách hàng');
    expect(result.html).toContain('Thiệp Cưới Nhà Yến');
    expect(result.html).toContain('viewport');
    expect(result.html).toContain('Nhà Yến &lt;CRM&gt;');
    expect(result.html).toContain('2.910.000 đ');
  });
});
