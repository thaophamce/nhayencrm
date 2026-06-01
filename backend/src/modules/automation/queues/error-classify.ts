// ════════════════════════════════════════════════════════════════════════
// Luồng Mục Tiêu M2b/M3 — T4A retry policy classifier (2026-06-01)
// ════════════════════════════════════════════════════════════════════════
//
// Spec section 28 design doc. Phân loại Zalo SDK error:
//   permanent  → markPermanent + notify Zalo nội bộ (P5), KHÔNG retry
//   transient  → BullMQ retry exponential backoff 2 lần (10s, 20s, 40s)
//   unknown    → defensive retry 1 lần, fail tiếp → markPermanent

export type ErrorClassification = 'permanent' | 'transient' | 'unknown';

export interface ClassifiedZaloError {
  classification: ErrorClassification;
  errorCode: string; // enum: zalo_blocked|zalo_banned|zalo_rate_limit|zalo_transient|network_timeout|dispatcher_error|unknown
  message: string;
}

interface ZaloErrorShape {
  code?: string;
  status?: number;
  zaloErrorCode?: number;
  message?: string;
}

const PERMANENT_KEYWORDS = [
  'blocked',
  'banned',
  'not found',
  'invalid uid',
  'invalid contact',
  'friend cap',
  'limit reach',
  'limit reached',
  'already friend',
  'spam',
  'reported',
];

const TRANSIENT_KEYWORDS = [
  'rate limit',
  'too many requests',
  'service unavailable',
  'gateway timeout',
  'bad gateway',
  'connection reset',
  'connection refused',
  'timeout',
  'econnreset',
  'etimedout',
  'econnrefused',
  'eai_again',
];

export function classifyError(err: unknown): ClassifiedZaloError {
  if (!(err instanceof Error)) {
    return {
      classification: 'unknown',
      errorCode: 'unknown',
      message: String(err ?? 'unknown error'),
    };
  }

  const zErr = err as Error & ZaloErrorShape;
  const msg = (zErr.message ?? '').toLowerCase();

  // 1. Network errors → transient
  if (['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN'].includes(zErr.code ?? '')) {
    return {
      classification: 'transient',
      errorCode: 'network_timeout',
      message: zErr.message ?? '',
    };
  }

  // 2. HTTP status code
  if (zErr.status === 429) {
    return {
      classification: 'transient',
      errorCode: 'zalo_rate_limit',
      message: zErr.message ?? 'Zalo rate limit',
    };
  }
  if (zErr.status && zErr.status >= 500) {
    return {
      classification: 'transient',
      errorCode: 'zalo_transient',
      message: zErr.message ?? '',
    };
  }
  if (zErr.status && zErr.status >= 400 && zErr.status < 500) {
    return {
      classification: 'permanent',
      errorCode: 'zalo_blocked',
      message: zErr.message ?? '',
    };
  }

  // 3. Message pattern matching
  for (const kw of PERMANENT_KEYWORDS) {
    if (msg.includes(kw)) {
      return {
        classification: 'permanent',
        errorCode: 'zalo_blocked',
        message: zErr.message ?? '',
      };
    }
  }

  for (const kw of TRANSIENT_KEYWORDS) {
    if (msg.includes(kw)) {
      return {
        classification: 'transient',
        errorCode: 'zalo_transient',
        message: zErr.message ?? '',
      };
    }
  }

  // 4. Unknown — defensive retry 1 lần
  return {
    classification: 'unknown',
    errorCode: 'unknown',
    message: zErr.message ?? '',
  };
}
