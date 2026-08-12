export interface OptimisticMessageLike {
  id: string;
  echoId?: string;
  isLocal?: boolean;
}

export function reconcileOptimisticMessage<T extends OptimisticMessageLike>(
  messages: T[],
  echoId: string,
  real: T,
): T[] {
  const realIndex = messages.findIndex((message) => message.id === real.id);
  const placeholderIndex = messages.findIndex((message) => message.echoId === echoId && message.isLocal === true);

  if (placeholderIndex !== -1) {
    if (realIndex !== -1 && realIndex !== placeholderIndex) {
      return messages.filter((_, index) => index !== placeholderIndex);
    }
    const next = messages.slice();
    next.splice(placeholderIndex, 1, real);
    return next;
  }
  if (realIndex !== -1) return messages;
  return [...messages, real];
}

/** Replace a socket snapshot with the same database id, or append it when new. */
export function upsertRealtimeMessage<T extends OptimisticMessageLike>(
  messages: T[],
  incoming: T,
): T[] {
  const index = messages.findIndex((message) => message.id === incoming.id);
  if (index === -1) return [...messages, incoming];
  const next = messages.slice();
  next[index] = incoming;
  return next;
}
