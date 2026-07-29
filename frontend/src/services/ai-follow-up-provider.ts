export interface AiFollowUpContext {
  conversationId: string;
  contactId: string;
  contactName?: string | null;
  lastInboundAt?: string | null;
  lastInboundPreview?: string | null;
}

export interface AiFollowUpGenerated {
  silenceDays: number;
  timeLabel: string;
  needSummary: string;
  reason: string;
  content: string;
}

export interface AiFollowUpProvider {
  generate(context: AiFollowUpContext): Promise<AiFollowUpGenerated>;
}

function hash(value: string): number {
  return [...value].reduce((total, char) => total + char.charCodeAt(0), 0);
}

const MOCK_DAY_OPTIONS = [46, 714, 1529, 30] as const;

export class MockAiFollowUpProvider implements AiFollowUpProvider {
  async generate(context: AiFollowUpContext): Promise<AiFollowUpGenerated> {
    const silenceDays = MOCK_DAY_OPTIONS[hash(context.conversationId) % MOCK_DAY_OPTIONS.length] ?? 30;
    const name = context.contactName?.trim() || 'khách';
    const previousNeed = context.lastInboundPreview?.trim();

    return {
      silenceDays,
      timeLabel: silenceDays === 30 ? '30 ngày+' : `${silenceDays} ngày`,
      needSummary: previousNeed
        ? `Nhu cầu gần nhất: “${previousNeed}”`
        : 'Khách từng quan tâm mẫu thiệp cưới và khả năng chỉnh màu, tên cô dâu chú rể.',
      reason: 'Đã lâu chưa có tương tác mới. Tin hỏi thăm ngắn giúp nối lại nhu cầu mà không tạo cảm giác thúc ép.',
      content: `Chào ${name}, em xin phép hỏi thăm mình đã chọn được mẫu thiệp phù hợp chưa ạ? Nếu mình vẫn đang cân nhắc, em có thể gửi lại vài mẫu gần với phong cách mình từng quan tâm để mình xem nhanh nhé.`,
    };
  }
}

export const aiFollowUpProvider: AiFollowUpProvider = new MockAiFollowUpProvider();
