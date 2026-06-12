<!--
  MediaTabPanel — cột 4 tab "Media" (gộp Picker Media + Automation, anh chốt 2026-06-12).
  4 sub-tab: Ảnh / Video / Tệp / Khối. Ảnh/Video/Tệp = kho media (tái dùng logic
  MediaPickerPopover: listMedia + sendMediaToConversation + sendAlbumToConversation).
  Khối = nhúng AutomationBlocksPanel (kịch bản nhiều tin, có xem trước). Mọi thứ gửi
  THẲNG vào conversation đang mở. Atlas v2 (token --at-*, action #1786be) + Lucide icon,
  KHÔNG emoji. Mockup duyệt: docs/mockup-media-tab-merge-atlas-v2-20260612.html.
-->
<template>
  <div class="mtp airtable-scope">
    <!-- ── Sub-tabs Ảnh / Video / Tệp / Khối (kiểu .at-roletab) ── -->
    <div class="mtp-subtabs" role="tablist">
      <button
        v-for="t in SUBTABS"
        :key="t.key"
        class="mtp-st"
        :class="{ active: subTab === t.key }"
        role="tab"
        :aria-selected="subTab === t.key"
        @click="setSubTab(t.key)"
      >
        <component :is="t.icon" :size="14" :stroke-width="1.9" />
        {{ t.label }}
        <span v-if="t.key !== 'block' && counts[t.key] != null" class="mtp-cnt">{{ counts[t.key] }}</span>
      </button>
    </div>

    <!-- ════════ KHỐI: nhúng AutomationBlocksPanel sẵn có ════════ -->
    <AutomationBlocksPanel
      v-if="subTab === 'block'"
      :conversation-id="conversationId"
      :contact="contact"
      :owner-nick-id="ownerNickId"
      :nick-name="nickName"
    />

    <!-- ════════ ẢNH / VIDEO / TỆP: kho media ════════ -->
    <template v-else>
      <!-- Search dùng CHUNG cho 3 sub-tab + nút Lọc (gộp Công/Riêng + lọc sâu) -->
      <div class="mtp-search">
        <span class="mtp-inp">
          <SearchIcon :size="14" :stroke-width="1.9" />
          <input v-model="search" :placeholder="searchPlaceholder" @input="debouncedReload" />
        </span>
        <button class="mtp-fbtn" :class="{ on: showFilter }" @click="showFilter = !showFilter">
          <FilterIcon :size="13" :stroke-width="1.9" />
          Lọc<span class="mtp-vis">· {{ visLabel }}</span>
        </button>
      </div>

      <!-- Bảng lọc (ẩn/hiện): Quyền + sắp xếp + thời gian + cỡ + tag -->
      <div v-if="showFilter" class="mtp-filter">
        <div class="mtp-frow">
          <span class="mtp-flabel">Quyền</span>
          <div class="mtp-seg">
            <button :class="{ on: visFilter === '' }" @click="setVis('')">Tất cả</button>
            <button :class="{ on: visFilter === 'public' }" @click="setVis('public')">Công khai</button>
            <button :class="{ on: visFilter === 'private' }" @click="setVis('private')">Riêng tư</button>
          </div>
        </div>
        <div class="mtp-frow">
          <select v-model="sortBy" class="mtp-sel" @change="reload">
            <option value="recent">Gần đây dùng</option>
            <option value="newest">Mới tải lên</option>
            <option value="most_used">Hay dùng nhất</option>
            <option value="name">Tên A→Z</option>
          </select>
          <select v-model="sinceBy" class="mtp-sel" @change="reload">
            <option value="">Mọi lúc</option>
            <option value="7d">7 ngày</option>
            <option value="30d">30 ngày</option>
            <option value="90d">90 ngày</option>
          </select>
          <select v-model="sizeBy" class="mtp-sel" @change="reload">
            <option value="">Mọi cỡ</option>
            <option value="small">&lt; 1MB</option>
            <option value="medium">1–10MB</option>
            <option value="large">&gt; 10MB</option>
          </select>
          <input v-model="tagFilter" class="mtp-taginp" placeholder="tag" @input="debouncedReload" />
        </div>
      </div>

      <!-- Thanh chọn album — CHỈ khi đang xem ẢNH (Zalo album = ảnh) -->
      <div v-if="subTab === 'image'" class="mtp-album">
        <label class="mtp-toggle">
          <input type="checkbox" :checked="multiMode" @change="toggleMultiMode" />
          Chọn nhiều ảnh (album)
        </label>
        <template v-if="multiMode">
          <span class="mtp-acount">{{ picked.size }}/12</span>
          <button class="mtp-send-album" :disabled="picked.size === 0 || sendingAlbum" @click="sendAlbum">
            <SendIcon :size="13" :stroke-width="1.9" />
            {{ sendingAlbum ? 'Đang gửi…' : `Gửi ${picked.size || ''} ảnh` }}
          </button>
        </template>
      </div>

      <!-- Body cuộn -->
      <div class="mtp-body">
        <div v-if="loading" class="mtp-empty">Đang tải…</div>
        <div v-else-if="items.length === 0" class="mtp-empty">
          Không có {{ kindLabel }} nào khớp. Tải lên ở trang <b>Kho ảnh</b> hoặc chuột phải tin nhắn → Lưu vào Media.
        </div>

        <!-- TỆP: list theo dòng (sale đọc rõ tên) -->
        <div v-else-if="subTab === 'file'" class="mtp-list">
          <button
            v-for="a in items"
            :key="a.id"
            class="mtp-frow-item"
            :disabled="sending === a.id"
            @click="send(a)"
          >
            <span class="mtp-ficon" :style="{ background: fileIcon(a.name).bg, color: fileIcon(a.name).fg }">{{ fileIcon(a.name).label }}</span>
            <span class="mtp-finfo">
              <span class="mtp-fname" :title="a.name">{{ a.name }}</span>
              <span class="mtp-fmeta">{{ fmtSize(a.sizeBytes) }}</span>
            </span>
            <span v-if="sending === a.id" class="mtp-fsending">Đang gửi…</span>
            <span v-else class="mtp-fsend"><SendIcon :size="13" :stroke-width="1.9" /></span>
          </button>
        </div>

        <!-- ẢNH/VIDEO: grid thumbnail -->
        <div v-else class="mtp-grid">
          <button
            v-for="a in items"
            :key="a.id"
            class="mtp-cell"
            :class="{ picked: picked.has(a.id) }"
            :disabled="sending === a.id || sendingAlbum"
            @click="onCellClick(a)"
          >
            <img v-if="a.thumbnailUrl" :src="a.thumbnailUrl" loading="lazy" alt="" />
            <span v-else class="mtp-ph">
              <ImageIcon v-if="a.kind === 'image'" :size="20" :stroke-width="1.6" />
              <VideoIcon v-else :size="20" :stroke-width="1.6" />
            </span>
            <template v-if="a.kind === 'video'">
              <span class="mtp-vplay"><PlayIcon :size="12" fill="currentColor" :stroke-width="0" /></span>
              <span v-if="a.durationSec" class="mtp-vdur">{{ fmtDuration(a.durationSec) }}</span>
            </template>
            <span class="mtp-cname">{{ a.name }}</span>
            <span v-if="multiMode && picked.has(a.id)" class="mtp-pick">{{ pickIndex(a.id) }}</span>
            <span v-if="sending === a.id" class="mtp-sending">Đang gửi…</span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  listMedia, sendMediaToConversation, sendAlbumToConversation,
  type MediaAssetItem, type ListMediaParams,
} from '@/api/media';
import type { Contact } from '@/composables/use-contacts';
import { useToast } from '@/composables/use-toast';
import AutomationBlocksPanel from './AutomationBlocksPanel.vue';
import {
  Image as ImageIcon,
  Video as VideoIcon,
  FileText as FileTextIcon,
  Boxes as BoxesIcon,
  Search as SearchIcon,
  Filter as FilterIcon,
  Send as SendIcon,
  Play as PlayIcon,
} from 'lucide-vue-next';

const props = defineProps<{
  conversationId: string;
  contact?: Contact | null;
  ownerNickId?: string | null;
  nickName?: string | null;
}>();

const toast = useToast();

type SubKind = 'image' | 'video' | 'file' | 'block';
const SUBTABS: { key: SubKind; label: string; icon: any }[] = [
  { key: 'image', label: 'Ảnh', icon: ImageIcon },
  { key: 'video', label: 'Video', icon: VideoIcon },
  { key: 'file', label: 'Tệp', icon: FileTextIcon },
  { key: 'block', label: 'Khối', icon: BoxesIcon },
];

const subTab = ref<SubKind>('image');
const items = ref<MediaAssetItem[]>([]);
const loading = ref(false);
const search = ref('');
const sending = ref<string | null>(null);

// Đếm để hiện badge trên sub-tab (chỉ cập nhật cho kind đang xem; null = chưa biết).
const counts = ref<Record<string, number | null>>({ image: null, video: null, file: null });

const showFilter = ref(false);
const visFilter = ref<'' | 'public' | 'private'>('');
const sortBy = ref<'recent' | 'newest' | 'most_used' | 'name'>('recent');
const sinceBy = ref<'' | '7d' | '30d' | '90d'>('');
const sizeBy = ref<'' | 'small' | 'medium' | 'large'>('');
const tagFilter = ref('');

// Album (chỉ ảnh).
const multiMode = ref(false);
const picked = ref<Set<string>>(new Set());
const sendingAlbum = ref(false);

const kindLabel = computed(() => ({ image: 'ảnh', video: 'video', file: 'tệp', block: 'khối' }[subTab.value]));
const searchPlaceholder = computed(() => ({ image: 'Tìm ảnh…', video: 'Tìm video…', file: 'Tìm tệp…', block: '' }[subTab.value]));
const visLabel = computed(() => ({ '': 'Tất cả', public: 'Công khai', private: 'Riêng tư' }[visFilter.value]));

// Icon + màu theo định dạng tệp (sale nhận diện nhanh PDF/Excel/Word) — giữ y MediaPickerPopover.
function fileIcon(name: string): { label: string; bg: string; fg: string } {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return { label: 'PDF', bg: '#fdeceb', fg: '#c0392b' };
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { label: 'XLS', bg: '#e7f7ef', fg: '#1e7e45' };
  if (['doc', 'docx'].includes(ext)) return { label: 'DOC', bg: '#e4f1f8', fg: '#1a5cc0' };
  if (['ppt', 'pptx'].includes(ext)) return { label: 'PPT', bg: '#fdeee4', fg: '#c75b1e' };
  if (['zip', 'rar', '7z'].includes(ext)) return { label: 'ZIP', bg: '#eae6ff', fg: '#6b4fb0' };
  return { label: (ext || 'FILE').slice(0, 4).toUpperCase(), bg: '#eef0f2', fg: '#41454d' };
}

function fmtSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  const MB = 1024 * 1024;
  return bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, '0')}`;
}

let timer: ReturnType<typeof setTimeout> | null = null;
function debouncedReload() { if (timer) clearTimeout(timer); timer = setTimeout(reload, 300); }

function setSubTab(k: SubKind) {
  if (subTab.value === k) return;
  subTab.value = k;
  if (k !== 'image') { multiMode.value = false; picked.value = new Set(); } // album chỉ cho ảnh
  if (k !== 'block') reload();
}
function setVis(v: '' | 'public' | 'private') { visFilter.value = v; reload(); }

function toggleMultiMode() {
  multiMode.value = !multiMode.value;
  if (!multiMode.value) picked.value = new Set();
}

function sizeRange(): { sizeMin?: number; sizeMax?: number } {
  const MB = 1024 * 1024;
  if (sizeBy.value === 'small') return { sizeMax: MB };
  if (sizeBy.value === 'medium') return { sizeMin: MB, sizeMax: 10 * MB };
  if (sizeBy.value === 'large') return { sizeMin: 10 * MB };
  return {};
}

async function reload() {
  if (subTab.value === 'block') return;
  loading.value = true;
  try {
    const params: ListMediaParams = {
      kind: subTab.value,
      q: search.value || undefined,
      visibility: visFilter.value || undefined,
      tag: tagFilter.value || undefined,
      since: sinceBy.value || undefined,
      sort: sortBy.value,
      limit: 40,
      ...sizeRange(),
    };
    items.value = await listMedia(params);
    counts.value[subTab.value] = items.value.length;
  } catch (e: any) {
    toast.warning(e?.response?.data?.error || 'Không tải được kho');
  } finally {
    loading.value = false;
  }
}

function onCellClick(a: MediaAssetItem) {
  if (multiMode.value && a.kind === 'image') { togglePick(a); return; }
  send(a);
}
function togglePick(a: MediaAssetItem) {
  const next = new Set(picked.value);
  if (next.has(a.id)) {
    next.delete(a.id);
  } else {
    if (next.size >= 12) { toast.warning('Tối đa 12 ảnh/lần'); return; }
    next.add(a.id);
  }
  picked.value = next;
}
function pickIndex(id: string): string {
  const idx = [...picked.value].indexOf(id);
  return idx >= 0 ? String(idx + 1) : '';
}

async function send(a: MediaAssetItem) {
  if (sending.value) return;
  sending.value = a.id;
  try {
    await sendMediaToConversation(a.id, props.conversationId);
    toast.success(`Đã gửi "${a.name}"`);
  } catch (e: any) {
    toast.warning(e?.response?.data?.error || 'Gửi thất bại');
  } finally {
    sending.value = null;
  }
}

async function sendAlbum() {
  if (sendingAlbum.value || picked.value.size === 0) return;
  sendingAlbum.value = true;
  try {
    const ids = [...picked.value];
    const res = await sendAlbumToConversation(ids, props.conversationId);
    toast.success(`Đã gửi album ${res.sent} ảnh`);
    picked.value = new Set();
    multiMode.value = false;
  } catch (e: any) {
    toast.warning(e?.response?.data?.error || 'Gửi album thất bại');
  } finally {
    sendingAlbum.value = false;
  }
}

onMounted(reload);
</script>

<style scoped>
.mtp {
  display: flex; flex-direction: column; min-height: 0; height: 100%;
  --at-action: #1786be; --at-action-soft: #e4f1f8; --at-ink: #141a24;
  --at-body: #475066; --at-hint: #8b93a7; --at-hairline: #e7eaf0;
  --at-canvas: #fff; --at-surface-soft: #f1f4f9; --mono: "Roboto Mono", monospace;
}

/* sub-tabs (kiểu .at-roletab) */
.mtp-subtabs { display: flex; padding: 0 8px; border-bottom: 1px solid var(--at-hairline); flex-shrink: 0; }
.mtp-st {
  flex: 1; border: none; background: transparent; cursor: pointer; font-family: inherit;
  font-size: 12px; font-weight: 600; color: var(--at-body); padding: 9px 4px 8px;
  border-bottom: 2.5px solid transparent; display: inline-flex; align-items: center;
  justify-content: center; gap: 4px;
}
.mtp-st:hover { color: var(--at-ink); }
.mtp-st.active { color: var(--at-action); border-bottom-color: var(--at-action); }
.mtp-cnt {
  font-size: 10px; font-weight: 700; background: var(--at-surface-soft); color: var(--at-body);
  border-radius: 9999px; padding: 0 6px; font-family: var(--mono);
}
.mtp-st.active .mtp-cnt { background: var(--at-action-soft); color: var(--at-action); }

/* search dùng chung + nút Lọc */
.mtp-search { display: flex; gap: 6px; align-items: center; padding: 9px 12px 8px; flex-shrink: 0; }
.mtp-inp {
  flex: 1; display: flex; align-items: center; gap: 6px; border: 1px solid var(--at-hairline);
  border-radius: 8px; padding: 5px 10px; color: var(--at-hint);
}
.mtp-inp input { border: none; outline: none; font: inherit; font-size: 12px; flex: 1; color: var(--at-ink); background: transparent; }
.mtp-fbtn {
  border: 1px solid var(--at-hairline); background: #fff; border-radius: 8px; padding: 6px 9px;
  font-size: 11.5px; cursor: pointer; color: var(--at-body); white-space: nowrap;
  display: inline-flex; align-items: center; gap: 5px; font-family: inherit;
}
.mtp-fbtn.on { background: var(--at-action); border-color: var(--at-action); color: #fff; }
.mtp-fbtn.on .mtp-vis { color: rgba(255,255,255,.85); }
.mtp-vis { font-size: 10px; font-weight: 700; color: var(--at-action); }

/* bảng lọc */
.mtp-filter { padding: 0 12px 8px; flex-shrink: 0; display: flex; flex-direction: column; gap: 7px; }
.mtp-frow { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.mtp-flabel { font-size: 11px; color: var(--at-hint); font-weight: 600; }
.mtp-seg { display: inline-flex; border: 1px solid var(--at-hairline); border-radius: 9999px; overflow: hidden; }
.mtp-seg button {
  border: none; background: #fff; font-family: inherit; font-size: 11px; padding: 4px 11px;
  cursor: pointer; color: var(--at-body); border-right: 1px solid var(--at-hairline);
}
.mtp-seg button:last-child { border-right: none; }
.mtp-seg button.on { background: var(--at-action-soft); color: var(--at-action); font-weight: 700; }
.mtp-sel { border: 1px solid var(--at-hairline); border-radius: 6px; padding: 4px 8px; font-size: 11.5px; color: var(--at-ink); background: #fff; outline: none; font-family: inherit; }
.mtp-taginp { border: 1px solid var(--at-hairline); border-radius: 6px; padding: 4px 9px; font-size: 11.5px; width: 70px; outline: none; }

/* album bar */
.mtp-album { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: var(--at-ink);
  background: var(--at-surface-soft); border-radius: 6px; padding: 6px 9px; margin: 0 12px 8px; flex-shrink: 0; }
.mtp-toggle { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; user-select: none; }
.mtp-toggle input { accent-color: var(--at-action); cursor: pointer; }
.mtp-acount { color: var(--at-action); font-weight: 700; font-family: var(--mono); }
.mtp-send-album {
  margin-left: auto; border: none; background: var(--at-action); color: #fff; border-radius: 6px;
  padding: 5px 11px; font-size: 11.5px; font-weight: 700; cursor: pointer;
  display: inline-flex; align-items: center; gap: 5px; font-family: inherit;
}
.mtp-send-album:disabled { opacity: .45; cursor: default; }

/* body */
.mtp-body { flex: 1; overflow-y: auto; padding: 2px 12px 12px; }
.mtp-empty { padding: 24px 12px; text-align: center; font-size: 12.5px; color: var(--at-hint); line-height: 1.5; }

/* grid ảnh/video */
.mtp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
.mtp-cell {
  position: relative; aspect-ratio: 1; border-radius: 9px; overflow: hidden; cursor: pointer;
  border: 1.5px solid transparent; background: #e4e9f0; padding: 0;
}
.mtp-cell:hover { border-color: var(--at-action); }
.mtp-cell:disabled { opacity: .6; }
.mtp-cell.picked { border-color: var(--at-action); box-shadow: 0 0 0 2px var(--at-action-soft); }
.mtp-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
.mtp-ph { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #aab2c2; }
.mtp-cname {
  position: absolute; left: 0; right: 0; bottom: 0; font-size: 9px; color: #fff;
  background: linear-gradient(transparent, rgba(0,0,0,.72)); padding: 11px 5px 4px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.mtp-vplay {
  position: absolute; inset: 0; margin: auto; width: 26px; height: 26px; border-radius: 9999px;
  background: rgba(0,0,0,.5); color: #fff; display: flex; align-items: center; justify-content: center; pointer-events: none;
}
.mtp-vdur {
  position: absolute; top: 5px; right: 5px; background: rgba(0,0,0,.66); color: #fff; font-size: 9px;
  padding: 1px 5px; border-radius: 5px; font-family: var(--mono); pointer-events: none;
}
.mtp-pick {
  position: absolute; top: 4px; left: 4px; width: 20px; height: 20px; border-radius: 9999px;
  background: var(--at-action); color: #fff; font-size: 11px; font-weight: 800; display: flex;
  align-items: center; justify-content: center; font-family: var(--mono);
}
.mtp-sending { position: absolute; inset: 0; background: rgba(255,255,255,.8); display: flex; align-items: center; justify-content: center; font-size: 11px; color: var(--at-ink); }

/* list tệp */
.mtp-list { display: flex; flex-direction: column; }
.mtp-frow-item {
  display: grid; grid-template-columns: 34px 1fr auto; gap: 9px; align-items: center; width: 100%;
  padding: 7px 6px; border: none; background: none; border-bottom: 1px solid var(--at-hairline);
  cursor: pointer; text-align: left; border-radius: 6px;
}
.mtp-frow-item:last-child { border-bottom: none; }
.mtp-frow-item:hover { background: var(--at-surface-soft); }
.mtp-frow-item:disabled { opacity: .55; }
.mtp-ficon { width: 34px; height: 34px; flex-shrink: 0; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; }
.mtp-finfo { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.mtp-fname { font-size: 12.5px; color: var(--at-ink); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mtp-fmeta { font-size: 11px; color: var(--at-hint); }
.mtp-fsend { color: var(--at-action); display: inline-flex; align-items: center; }
.mtp-fsending { font-size: 11px; color: var(--at-hint); }
</style>
