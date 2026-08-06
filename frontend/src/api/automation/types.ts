export type BlockChannel = 'zalo_user';

export type BlockActionType =
  | 'request_friend'
  | 'send_message'
  | 'update_status'
  | 'send_image'
  | 'send_file'
  | 'send_template'
  | 'add_tag'
  | 'remove_tag'
  | 'assign_user'
  | 'update_lead_score';

export const SUPPORTED_ACTION_TYPES: readonly BlockActionType[] = [
  'request_friend',
  'send_message',
  'update_status',
];

export interface Block {
  id: string;
  orgId: string;
  folderId: string | null;
  name: string;
  channel: string;
  actionType: BlockActionType;
  content: Record<string, unknown>;
  ownerNickId: string | null;
  isShared: boolean;
  tagIds: string[];
  usageCount: number;
  lastUsedAt: string | null;
  manualSendCount: number;
  lastManualSentAt: string | null;
  archivedAt: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  folder?: { id: string; name: string; visibility?: 'public' | 'private' } | null;
}

export interface BlockFolder {
  id: string;
  orgId: string;
  name: string;
  visibility: 'public' | 'private';
  parentId: string | null;
  ownerNickId: string | null;
  ownerUserId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  _count?: { blocks: number };
}
