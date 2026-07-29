import { computed, reactive } from 'vue';
import {
  aiFollowUpProvider,
  type AiFollowUpContext,
  type AiFollowUpProvider,
} from '@/services/ai-follow-up-provider';

export type AiFollowUpStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'USED'
  | 'SENT'
  | 'STALE';

export interface AiFollowUpSuggestion {
  id: string;
  conversationId: string;
  contactId: string;
  createdAt: string;
  sourceLastInboundAt: string | null;
  status: AiFollowUpStatus;
  silenceDays: number;
  timeLabel: string;
  needSummary: string;
  reason: string;
  content: string;
  approvedAt: string | null;
  usedAt: string | null;
  staleAt: string | null;
  hiddenFromComposer: boolean;
}

const STORAGE_KEY = 'zalocrm_ai_follow_up_suggestions_v1';
const suggestions = reactive<Record<string, AiFollowUpSuggestion>>({});
let hydrated = false;

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  if (typeof localStorage === 'undefined') return;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, AiFollowUpSuggestion>;
    Object.assign(suggestions, saved);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function persist(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(suggestions));
}

function isLater(value: string | null | undefined, baseline: string): boolean {
  if (!value) return false;
  const incoming = Date.parse(value);
  const created = Date.parse(baseline);
  return Number.isFinite(incoming) && Number.isFinite(created) && incoming > created;
}

export function canApproveAiFollowUp(item: AiFollowUpSuggestion | undefined): boolean {
  return !!item && (item.status === 'DRAFT' || item.status === 'PENDING_REVIEW');
}

export function isAiFollowUpVisibleInComposer(item: AiFollowUpSuggestion | undefined): boolean {
  return !!item && item.status === 'APPROVED' && !item.hiddenFromComposer;
}

export function markAiFollowUpStale(conversationId: string, inboundAt: string): boolean {
  hydrate();
  const item = suggestions[conversationId];
  if (!item || item.status === 'REJECTED' || item.status === 'SENT' || item.status === 'STALE') return false;
  if (!isLater(inboundAt, item.createdAt)) return false;
  item.status = 'STALE';
  item.staleAt = inboundAt;
  item.hiddenFromComposer = true;
  persist();
  return true;
}

export function useAiFollowUp(provider: AiFollowUpProvider = aiFollowUpProvider) {
  hydrate();

  async function generate(context: AiFollowUpContext, replace = false): Promise<AiFollowUpSuggestion> {
    const current = suggestions[context.conversationId];
    if (current && !replace) {
      if (context.lastInboundAt) markAiFollowUpStale(context.conversationId, context.lastInboundAt);
      return current;
    }
    const generated = await provider.generate(context);
    const createdAt = new Date().toISOString();
    const item: AiFollowUpSuggestion = {
      id: `ai-follow-up-${context.conversationId}-${Date.now()}`,
      conversationId: context.conversationId,
      contactId: context.contactId,
      createdAt,
      sourceLastInboundAt: context.lastInboundAt || null,
      status: 'PENDING_REVIEW',
      silenceDays: generated.silenceDays,
      timeLabel: generated.timeLabel,
      needSummary: generated.needSummary,
      reason: generated.reason,
      content: generated.content,
      approvedAt: null,
      usedAt: null,
      staleAt: null,
      hiddenFromComposer: false,
    };
    suggestions[context.conversationId] = item;
    persist();
    return item;
  }

  function saveDraft(conversationId: string, content: string): boolean {
    const item = suggestions[conversationId];
    if (!item || item.status === 'STALE' || item.status === 'REJECTED') return false;
    item.content = content.trim();
    item.status = 'PENDING_REVIEW';
    item.hiddenFromComposer = false;
    persist();
    return true;
  }

  function approve(conversationId: string): boolean {
    const item = suggestions[conversationId];
    if (!canApproveAiFollowUp(item) || !item?.content.trim()) return false;
    item.status = 'APPROVED';
    item.approvedAt = new Date().toISOString();
    item.hiddenFromComposer = false;
    persist();
    return true;
  }

  function markSent(conversationId: string): boolean {
    const item = suggestions[conversationId];
    if (!item || !item.content.trim() || item.status === 'STALE' || item.status === 'REJECTED') return false;
    item.status = 'SENT';
    item.approvedAt ||= new Date().toISOString();
    item.usedAt = new Date().toISOString();
    item.hiddenFromComposer = true;
    persist();
    return true;
  }

  function reject(conversationId: string): boolean {
    const item = suggestions[conversationId];
    if (!item || item.status === 'STALE') return false;
    item.status = 'REJECTED';
    item.hiddenFromComposer = true;
    persist();
    return true;
  }

  function useSuggestion(conversationId: string): string | null {
    const item = suggestions[conversationId];
    if (!isAiFollowUpVisibleInComposer(item)) return null;
    item.status = 'USED';
    item.usedAt = new Date().toISOString();
    item.hiddenFromComposer = true;
    persist();
    return item.content;
  }

  function hideComposerSuggestion(conversationId: string): void {
    const item = suggestions[conversationId];
    if (!item) return;
    item.hiddenFromComposer = true;
    persist();
  }

  return {
    suggestions,
    suggestionFor: (conversationId: string | null | undefined) => computed(() => conversationId ? suggestions[conversationId] : undefined),
    generate,
    regenerate: (context: AiFollowUpContext) => generate(context, true),
    saveDraft,
    approve,
    markSent,
    reject,
    useSuggestion,
    hideComposerSuggestion,
    markStale: markAiFollowUpStale,
  };
}

export function resetAiFollowUpStateForTests(): void {
  for (const key of Object.keys(suggestions)) delete suggestions[key];
  hydrated = true;
  if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
}
