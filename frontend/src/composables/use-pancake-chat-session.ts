import { shallowRef } from 'vue';

export interface PancakeConversation {
  id: string;
  name: string;
  avatarUrl: string | null;
  isGroup: boolean;
  messageCount: number;
  updatedAt: string | null;
  snippet: string | null;
}

export interface PancakeConnection {
  id: string;
  name: string;
  pageId: string;
  displayName: string;
  status: string;
  enabled: boolean;
  updatedAt: string;
}

export interface PancakePreview {
  connection: PancakeConnection;
  conversations: PancakeConversation[];
}

const STORAGE_KEY = 'dev:pancake-chat-connection';
const LEGACY_TOKEN_KEY = 'dev:pancake-chat-token';
const LEGACY_PREVIEW_KEY = 'dev:pancake-chat-preview';

function canUseLocalSession(): boolean {
  if (typeof window === 'undefined') return false;
  return import.meta.env.DEV
    && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
}

function restore(): PancakePreview | null {
  if (!canUseLocalSession()) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as PancakePreview : null;
  } catch {
    return null;
  }
}

const preview = shallowRef<PancakePreview | null>(restore());

if (canUseLocalSession()) {
  // Xóa dữ liệu prototype cũ: từ phiên bản này token tuyệt đối không nằm trong trình duyệt.
  sessionStorage.removeItem(LEGACY_TOKEN_KEY);
  sessionStorage.removeItem(LEGACY_PREVIEW_KEY);
}

export function usePancakeChatSession() {
  function connect(nextPreview: PancakePreview) {
    preview.value = nextPreview;
    if (canUseLocalSession()) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextPreview));
  }

  function disconnect() {
    preview.value = null;
    if (canUseLocalSession()) sessionStorage.removeItem(STORAGE_KEY);
  }

  return { preview, connect, disconnect };
}
