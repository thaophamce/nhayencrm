// Phase 7 — Block types & content schema.
//
// Block.actionType discriminates content shape. Engine reads block.content
// based on actionType to dispatch to the right action handler.
//
// Phase G ship first 3 actions: request_friend, send_message, update_status.
// Other actionTypes here are reserved for future phases (do NOT remove from
// the enum — UI components key off these strings).

export type BlockChannel = 'zalo_user';

export type BlockActionType =
  | 'request_friend'
  | 'send_message'
  | 'update_status'
  // Reserved for future phases:
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

// ── Content shapes per actionType ──────────────────────────────────────────
//
// `*Variants` arrays let a single block carry multiple wordings; engine picks
// one randomly at execution time to vary outgoing text across nicks (memory:
// project_zalocrm_phase7_automation — template variation per nick).

export interface RequestFriendContent {
  greetingVariants: string[]; // 1+ entries, engine picks one per execution
}

export interface MessageAttachment {
  kind: 'image' | 'video' | 'file' | 'link';
  url: string;
  caption?: string;
  // Optional: thumbnail for video, alt text for image
  thumbnailUrl?: string;
  altText?: string;
}

export interface SendMessageContent {
  textVariants: string[];
  attachments?: MessageAttachment[];
}

export interface UpdateStatusContent {
  statusId: string;
  // Optional: only apply if contact currently in one of these statuses
  onlyFromStatusIds?: string[];
}

export type BlockContent =
  | RequestFriendContent
  | SendMessageContent
  | UpdateStatusContent;

// ── Validators ─────────────────────────────────────────────────────────────
//
// Each returns `{ ok: true }` or `{ ok: false, error: 'human readable msg' }`.
// Called by block routes on create/update + by engine before execute.

export function validateBlockContent(
  actionType: BlockActionType,
  content: unknown,
): { ok: true } | { ok: false; error: string } {
  if (typeof content !== 'object' || content === null) {
    return { ok: false, error: 'content phải là object' };
  }
  const c = content as Record<string, unknown>;

  switch (actionType) {
    case 'request_friend': {
      // 2026-06-06 — Chấp nhận 2 shape: CŨ (string[]) hoặc MỚI ({text, styles?}[])
      // để giữ format rich (BlockEditorDialog dùng RichTextEditor như UI Chat).
      const variants = c.greetingVariants;
      if (!Array.isArray(variants) || variants.length === 0) {
        return { ok: false, error: 'greetingVariants phải là mảng có ít nhất 1 phần tử' };
      }
      const greetingTextOf = (v: unknown): string | null => {
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object' && typeof (v as Record<string, unknown>).text === 'string') {
          return (v as Record<string, string>).text;
        }
        return null;
      };
      if (!variants.every((v) => { const t = greetingTextOf(v); return t !== null && t.trim().length > 0; })) {
        return { ok: false, error: 'mỗi greetingVariant phải có nội dung không rỗng' };
      }
      return { ok: true };
    }

    case 'send_message': {
      // 2026-06-06 — Hỗ trợ 2 shape: MỚI { components: [{kind, defaultVariant:{text,styles}, variants}] }
      // (BlockEditorDialog rich-text) hoặc CŨ { textVariants: string[], attachments }.
      const comps = c.components;
      if (Array.isArray(comps)) {
        if (comps.length === 0) {
          return { ok: false, error: 'components phải có ít nhất 1 thành phần' };
        }
        // Mỗi component text cần defaultVariant.text không rỗng; component media cần url.
        for (const comp of comps) {
          if (typeof comp !== 'object' || comp === null) {
            return { ok: false, error: 'mỗi component phải là object' };
          }
          const cc = comp as Record<string, unknown>;
          if (cc.kind === 'text') {
            const def = cc.defaultVariant as Record<string, unknown> | undefined;
            const defText = def && typeof def.text === 'string' ? def.text : '';
            const vars = Array.isArray(cc.variants) ? cc.variants as Array<Record<string, unknown>> : [];
            const hasAnyText = defText.trim().length > 0
              || vars.some((v) => typeof v?.text === 'string' && (v.text as string).trim().length > 0);
            if (!hasAnyText) {
              return { ok: false, error: 'component text phải có nội dung không rỗng' };
            }
          } else if (['image', 'video', 'file', 'album'].includes(cc.kind as string)) {
            const okMedia = (cc.kind === 'album')
              ? Array.isArray(cc.items) && (cc.items as unknown[]).length > 0
              : typeof cc.url === 'string' && (cc.url as string).length > 0;
            if (!okMedia) {
              return { ok: false, error: `component ${cc.kind} thiếu url/items` };
            }
          } else {
            return { ok: false, error: `component.kind '${String(cc.kind)}' không hợp lệ` };
          }
        }
        return { ok: true };
      }

      // Legacy shape: textVariants[] + attachments
      const variants = c.textVariants;
      if (!Array.isArray(variants) || variants.length === 0) {
        return { ok: false, error: 'textVariants phải là mảng có ít nhất 1 phần tử' };
      }
      if (!variants.every((v) => typeof v === 'string' && v.trim().length > 0)) {
        return { ok: false, error: 'mỗi textVariant phải là chuỗi không rỗng' };
      }
      const atts = c.attachments;
      if (atts !== undefined) {
        if (!Array.isArray(atts)) return { ok: false, error: 'attachments phải là mảng' };
        for (const att of atts) {
          if (typeof att !== 'object' || att === null) {
            return { ok: false, error: 'mỗi attachment phải là object' };
          }
          const a = att as Record<string, unknown>;
          if (!['image', 'video', 'file', 'link'].includes(a.kind as string)) {
            return { ok: false, error: 'attachment.kind phải là image | video | file | link' };
          }
          if (typeof a.url !== 'string' || !a.url) {
            return { ok: false, error: 'attachment.url phải là chuỗi không rỗng' };
          }
        }
      }
      return { ok: true };
    }

    case 'update_status': {
      if (typeof c.statusId !== 'string' || !c.statusId) {
        return { ok: false, error: 'statusId phải là chuỗi không rỗng' };
      }
      if (c.onlyFromStatusIds !== undefined && !Array.isArray(c.onlyFromStatusIds)) {
        return { ok: false, error: 'onlyFromStatusIds phải là mảng' };
      }
      return { ok: true };
    }

    default:
      return { ok: false, error: `actionType '${actionType}' chưa được hỗ trợ ở phase này` };
  }
}

export function isSupportedActionType(value: unknown): value is BlockActionType {
  return typeof value === 'string' && SUPPORTED_ACTION_TYPES.includes(value as BlockActionType);
}
