<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  QuickTemplatePopup — popup gợi ý mẫu tin nhắn nhanh nổi trên ô nhập liệu.
  Thiết kế theo dạng bảng chuyên nghiệp y hệt Pancake (Ảnh 2):
    - Dạng bảng gồm các cột: STT, Ký tự tắt, Tin nhắn (gồm icon thumbnail ảnh đính kèm nhỏ).
    - Đã loại bỏ hoàn toàn các bộ lọc dự án/chủ đề rườm rà không cần thiết.
    - Hỗ trợ phím tắt điều hướng lên xuống, Enter để chọn và Esc để đóng.
-->
<template>
  <Teleport to="body">
    <div v-if="visible" class="quick-template-popup" :style="popupStyle" @keydown="onKey">
      <div class="qtp-card">
        <!-- Header: Tiêu đề danh mục gọn gàng -->
        <div class="qtp-head">
          <div class="qtp-title">
            <v-icon size="16" class="mr-1">mdi-message-flash-outline</v-icon>
            Mẫu trả lời nhanh <span class="qtp-count ml-2">{{ filtered.length }}</span>
          </div>
        </div>

        <!-- Table view cho danh sách mẫu tin nhắn nhanh (giống Ảnh 2) -->
        <div class="qtp-table-container">
          <table class="qtp-table">
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">STT</th>
                <th style="width: 100px;">Ký tự tắt</th>
                <th>Tin nhắn</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(tpl, i) in filtered"
                :key="tpl.id"
                class="qtp-row"
                :class="{ active: i === selectedIndex }"
                @click="selectTemplate(tpl)"
                @mouseenter="selectedIndex = i"
              >
                <td class="text-center font-weight-bold text-grey-darken-1">{{ i + 1 }}.</td>
                <td class="shortcut-cell">
                  <span class="qtp-shortcut-tag">{{ tpl.shortcut }}</span>
                </td>
                <td class="message-cell">
                  <div class="d-flex align-center gap-2">
                    <!-- Ảnh đính kèm nhỏ cạnh tin nhắn nếu có -->
                    <v-avatar v-if="getPhotoUrl(tpl)" size="20" class="rounded border flex-shrink-0">
                      <v-img :src="getPhotoUrl(tpl) || undefined" cover />
                    </v-avatar>
                    <!-- Text preview -->
                    <span class="message-preview-text">{{ plainOf(tpl) }}</span>
                  </div>
                </td>
              </tr>
              <tr v-if="!filtered.length">
                <td colspan="3" class="qtp-empty">Không tìm thấy mẫu nào</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Hướng dẫn sử dụng + công tắc Gửi ngay -->
        <div class="qtp-foot">
          <span>↑↓ chọn · Enter {{ sendImmediately ? 'gửi' : 'chèn' }} · Esc đóng</span>
          <label class="qtp-toggle" @click.stop>
            <input
              type="checkbox"
              :checked="sendImmediately"
              @change="emit('update:sendImmediately', ($event.target as HTMLInputElement).checked)"
            />
            <span class="qtp-toggle-track"><span class="qtp-toggle-thumb" /></span>
            <span class="qtp-toggle-label">Gửi ngay</span>
          </label>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue';

interface RichPayload { text: string; styles?: Array<{ st: string; start: number; len: number }> }
interface Template {
  id: string;
  name: string;
  shortcut?: string | null;
  content: string;
  contentRich?: RichPayload | null;
  category: string | null;
  tagIds?: string[];
  isPersonal: boolean;
}
interface ContactCtx { fullName?: string | null; gender?: string | null; crmAlias?: string | null }

const props = defineProps<{
  visible: boolean;
  query: string;
  templates: Template[];
  contact?: ContactCtx | null;
  saleFullName?: string | null;
  anchorEl?: HTMLElement | null; // ô nhập để tính tọa độ fixed
  sendImmediately?: boolean; // bật: chọn mẫu gửi luôn; tắt: chỉ chèn vào ô soạn
}>();

const emit = defineEmits<{
  select: [payload: RichPayload, templateId: string];
  close: [];
  'update:sendImmediately': [value: boolean];
}>();

const selectedIndex = ref(0);

const popupStyle = ref<Record<string, string>>({});
function recalcPosition() {
  const el = props.anchorEl;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const width = Math.min(520, Math.max(420, r.width));
  let left = r.left;
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
  if (left < 8) left = 8;
  popupStyle.value = {
    position: 'fixed',
    left: `${left}px`,
    bottom: `${window.innerHeight - r.top + 6}px`,
    width: `${width}px`,
    maxHeight: `${Math.min(380, r.top - 16)}px`,
  };
}

let onScrollResize: (() => void) | null = null;
watch(() => props.visible, async (v) => {
  if (v) {
    await nextTick();
    recalcPosition();
    onScrollResize = () => recalcPosition();
    window.addEventListener('resize', onScrollResize);
    window.addEventListener('scroll', onScrollResize, true);
  } else if (onScrollResize) {
    window.removeEventListener('resize', onScrollResize);
    window.removeEventListener('scroll', onScrollResize, true);
    onScrollResize = null;
  }
});
watch(() => props.query, () => { if (props.visible) recalcPosition(); });
onBeforeUnmount(() => {
  if (onScrollResize) {
    window.removeEventListener('resize', onScrollResize);
    window.removeEventListener('scroll', onScrollResize, true);
  }
});

function normQuery(q: string): string {
  return q.trim().replace(/^\/+/, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

const filtered = computed(() => {
  let list = props.templates;
  const q = (props.query || '').toLowerCase().trim();
  if (q) {
    const qs = normQuery(props.query);
    const scored = list
      .map((t) => {
        const sc = (t.shortcut || '').toLowerCase();
        let score = -1;
        if (qs && sc) {
          if (sc === qs) score = 100;
          else if (sc.startsWith(qs)) score = 80;
          else if (sc.includes(qs)) score = 40;
        }
        if (score < 0) {
          if (t.name.toLowerCase().includes(q)) score = 20;
          else if (plainOf(t).toLowerCase().includes(q)) score = 10;
        }
        return { t, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score);
    list = scored.map((x) => x.t);
  }
  return list;
});

watch(filtered, () => { selectedIndex.value = 0; });
watch(() => props.query, () => { selectedIndex.value = 0; });

function plainOf(tpl: Template): string {
  return tpl.contentRich?.text ?? tpl.content ?? '';
}

function getPhotoUrl(tpl: any): string | null {
  if (tpl.tagIds && Array.isArray(tpl.tagIds) && tpl.tagIds.length > 0) {
    return tpl.tagIds[0];
  }
  if (tpl.contentRich?.attachments && Array.isArray(tpl.contentRich.attachments) && tpl.contentRich.attachments.length > 0) {
    return tpl.contentRich.attachments[0];
  }
  return null;
}

function renderRich(tpl: Template): RichPayload {
  const src: RichPayload = tpl.contentRich?.text
    ? { text: tpl.contentRich.text, styles: tpl.contentRich.styles ?? [] }
    : { text: tpl.content ?? '', styles: [] };

  const gender = props.contact?.gender;
  const genderStr = gender === 'female' ? 'Chị' : gender === 'male' ? 'Anh' : 'Anh/Chị';
  const nameRaw = (props.contact?.fullName ?? '').trim();
  const nameLast = nameRaw ? (nameRaw.split(/\s+/).pop() ?? '') : '';
  const saleRaw = (props.saleFullName ?? '').trim();
  const saleLast = saleRaw ? (saleRaw.split(/\s+/).pop() ?? 'em') : 'em';
  const crmFull = ((props.contact?.crmAlias ?? '').trim()) || nameRaw;
  const crmWords = crmFull ? crmFull.split(/\s+/) : [];

  const repl: Record<string, string> = {
    '{gender}': genderStr,
    '{name}': nameLast,
    '{name_full}': nameRaw,
    '{crm_full}': crmFull,
    '{crm_first}': crmWords[0] ?? '',
    '{crm_last}': crmWords[crmWords.length - 1] ?? '',
    '{sale}': saleLast,
    '{sale_full}': saleRaw || 'em',
  };

  const styles = (src.styles ?? []).map((s) => ({ ...s }));
  let text = src.text;

  const tokenRe = /\{(gender|name_full|name|crm_full|crm_first|crm_last|sale_full|sale)\}/;
  let guard = 0;
  while (guard++ < 200) {
    const m = tokenRe.exec(text);
    if (!m) break;
    const at = m.index;
    const tokenLen = m[0].length;
    const value = repl[m[0]] ?? '';
    const delta = value.length - tokenLen;
    text = text.slice(0, at) + value + text.slice(at + tokenLen);
    if (delta !== 0) {
      for (const s of styles) {
        const end = s.start + s.len;
        if (s.start >= at + tokenLen) {
          s.start += delta;
        } else if (end > at && s.start <= at) {
          s.len += delta;
        } else if (s.start > at && s.start < at + tokenLen) {
          s.start = at + value.length;
        }
      }
    }
  }
  const clean = styles.filter((s) => s.len > 0 && s.start >= 0);
  return { text, styles: clean };
}

function selectTemplate(tpl: Template) {
  emit('select', renderRich(tpl), tpl.id);
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex.value = Math.min(selectedIndex.value + 1, filtered.value.length - 1);
    scrollToSelected();
  }
  else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
    scrollToSelected();
  }
  else if (e.key === 'Enter') {
    e.preventDefault();
    const tpl = filtered.value[selectedIndex.value];
    if (tpl) selectTemplate(tpl);
  }
  else if (e.key === 'Escape') {
    emit('close');
  }
}

function scrollToSelected() {
  nextTick(() => {
    const container = document.querySelector('.qtp-table-container');
    const activeRow = document.querySelector('.qtp-row.active') as HTMLElement;
    if (container && activeRow) {
      const containerTop = container.scrollTop;
      const containerBottom = containerTop + container.clientHeight;
      const elemTop = activeRow.offsetTop;
      const elemBottom = elemTop + activeRow.clientHeight;
      if (elemTop < containerTop) {
        container.scrollTop = elemTop;
      } else if (elemBottom > containerBottom) {
        container.scrollTop = elemBottom - container.clientHeight;
      }
    }
  });
}

defineExpose({ onKey });
</script>

<style scoped>
.quick-template-popup {
  z-index: 3000;
}
.qtp-card {
  width: 100%;
  height: 100%;
  background: #fff;
  border: 1px solid #e3e6eb;
  border-radius: 12px;
  box-shadow: 0 8px 28px rgba(20, 26, 36, .16);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.qtp-head {
  padding: 10px 14px;
  border-bottom: 1px solid #eef0f3;
}
.qtp-title {
  display: flex;
  align-items: center;
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
}
.qtp-count {
  background: #eff6ff;
  color: #2563eb;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 999px;
}
.qtp-table-container {
  flex: 1;
  min-height: 0;
  max-height: 280px;
  overflow-y: auto;
}
.qtp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.qtp-table th {
  position: sticky;
  top: 0;
  background: #f8fafc;
  z-index: 2;
  font-weight: 600;
  color: #475569;
  padding: 8px 10px;
  border-bottom: 1px solid #e2e8f0;
  text-align: left;
}
.qtp-table td {
  padding: 8px 10px;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
}
.qtp-row {
  cursor: pointer;
  transition: background-color 100ms;
}
.qtp-row:hover, .qtp-row.active {
  background-color: #f1f5f9;
}
.qtp-shortcut-tag {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  font-weight: 600;
  color: #0f6ea3;
  background: #e6f3fb;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid #d0e4f2;
}
.message-cell {
  max-width: 0;
}
.message-preview-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #334155;
}
.qtp-empty {
  padding: 24px;
  text-align: center;
  color: #94a3b8;
  font-style: italic;
}
.qtp-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  border-top: 1px solid #eef0f3;
  font-size: 11px;
  color: #64748b;
  background-color: #f8fafc;
}
.qtp-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}
.qtp-toggle input { display: none; }
.qtp-toggle-track {
  position: relative;
  width: 30px;
  height: 16px;
  background: #cbd5e1;
  border-radius: 999px;
  transition: background 120ms;
}
.qtp-toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  background: #fff;
  border-radius: 50%;
  transition: transform 120ms;
}
.qtp-toggle input:checked + .qtp-toggle-track {
  background: #2563eb;
}
.qtp-toggle input:checked + .qtp-toggle-track .qtp-toggle-thumb {
  transform: translateX(14px);
}
.qtp-toggle-label {
  font-weight: 600;
  color: #334155;
}
</style>
