export const DEFAULT_TAG_COLOR = '#90A4AE';

const SAFE_HEX_COLOR = /^#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3})?$/;

export function safeCssHexColor(color: unknown, fallback = DEFAULT_TAG_COLOR): string {
  if (typeof color !== 'string') return fallback;
  const trimmed = color.trim();
  return SAFE_HEX_COLOR.test(trimmed) ? trimmed : fallback;
}
