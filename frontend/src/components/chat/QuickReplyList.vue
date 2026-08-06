<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  QuickReplyList.vue — danh sách tin nhắn nhanh (MessageTemplate) trong tab PROFILE cột phải,
  thay chỗ khối Ghi chú cũ. Bấm 1 mẫu → chèn thẳng vào ô soạn tin cột giữa qua window event
  'chat:insert-suggestion' (MessageThread lắng nghe → applySuggestion). Không cần gõ "/".
-->
<template>
  <div class="qr-root">
    <div v-if="loading" class="qr-empty">Đang tải mẫu tin...</div>
    <div v-else-if="templates.length === 0" class="qr-empty">Chưa có mẫu tin nhắn nhanh</div>
    <ul v-else class="qr-list">
      <li v-for="t in templates" :key="t.id">
        <button class="qr-item" :title="t.content" @click="pick(t)">
          <span v-if="t.shortcut" class="qr-item-shortcut">/{{ t.shortcut }}</span>
          <span v-else class="qr-item-shortcut qr-item-shortcut--empty">—</span>
          <span class="qr-item-thumb">
            <template v-if="photosOf(t).length">
              <img class="qr-thumb-img" :src="photosOf(t)[0]" alt="" />
              <span v-if="photosOf(t).length > 1" class="qr-thumb-more">+{{ photosOf(t).length - 1 }}</span>
            </template>
            <span v-else class="qr-thumb-none">—</span>
          </span>
          <span class="qr-item-preview">{{ preview(t.content) }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useMessageTemplates, type MessageTemplate } from '@/composables/use-message-templates';
import { useToast } from '@/composables/use-toast';

const { templates, loading, fetchTemplates, trackUse } = useMessageTemplates();
const toast = useToast();

function preview(content: string): string {
  const s = content.replace(/\s+/g, ' ').trim();
  return s.length > 60 ? s.slice(0, 60) + '…' : s;
}

function photosOf(t: MessageTemplate): string[] {
  const anyT = t as any;
  if (Array.isArray(anyT.tagIds) && anyT.tagIds.length) return anyT.tagIds;
  if (Array.isArray(anyT.contentRich?.attachments) && anyT.contentRich.attachments.length) return anyT.contentRich.attachments;
  return [];
}

function pick(t: MessageTemplate) {
  const text = t.contentRich?.text || t.content;
  const photos = photosOf(t);
  if (!text && !photos.length) return;
  window.dispatchEvent(new CustomEvent('chat:insert-suggestion', { detail: { text, photos } }));
  void trackUse(t.id);
  toast.success(photos.length ? 'Đã chèn tin + ảnh vào ô soạn' : 'Đã chèn vào ô soạn tin');
}

onMounted(() => { void fetchTemplates(); });
</script>

<style scoped>
.qr-root {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  background: #fff;
  overflow: hidden;
}
.qr-empty {
  padding: 14px 6px;
  text-align: center;
  font-size: 12.5px;
  color: #8a8d9c;
}
.qr-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
  overflow-y: auto;
  min-height: 0;
}
.qr-item {
  display: grid;
  grid-template-columns: 64px 36px 1fr;
  align-items: center;
  column-gap: 8px;
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #eaecef;
  border-radius: 9px;
  background: #fff;
  cursor: pointer;
  text-align: left;
  transition: all 0.13s;
}
.qr-item:hover {
  border-color: #2f80ed;
  background: rgba(47, 128, 237, 0.05);
}
.qr-item-thumb {
  position: relative;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.qr-thumb-img {
  width: 36px;
  height: 36px;
  object-fit: cover;
  border-radius: 7px;
  border: 1px solid #eaecef;
}
.qr-thumb-more {
  position: absolute;
  right: -3px;
  bottom: -3px;
  font-size: 9.5px;
  font-weight: 700;
  color: #475569;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  padding: 0 4px;
  min-width: 18px;
  text-align: center;
  line-height: 15px;
}
.qr-thumb-none {
  color: #c3c7d1;
  font-size: 14px;
}
.qr-item-shortcut {
  justify-self: start;
  font-size: 11px;
  font-weight: 600;
  color: #2f80ed;
  background: rgba(47, 128, 237, 0.1);
  padding: 2px 7px;
  border-radius: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.qr-item-shortcut--empty {
  color: #c3c7d1;
  background: transparent;
}
.qr-item-preview {
  font-size: 11.5px;
  color: #8a8d9c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
