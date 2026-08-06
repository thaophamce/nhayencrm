<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  NotePopover.vue — nút "Ghi chú" nhỏ gọn ở header giữa (MessageThread), thay khối Ghi chú
  to ở cột phải. Bấm → mở popover: ô nhập + lưu + list note cũ. Chấm báo đỏ nếu KH đã có note.
  Toàn bộ logic lưu dùng lại useNotes — không đổi API, không mất dữ liệu.
-->
<template>
  <v-menu
    v-model="open"
    :close-on-content-click="false"
    location="bottom end"
    offset="6"
    @update:model-value="onToggle"
  >
    <template #activator="{ props: act }">
      <button
        class="icon-btn note-btn"
        v-bind="act"
        :disabled="!contactId"
        title="Ghi chú khách hàng"
      >
        <svg class="note-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
          <path d="M14 3v6h6" />
          <path d="M8 13h8M8 17h5" />
        </svg>
        <span v-if="notes.length" class="note-dot"></span>
      </button>
    </template>

    <div class="np-card">
      <div class="np-head">
        <span>Ghi chú khách hàng</span>
        <span v-if="notes.length" class="np-count">{{ notes.length }}</span>
      </div>

      <textarea
        v-model="noteInput"
        class="np-textarea"
        rows="3"
        placeholder="Nhập ghi chú cho khách hàng này..."
      ></textarea>
      <div class="np-save-row">
        <button class="np-save" :disabled="saving || !noteInput.trim()" @click="save">
          {{ saving ? 'Đang lưu...' : 'Lưu ghi chú' }}
        </button>
      </div>

      <div v-if="loading" class="np-empty">Đang tải ghi chú...</div>
      <div v-else-if="!notes.length" class="np-empty">Chưa có ghi chú nào</div>
      <div v-else class="np-list">
        <div v-for="n in notes" :key="n.id" class="np-item">
          <div class="np-item-meta">
            <span class="np-author">{{ n.author?.fullName || 'Nhân sự' }}</span>
            <span class="np-time">{{ formatTime(n.createdAt) }}</span>
            <button
              v-if="canModify(n)"
              class="np-del"
              title="Xoá ghi chú"
              @click="del(n.id)"
            >Xoá</button>
          </div>
          <div class="np-body">{{ n.body }}</div>
        </div>
      </div>
    </div>
  </v-menu>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useNotes, type Note } from '@/composables/use-notes';
import { useToast } from '@/composables/use-toast';
import { useAuthStore } from '@/stores/auth';

const props = defineProps<{ contactId: string | null }>();

const toast = useToast();
const authStore = useAuthStore();
const open = ref(false);
const noteInput = ref('');

const { notes, loading, saving, fetch: fetchNotes, create: createNote, remove: removeNote } =
  useNotes(() => props.contactId);

// Prefetch để biết có note chưa (hiện chấm báo) khi vừa chọn KH.
let lastFetchedId: string | null = null;
function ensureFetched() {
  if (props.contactId && props.contactId !== lastFetchedId) {
    lastFetchedId = props.contactId;
    void fetchNotes();
  }
}
ensureFetched();

function onToggle(v: boolean) {
  if (v) ensureFetched();
}

async function save() {
  if (!noteInput.value.trim()) return;
  const res = await createNote(noteInput.value);
  if (res) {
    noteInput.value = '';
    toast.success('Đã lưu ghi chú');
  } else {
    toast.error('Lưu ghi chú thất bại');
  }
}

function canModify(n: Note): boolean {
  const u = authStore.user;
  return n.authorUserId === u?.id || u?.role === 'owner' || u?.role === 'admin';
}

async function del(id: string) {
  if (!confirm('Xoá ghi chú này?')) return;
  const ok = await removeNote(id);
  toast[ok ? 'success' : 'error'](ok ? 'Đã xoá ghi chú' : 'Xoá ghi chú thất bại');
}

function formatTime(d: string): string {
  if (!d) return '';
  return new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

defineExpose({ open: () => { open.value = true; ensureFetched(); } });
</script>

<style scoped>
.note-btn {
  position: relative;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}
.note-btn:hover {
  color: var(--smax-primary, #2F80ED);
  background: var(--smax-primary-soft, #EBF3FF) !important;
}
.note-icon { display: block; }
.note-dot {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ff5a5f;
  border: 1.5px solid #fff;
}
.np-card {
  width: 300px;
  max-width: 90vw;
  padding: 12px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 28px rgba(30, 32, 44, 0.16);
}
.np-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #1e202c;
  margin-bottom: 8px;
}
.np-count {
  font-size: 11px;
  font-weight: 700;
  color: #2f80ed;
  background: rgba(47, 128, 237, 0.1);
  padding: 1px 7px;
  border-radius: 8px;
}
.np-textarea {
  width: 100%;
  border: 1.5px solid #eaecef;
  border-radius: 9px;
  padding: 8px 10px;
  font-size: 13px;
  color: #1e202c;
  outline: none;
  resize: vertical;
  font-family: inherit;
}
.np-textarea:focus { border-color: #2f80ed; }
.np-save-row { display: flex; justify-content: flex-end; margin-top: 8px; }
.np-save {
  padding: 7px 16px;
  border: none;
  border-radius: 8px;
  background: #2f80ed;
  color: #fff;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
}
.np-save:disabled { opacity: 0.45; cursor: not-allowed; }
.np-save:not(:disabled):hover { background: #1a6fd4; }
.np-empty {
  padding: 12px 4px;
  text-align: center;
  font-size: 12px;
  color: #8a8d9c;
}
.np-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 260px;
  overflow-y: auto;
}
.np-item {
  padding-top: 8px;
  border-top: 1px solid #f0f1f4;
}
.np-item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
  font-size: 11px;
  color: #8a8d9c;
}
.np-author { color: #5f6173; font-weight: 600; }
.np-del {
  margin-left: auto;
  border: none;
  background: none;
  color: #ff5a5f;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
  font-family: inherit;
}
.np-body {
  font-size: 13px;
  color: #1e202c;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
