import { describe, expect, it } from 'vitest';
import { buildNewLeaveEmail, buildReviewedLeaveEmail } from '../src/modules/hr/leave-email-service.js';

const leave = {
  staffName: 'Nguyễn <Test>', employeeEmail: 'staff@example.com', type: 'normal', session: 'morning',
  startDate: '2026-08-03', endDate: '2026-08-03', reason: 'Việc gia đình <script>alert(1)</script>',
};

describe('leave email templates', () => {
  it('renders the new request for admin and escapes employee input', () => {
    const message = buildNewLeaveEmail(leave);
    expect(message.subject).toContain('Nguyễn <Test>');
    expect(message.html).toContain('03/08/2026');
    expect(message.html).toContain('Nguyễn &lt;Test&gt;');
    expect(message.html).not.toContain('<script>');
  });

  it('renders approval and review note for the employee', () => {
    const message = buildReviewedLeaveEmail({ ...leave, status: 'approved', reviewNote: 'Đồng ý' });
    expect(message.subject).toContain('ĐÃ ĐƯỢC DUYỆT');
    expect(message.html).toContain('Phản hồi quản lý');
    expect(message.html).toContain('Đồng ý');
  });

  it('renders rejection distinctly', () => {
    expect(buildReviewedLeaveEmail({ ...leave, status: 'rejected' }).subject).toContain('BỊ TỪ CHỐI');
  });
});
