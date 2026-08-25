import { createHash } from 'node:crypto';

export function canonicalize(value: unknown): string {
  return JSON.stringify(deepSortKeys(value));
}

export function sha256hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function checksumOf(firebaseOrder: unknown): string {
  return sha256hex(canonicalize(firebaseOrder));
}

function deepSortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepSortKeys);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      sorted[key] = deepSortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}
