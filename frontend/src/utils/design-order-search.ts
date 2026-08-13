export function extractDesignOrderCode(conversationName?: string | null): string {
  return conversationName?.match(/^\s*(D\d+)\b/i)?.[1]?.toUpperCase() ?? '';
}

interface ConversationNameSource {
  threadType?: 'user' | 'group' | null;
  groupName?: string | null;
  aliasInNick?: string | null;
  crmName?: string | null;
  fullName?: string | null;
}

export function getConversationDisplayName(source: ConversationNameSource): string | null {
  if (source.threadType === 'group') return source.groupName || null;
  return source.aliasInNick || source.crmName || source.fullName || null;
}
