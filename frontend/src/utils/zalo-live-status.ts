export type ZaloStatusSource = {
  id: string;
  status?: string | null;
  liveStatus?: string | null;
};

/** Prefer the backend pool's live status over the status cached on a conversation. */
export function resolveZaloLiveStatus(
  accountId: string | null | undefined,
  cachedStatus: string | null | undefined,
  accounts: readonly ZaloStatusSource[],
): string | null | undefined {
  if (!accountId) return cachedStatus;
  const account = accounts.find((item) => item.id === accountId);
  return account?.liveStatus ?? account?.status ?? cachedStatus;
}
