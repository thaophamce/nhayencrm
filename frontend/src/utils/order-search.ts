export function normalizeOrderSearch(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const orderCode = trimmed.match(/^d\d+/i)?.[0];
  return orderCode ?? trimmed;
}
