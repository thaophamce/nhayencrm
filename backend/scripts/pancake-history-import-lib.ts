export interface PancakeConversation {
  id: string;
  type?: string;
  message_count?: number;
  inserted_at?: string;
  updated_at?: string;
  from?: { id?: string; name?: string };
  page_customer?: { id?: string; name?: string };
}

export interface PancakeMessage {
  id: string;
  message?: string | null;
  original_message?: string | null;
  inserted_at: string;
  from?: {
    id?: string;
    name?: string;
    admin_id?: string;
    admin_name?: string;
  };
  attachments?: Array<Record<string, unknown>>;
  is_removed?: boolean;
}

export interface ParsedPancakeConversation {
  threadType: 'user' | 'group';
  externalThreadId: string;
}

export function parsePancakeConversationId(
  conversationId: string,
  pageId: string,
): ParsedPancakeConversation {
  const userPrefix = `pzl_u_${pageId.replace(/^pzl_/, '')}_`;
  const groupPrefix = `pzl_g_${pageId.replace(/^pzl_/, '')}_`;

  if (conversationId.startsWith(userPrefix)) {
    return { threadType: 'user', externalThreadId: conversationId.slice(userPrefix.length) };
  }
  if (conversationId.startsWith(groupPrefix)) {
    return { threadType: 'group', externalThreadId: conversationId.slice(groupPrefix.length) };
  }
  throw new Error(`Unsupported Pancake conversation id: ${conversationId}`);
}

function attachmentUrl(attachment: Record<string, unknown>): string {
  if (typeof attachment.url === 'string') return attachment.url;
  const videoData = attachment.video_data;
  if (videoData && typeof videoData === 'object' && typeof (videoData as Record<string, unknown>).url === 'string') {
    return (videoData as Record<string, string>).url;
  }
  return '';
}

export function inferPancakeContent(
  message: PancakeMessage,
): { content: string; contentType: string; attachments: Array<Record<string, unknown>> } {
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const first = attachments[0];
  const rawText = message.original_message ?? message.message ?? '';

  if (!first) {
    return { content: rawText || (message.is_removed ? '[Tin nhắn đã thu hồi]' : ''), contentType: 'text', attachments };
  }

  const url = attachmentUrl(first);
  const mime = typeof first.mime_type === 'string' ? first.mime_type : '';
  const type = typeof first.type === 'string' ? first.type.toLowerCase() : '';
  const title = typeof first.title === 'string' ? first.title : '';
  const isImage = mime.startsWith('image/') || type.includes('image') || /\.(png|jpe?g|webp|gif)(?:$|\?)/i.test(url);
  const isVideo = mime.startsWith('video/') || type.includes('video') || /\.(mp4|mov|webm)(?:$|\?)/i.test(url);
  const isAudio = mime.startsWith('audio/') || type.includes('audio') || type.includes('voice');

  if (isImage) return { content: url || rawText, contentType: 'image', attachments };
  if (isVideo) {
    return {
      content: JSON.stringify({ href: url, name: title || 'video', mime: mime || 'video/mp4' }),
      contentType: 'video',
      attachments,
    };
  }
  if (isAudio) {
    return {
      content: JSON.stringify({ href: url, name: title || 'voice', mime: mime || 'audio/mpeg' }),
      contentType: 'voice',
      attachments,
    };
  }
  return {
    content: JSON.stringify({ href: url, name: title || 'Tệp đính kèm', mime }),
    contentType: 'file',
    attachments,
  };
}

export function isPancakeSelfMessage(message: PancakeMessage, pageId: string): boolean {
  const senderId = message.from?.id ?? '';
  return senderId === pageId || senderId === pageId.replace(/^pzl_/, '') || senderId === `pzl_${pageId.replace(/^pzl_/, '')}`;
}

export function pancakeMessageKey(messageId: string): string {
  return `pancake:${messageId}`;
}

export function parsePancakeDate(value: string): Date {
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid Pancake timestamp: ${value}`);
  return date;
}

export function decodePancakePageId(token: string): string {
  const payloadPart = token.split('.')[1];
  if (!payloadPart) throw new Error('Invalid Pancake token');
  const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as { id?: string };
  if (!payload.id?.startsWith('pzl_')) throw new Error('Token does not contain a Pancake Zalo page id');
  return payload.id;
}
