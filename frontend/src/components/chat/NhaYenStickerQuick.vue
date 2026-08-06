<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <v-menu
    v-model="open"
    :close-on-content-click="true"
    location="top end"
    transition="scale-transition"
  >
    <template #activator="{ props: actProps }">
      <button v-bind="actProps" class="ny-btn" title="Sticker Nhà Yến">
        <SmileIcon :size="20" :stroke-width="1.5" />
      </button>
    </template>

    <div class="ny-popup">
      <div class="ny-label">Nhà Yến</div>
      <div class="ny-grid">
        <button
          v-for="s in stickers"
          :key="s.id"
          class="ny-item"
          :title="s.label"
          @click="onSelect(s)"
        >
          <img :src="s.url" :alt="s.label" />
        </button>
      </div>
    </div>
  </v-menu>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Smile as SmileIcon } from 'lucide-vue-next';
import stickerCamOn   from '@/assets/stickers/cam-on.jpg';
import stickerThaTim  from '@/assets/stickers/tha-tim.jpg';
import stickerXinChao from '@/assets/stickers/xin-chao.jpg';
import stickerDaA     from '@/assets/stickers/da-a.jpg';
import stickerXinLoi  from '@/assets/stickers/xin-loi.jpg';

interface NhaStickerItem {
  id: number;
  catId: number;
  type: number;
  url: string;
  localUrl: string;
  label: string;
}

const stickers: NhaStickerItem[] = [
  { id: 99901, catId: 9999, type: 1, url: stickerCamOn,   localUrl: stickerCamOn,   label: 'Em cảm ơn nha' },
  { id: 99902, catId: 9999, type: 1, url: stickerThaTim,  localUrl: stickerThaTim,  label: 'Em thả tim' },
  { id: 99903, catId: 9999, type: 1, url: stickerXinChao, localUrl: stickerXinChao, label: 'Em xin chào ạ' },
  { id: 99904, catId: 9999, type: 1, url: stickerDaA,     localUrl: stickerDaA,     label: 'Em dạ ạ' },
  { id: 99905, catId: 9999, type: 1, url: stickerXinLoi,  localUrl: stickerXinLoi,  label: 'Em xin lỗi' },
];

const emit = defineEmits<{
  select: [sticker: { id: number; catId: number; type: number; localUrl: string }];
}>();

const open = ref(false);

function onSelect(s: NhaStickerItem) {
  emit('select', { id: s.id, catId: s.catId, type: s.type, localUrl: s.localUrl });
  open.value = false;
}
</script>

<style scoped>
.ny-btn {
  width: 32px; height: 32px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 6px;
  cursor: pointer;
  color: var(--smax-grey-700, #4b5563);
  background: transparent;
  border: none;
  outline: none;
  padding: 0;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.12s, color 0.12s;
}
.ny-btn:hover { background: var(--smax-grey-100, #f5f6fa); color: var(--smax-primary, #2962ff); }
.ny-btn:focus-visible { outline: 2px solid var(--smax-primary-soft, #bbdefb); outline-offset: -1px; }

.ny-popup {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  padding: 10px 10px 8px;
}
.ny-label {
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 6px;
  padding: 0 2px;
}
.ny-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.ny-item {
  width: 150px; height: 150px;
  display: flex; align-items: center; justify-content: center;
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 4px;
  cursor: pointer;
  transition: all 0.12s ease;
  flex-shrink: 0;
}
.ny-item:hover {
  background: #ffe4f0;
  border-color: #f472b6;
  transform: scale(1.08);
}
.ny-item img {
  max-width: 100%; max-height: 100%;
  object-fit: contain;
}
</style>
