// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc

import fs from 'node:fs/promises';
import path from 'node:path';

export type CleaningSource = 'pancake_import' | 'zalo_live' | 'all';

export type RawMessage = {
  id: string;
  conversationId: string;
  threadType: 'user' | 'group';
  source: Exclude<CleaningSource, 'all'>;
  senderType: 'contact' | 'self';
  content: string | null;
  contentType: string;
  sentAt: Date;
  isDeleted: boolean;
};

export type ConversationTurn = {
  conversationId: string;
  source: Exclude<CleaningSource, 'all'>;
  customerMessages: string[];
  staffReply: string;
  firstInboundAt: string;
  replyAt: string;
  containsPii: boolean;
};

export type CleaningPipeline = {
  extractDirectConversations(): Promise<RawMessage[]>;
  filterTextOnly(messages: RawMessage[]): RawMessage[];
  groupByTurn(messages: RawMessage[]): ConversationTurn[];
  redactPii(turn: ConversationTurn): ConversationTurn;
  deduplicateBySimilarity(turns: ConversationTurn[]): ConversationTurn[];
  validatePricing(turn: ConversationTurn): boolean;
  exportJSONL(turns: ConversationTurn[], outputPath: string): Promise<void>;
};

export const PII_PATTERNS = [
  { name: 'phone', regex: /(?<!\d)(?:\+?84|0)(?:[\s.-]?\d){8,10}(?!\d)/gu, replacement: '<PHONE>' },
  { name: 'email', regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, replacement: '<EMAIL>' },
  { name: 'order_code', regex: /\b(?:DH|ĐH|ORDER|ORD)[\s#:_-]*[A-Z0-9-]{3,}\b/giu, replacement: '<ORDER_CODE>' },
] as const;

export function redactText(text: string): { text: string; changed: boolean } {
  let redacted = text;
  for (const pattern of PII_PATTERNS) redacted = redacted.replace(pattern.regex, pattern.replacement);
  return { text: redacted, changed: redacted !== text };
}

export function normalizeText(text: string): string {
  return text.normalize('NFC').replace(/\s+/gu, ' ').trim();
}

export function filterTextOnly(messages: RawMessage[]): RawMessage[] {
  return messages.filter((message) =>
    message.threadType === 'user' &&
    message.contentType === 'text' &&
    !message.isDeleted &&
    Boolean(normalizeText(message.content || '')),
  );
}

export function redactTurnPii(turn: ConversationTurn): ConversationTurn {
  const customerMessages = turn.customerMessages.map((message) => redactText(message).text);
  const reply = redactText(turn.staffReply).text;
  return {
    ...turn,
    customerMessages,
    staffReply: reply,
    containsPii: turn.containsPii || customerMessages.some((message, index) => message !== turn.customerMessages[index]) || reply !== turn.staffReply,
  };
}

export function deduplicateExact(turns: ConversationTurn[]): ConversationTurn[] {
  const seen = new Set<string>();
  return turns.filter((turn) => {
    const key = JSON.stringify([turn.customerMessages.map(normalizeText), normalizeText(turn.staffReply)]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function exportJSONL(turns: ConversationTurn[], outputPath: string): Promise<void> {
  const absolutePath = path.resolve(outputPath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  const content = turns.map((turn) => JSON.stringify(turn)).join('\n');
  await fs.writeFile(absolutePath, content ? `${content}\n` : '', 'utf8');
}

export function createCleaningPipeline(dependencies: Pick<CleaningPipeline, 'extractDirectConversations' | 'groupByTurn' | 'validatePricing'>): CleaningPipeline {
  return {
    extractDirectConversations: dependencies.extractDirectConversations,
    filterTextOnly,
    groupByTurn: dependencies.groupByTurn,
    redactPii: redactTurnPii,
    deduplicateBySimilarity: deduplicateExact,
    validatePricing: dependencies.validatePricing,
    exportJSONL,
  };
}

export type AutoReplyTier = 'safe_auto' | 'review_optional' | 'human_required';

export type CleaningStats = {
  totalExamined: number;
  kept: number;
  duplicates: number;
  piiFlagged: number;
  pricingFlagged: number;
  bySource: Record<Exclude<CleaningSource, 'all'>, number>;
  byIntent: Record<string, number>;
};

export function emptyCleaningStats(): CleaningStats {
  return {
    totalExamined: 0,
    kept: 0,
    duplicates: 0,
    piiFlagged: 0,
    pricingFlagged: 0,
    bySource: { pancake_import: 0, zalo_live: 0 },
    byIntent: {},
  };
}

export type TurnClassifier = (turn: ConversationTurn) => { intent: string; tier: AutoReplyTier; valid: boolean };

export function hashConversationTurn(turn: ConversationTurn): string {
  const key = JSON.stringify([turn.customerMessages.map(normalizeText), normalizeText(turn.staffReply)]);
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function classifyIntent(text: string): string {
  if (/(chào|hi|hello|em ơi)/u.test(text)) return 'GREETING';
  if (/(ở đâu|địa chỉ|showroom|cửa hàng)/u.test(text)) return 'LOCATION';
  if (/(mấy giờ|giờ mở|giờ làm|mở cửa)/u.test(text)) return 'BUSINESS_HOURS';
  if (/(giao hàng|ship|vận chuyển|toàn quốc)/u.test(text)) return 'SHIPPING';
  if (/(bao lâu|tiến độ|mấy ngày|thời gian)/u.test(text)) return 'PRODUCTION_TIME';
  if (/(giá|bao nhiêu|mức giá|báo giá)/u.test(text)) return 'PRICING';
  if (/(mẫu|thiết kế|sticker|trang trí)/u.test(text)) return 'SAMPLE';
  if (/(đặt cọc|cọc|thanh toán|chuyển khoản|hoàn tiền)/u.test(text)) return 'PAYMENT';
  if (/(khiếu nại|phàn nàn|sai|lỗi|chậm)/u.test(text)) return 'COMPLAINT';
  if (/(gấp|hỏa tốc|nhanh gấp)/u.test(text)) return 'URGENT';
  return 'OTHER';
}

function classifyTier(intent: string, text: string): AutoReplyTier {
  if (intent === 'PAYMENT' || intent === 'COMPLAINT' || intent === 'URGENT') return 'human_required';
  if (/(đặt cọc|thanh toán|chuyển khoản|hoàn tiền|khiếu nại|phàn nàn)/u.test(text)) return 'human_required';
  if (intent === 'PRICING' || intent === 'SAMPLE') return 'review_optional';
  return 'safe_auto';
}

export function defaultHeuristicClassifier(): TurnClassifier {
  return (turn) => {
    const text = (turn.customerMessages.join(' ') + ' ' + turn.staffReply).toLowerCase();
    const intent = classifyIntent(text);
    const tier = classifyTier(intent, text);
    return { intent, tier, valid: tier !== 'human_required' };
  };
}

export interface RunCleaningOptions {
  classifier: TurnClassifier;
  outputPath: string;
  validatePricing: (turn: ConversationTurn) => boolean;
}

export async function runCleaning(
  pipeline: CleaningPipeline,
  options: RunCleaningOptions,
): Promise<CleaningStats> {
  const stats = emptyCleaningStats();
  const raw = await pipeline.extractDirectConversations();
  const textOnly = pipeline.filterTextOnly(raw);
  const grouped = pipeline.groupByTurn(textOnly);
  const deduped: ConversationTurn[] = [];
  const seen = new Set<string>();
  for (const turn of grouped) {
    const hash = hashConversationTurn(turn);
    if (seen.has(hash)) {
      stats.duplicates += 1;
      stats.totalExamined += 1;
      continue;
    }
    seen.add(hash);
    const redacted = pipeline.redactPii(turn);
    stats.totalExamined += 1;
    const validPricing = options.validatePricing(redacted);
    if (!validPricing) stats.pricingFlagged += 1;
    const classification = options.classifier(redacted);
    stats.byIntent[classification.intent] = (stats.byIntent[classification.intent] ?? 0) + 1;
    if (redacted.containsPii) stats.piiFlagged += 1;
    if (classification.valid) {
      stats.kept += 1;
      stats.bySource[redacted.source] = (stats.bySource[redacted.source] ?? 0) + 1;
      deduped.push({ ...redacted });
    }
  }
  await pipeline.exportJSONL(deduped, options.outputPath);
  return stats;
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}`) {
  const output = process.argv[2] || 'data/ai/cleaned/reply-examples.jsonl';
  console.log(JSON.stringify({
    mode: 'outline-only',
    output,
    requiredReview: ['PII patterns', 'turn grouping', 'pricing validation', '100-sample human review'],
  }, null, 2));
}