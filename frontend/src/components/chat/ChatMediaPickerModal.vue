<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  ChatMediaPickerModal — popup chọn ảnh từ kho Media để chèn vào composer.
  Layout: sidebar thư mục (trái) + main grid ảnh cuộn vô chậm/vô tận (phải).
  Tính năng: chọn tối đa 50 ảnh, Ctrl+A chọn hết trang, upload từ máy auto-add pending,
  infinite scroll dùng IntersectionObserver, tạo nhanh thư mục, tìm kiếm thư mục.
  Giao diện thiết kế theo Pancake. 2026-07-13 anh chốt.
-->
<template>
  <Teleport to="body">
    <Transition name="cmp-fade">
      <div v-if="visible" class="cmp-overlay" @mousedown.self="$emit('close')">
        <div class="cmp-modal" @keydown="onKeydown" tabindex="-1" ref="modalRef">

          <!-- ── HEADER ── -->
          <header class="cmp-header">
            <span class="cmp-title">
              Thư mục ảnh
            </span>
            <div class="cmp-header-actions">
              <div class="cmp-search-wrap cmp-search-wrap--header">
                <SearchIcon :size="14" :stroke-width="1.8" class="cmp-search-icon" />
                <input
                  ref="searchInputRef"
                  v-model="search"
                  class="cmp-search"
                  placeholder="Tìm kiếm ảnh bằng tên"
                  @input="debouncedReload"
                />
              </div>
              <button class="cmp-close" @click="$emit('close')" title="Đóng (Esc)">
                <XIcon :size="18" :stroke-width="2" />
              </button>
            </div>
          </header>

          <!-- ── BODY: sidebar + grid ── -->
          <div class="cmp-body">

            <!-- Sidebar thư mục -->
            <aside class="cmp-sidebar">
              <!-- Nhóm tìm kiếm thư mục & thêm thư mục mới -->
              <div class="cmp-sidebar-search-group">
                <div class="cmp-search-wrap cmp-search-wrap--sidebar">
                  <SearchIcon :size="13" :stroke-width="1.8" class="cmp-search-icon" />
                  <input
                    v-model="folderSearch"
                    class="cmp-search cmp-search--sidebar"
                    placeholder="Tìm kiếm thư..."
                  />
                  <span class="cmp-sidebar-search-suffix">Aa</span>
                </div>
                <button class="cmp-btn-add-folder" title="Tạo thư mục mới" @click="handleCreateFolder">
                  <FolderPlusIcon :size="15" :stroke-width="1.8" />
                </button>
              </div>

              <!-- Thư mục hệ thống cố định -->
              <button
                class="cmp-folder-item"
                :class="{ active: activeFolder === '__recent' }"
                @click="setFolder('__recent')"
              >
                <ClockIcon :size="14" :stroke-width="1.8" />
                <span class="cmp-folder-name">Tải lên gần đây</span>
              </button>
              <button
                class="cmp-folder-item"
                :class="{ active: activeFolder === '__favorite' }"
                @click="setFolder('__favorite')"
              >
                <HeartIcon :size="14" :stroke-width="1.8" />
                <span class="cmp-folder-name">Yêu thích</span>
                <span v-if="favoriteCount > 0" class="cmp-folder-count">{{ favoriteCount }}</span>
              </button>
              <button
                class="cmp-folder-item"
                :class="{ active: activeFolder === '' }"
                @click="setFolder('')"
              >
                <GridIcon :size="14" :stroke-width="1.8" />
                <span class="cmp-folder-name">Tất cả ảnh</span>
              </button>

              <!-- Thư mục dự án từ API -->
              <div class="cmp-sidebar-scroll">
                <div
                  v-for="f in filteredFolders"
                  :key="f.id"
                  class="cmp-folder-item-wrapper"
                  :class="{ active: activeFolder === f.id }"
                >
                  <button
                    class="cmp-folder-item-btn"
                    @click="setFolder(f.id)"
                  >
                    <FolderIcon :size="14" :stroke-width="1.8" />
                    <span class="cmp-folder-name">{{ f.name }}</span>
                    <span v-if="folderCounts[f.id]" class="cmp-folder-count">{{ folderCounts[f.id] }}</span>
                  </button>

                  <!-- Nút 3 chấm xuất hiện khi hover -->
                  <button
                    class="cmp-folder-more-btn"
                    title="Lựa chọn thư mục"
                    @click.stop="openFolderMenu($event, f.id)"
                  >
                    <MoreHorizontalIcon :size="13" />
                  </button>
                </div>
              </div>
            </aside>

            <!-- Grid ảnh -->
            <main class="cmp-main" ref="gridContainerRef" @scroll.passive="onGridScroll">
              <!-- Đang tải lần đầu -->
              <div v-if="loading && items.length === 0" class="cmp-empty">
                <div class="cmp-spinner" />
                Đang tải kho ảnh…
              </div>

              <!-- Rỗng -->
              <div v-else-if="!loading && items.length === 0" class="cmp-empty">
                <ImageIcon :size="32" :stroke-width="1.2" class="cmp-empty-icon" />
                <div>Không có ảnh nào khớp.</div>
                <div class="cmp-empty-sub">Bấm <b>Thêm ảnh</b> ở góc dưới để tải ảnh lên.</div>
              </div>

              <!-- Grid -->
              <div v-else class="cmp-grid">
                <button
                  v-for="a in items"
                  :key="a.id"
                  class="cmp-cell"
                  :class="{ picked: pickedSet.has(a.id) }"
                  :title="a.name"
                  @click="togglePick(a)"
                >
                  <img v-if="a.thumbnailUrl || a.url" :src="a.thumbnailUrl || a.url!" loading="lazy" alt="" />
                  <span v-else class="cmp-cell-ph">
                    <ImageIcon :size="20" :stroke-width="1.4" />
                  </span>
                  <!-- Số thứ tự chọn -->
                  <span v-if="pickedSet.has(a.id)" class="cmp-cell-badge">
                    {{ pickOrder(a.id) }}
                  </span>
                  <!-- Overlay tên ảnh -->
                  <span class="cmp-cell-name">{{ a.name }}</span>
                </button>

                <!-- Sentinel dùng cho infinite scroll -->
                <div ref="sentinelRef" class="cmp-sentinel" />
              </div>

              <!-- Loading more -->
              <div v-if="loadingMore" class="cmp-load-more">
                <div class="cmp-spinner cmp-spinner--sm" />
              </div>
            </main>
          </div>

          <!-- ── FOOTER: Thiết kế theo Pancake ── -->
          <footer class="cmp-footer">
            <!-- Góc trái: các nút bổ trợ -->
            <div class="cmp-footer-left">
              <button class="cmp-foot-icon-btn" title="Trợ giúp">
                <HelpCircleIcon :size="16" :stroke-width="1.8" />
              </button>
              <button class="cmp-foot-icon-btn" title="Phím tắt">
                <KeyboardIcon :size="16" :stroke-width="1.8" />
              </button>
              <button class="cmp-foot-text-btn" title="Chọn tất cả (Ctrl+A)" @click="selectAll">
                <span class="cmp-foot-icon-a">A</span>
                Chọn tất cả
              </button>

              <!-- Nút hành động hàng loạt khi chọn ảnh (layout, thùng rác, badge huỷ nhanh) -->
              <template v-if="pickedList.length > 0">
                <span class="cmp-foot-divider"></span>
                <button class="cmp-foot-action-icon-btn" title="Đổi thư mục hàng loạt" @click="handleBulkMove">
                  <LayoutIcon :size="15" :stroke-width="1.8" />
                </button>
                <button class="cmp-foot-action-icon-btn cmp-foot-action-icon-btn--danger" title="Xóa các ảnh đã chọn" @click="handleBulkDelete">
                  <TrashIcon :size="15" :stroke-width="1.8" />
                </button>
                <span class="cmp-picked-badge" @click="pickedMap = new Map()">
                  Đã chọn {{ pickedList.length }} ảnh <span class="cmp-picked-badge-x">✕</span>
                </span>
              </template>
            </div>

            <!-- Góc phải: Thêm ảnh từ máy + Hủy / Chọn -->
            <div class="cmp-footer-right">
              <div class="cmp-upload-btn-group">
                <label class="cmp-btn-upload-footer" :class="{ loading: uploading }" title="Tải ảnh mới từ máy lên">
                  {{ uploading ? 'Đang tải…' : 'Thêm ảnh' }}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    style="display:none"
                    :disabled="uploading"
                    @change="onUploadFiles"
                  />
                </label>
                <button class="cmp-btn-more-options" title="Lựa chọn thêm" @click.stop="openUploadMenu($event)">
                  <MoreHorizontalIcon :size="16" :stroke-width="1.8" />
                </button>

                <!-- Input ẩn để upload thư mục -->
                <input
                  type="file"
                  webkitdirectory
                  directory
                  multiple
                  style="display:none"
                  ref="dirUploadInputRef"
                  @change="onUploadFolder"
                />
              </div>
              <button
                class="cmp-btn-confirm-action"
                :disabled="pickedList.length === 0"
                @click="onConfirm"
              >
                Chọn
              </button>
            </div>
          </footer>

          <!-- ── MENU POPOVER CHO FOLDER ── -->
          <div v-if="folderMenu.visible" class="cmp-popover-menu" :style="folderMenu.style">
            <button class="cmp-popover-item" @click="handleSendAllFolderImages">
              <SendIcon :size="14" class="pop-icon" /> Gửi toàn bộ ảnh
            </button>
            <button class="cmp-popover-item" @click="handleRenameFolder">
              <EditIcon :size="14" class="pop-icon" /> Sửa tên
            </button>
            <div class="pop-divider"></div>
            <button class="cmp-popover-item cmp-popover-item--danger" @click="handleDeleteFolder">
              <Trash2Icon :size="14" class="pop-icon" /> Xoá thư mục
            </button>
          </div>

          <!-- ── MENU POPOVER CHO UPLOAD FOOTER ── -->
          <div v-if="uploadMenu.visible" class="cmp-popover-menu" :style="uploadMenu.style">
            <button class="cmp-popover-item" @click="triggerFolderUpload">
              <FolderIcon :size="14" class="pop-icon" /> Tải lên thư mục
            </button>
            <button class="cmp-popover-item" @click="triggerFileUpload">
              <ImageIcon :size="14" class="pop-icon" /> Thêm ảnh
            </button>
          </div>

          <!-- Overlay đóng các menu khi click ra ngoài -->
          <div v-if="folderMenu.visible || uploadMenu.visible" class="cmp-popover-overlay" @click="closeAllMenus"></div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue';
import {
  Image as ImageIcon,
  Search as SearchIcon,
  X as XIcon,
  Clock as ClockIcon,
  Heart as HeartIcon,
  Folder as FolderIcon,
  FolderPlus as FolderPlusIcon,
  Grid as GridIcon,
  HelpCircle as HelpCircleIcon,
  Keyboard as KeyboardIcon,
  MoreHorizontal as MoreHorizontalIcon,
  Layout as LayoutIcon,
  Trash as TrashIcon,
  Send as SendIcon,
  Edit2 as EditIcon,
  Trash2 as Trash2Icon,
} from 'lucide-vue-next';
import {
  listMediaPaged, listMediaFolders, uploadMedia, createMediaFolder, bulkUpdateMedia, archiveMedia,
  updateMediaFolder, deleteMediaFolder,
  type MediaAssetItem, type ListMediaParams, type MediaFolder,
} from '@/api/media';
import { useToast } from '@/composables/use-toast';


// ── Props / Emits ─────────────────────────────────────────────────────────────
const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
  close: [];
  pick: [assets: MediaAssetItem[]];
}>();

// ── Composables ───────────────────────────────────────────────────────────────
const toast = useToast();

// ── Refs ──────────────────────────────────────────────────────────────────────
const modalRef = ref<HTMLElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);
const gridContainerRef = ref<HTMLElement | null>(null);
const sentinelRef = ref<HTMLElement | null>(null);

// ── State ─────────────────────────────────────────────────────────────────────
const items = ref<MediaAssetItem[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const search = ref('');
const folderSearch = ref('');
const uploading = ref(false);

// Phân trang infinite scroll
const PAGE_SIZE = 60;
const currentSkip = ref(0);
const hasMore = ref(true);

// Thư mục
const folders = ref<MediaFolder[]>([]);
const activeFolder = ref('__recent'); // __recent | __favorite | '' | folder.id
const folderCounts = ref<Record<string, number>>({});

// ── Popover menus state ──
const folderMenu = ref({
  visible: false,
  folderId: '',
  style: { top: '0px', left: '0px' }
});

const uploadMenu = ref({
  visible: false,
  style: { top: '0px', left: '0px' }
});

const dirUploadInputRef = ref<HTMLInputElement | null>(null);

// Lọc thư mục theo keyword tìm kiếm ở sidebar
const filteredFolders = computed(() => {
  const kw = folderSearch.value.trim().toLowerCase();
  if (!kw) return folders.value;
  return folders.value.filter(f => f.name.toLowerCase().includes(kw));
});

// Multi-select (tối đa 50)
const MAX_PICK = 50;
const pickedMap = ref<Map<string, MediaAssetItem>>(new Map());
const pickedSet = computed(() => new Set(pickedMap.value.keys()));
const pickedList = computed(() => Array.from(pickedMap.value.values()));
const pickOrderMap = computed(() => {
  const m = new Map<string, number>();
  let i = 1;
  for (const id of pickedMap.value.keys()) { m.set(id, i++); }
  return m;
});
function pickOrder(id: string) { return pickOrderMap.value.get(id) ?? 0; }

// Đếm yêu thích
const favoriteCount = ref(0);

// IntersectionObserver
let observer: IntersectionObserver | null = null;

// ── Debounce search ───────────────────────────────────────────────────────────
let searchTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedReload() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { resetAndReload(); }, 280);
}

// ── Folder helpers ────────────────────────────────────────────────────────────
function setFolder(id: string) {
  if (activeFolder.value === id) return;
  activeFolder.value = id;
  resetAndReload();
}

function buildParams(skip: number): ListMediaParams {
  const base: ListMediaParams = { kind: 'image', limit: PAGE_SIZE, skip, sort: 'newest' };
  if (search.value) base.q = search.value;
  if (activeFolder.value === '__recent') {
    base.sort = 'recent';
  } else if (activeFolder.value === '__favorite') {
    base.sort = 'newest';
  } else if (activeFolder.value) {
    base.folderId = activeFolder.value;
  }
  return base;
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function resetAndReload() {
  items.value = [];
  currentSkip.value = 0;
  hasMore.value = true;
  await loadPage(true);
}

async function loadPage(isFirst = false) {
  if (!hasMore.value) return;
  if (isFirst) loading.value = true;
  else loadingMore.value = true;
  try {
    const params = buildParams(currentSkip.value);
    const res = await listMediaPaged(params);
    let fetched = res.items as MediaAssetItem[];

    // Client-side filter yêu thích
    if (activeFolder.value === '__favorite') {
      fetched = fetched.filter(a => a.favorited);
    }

    items.value = isFirst ? fetched : [...items.value, ...fetched];
    currentSkip.value += PAGE_SIZE;
    hasMore.value = res.total > items.value.length;
  } catch (e: any) {
    toast.warning(e?.response?.data?.error || 'Không tải được kho ảnh');
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

async function loadFolders() {
  try {
    const all = await listMediaFolders();
    folders.value = all;

    // Tải đếm số lượng ảnh trong từng thư mục dự án
    for (const f of folders.value) {
      listMediaPaged({ kind: 'image', folderId: f.id, limit: 1 }).then(res => {
        folderCounts.value[f.id] = res.total;
      }).catch(() => {});
    }
  } catch { /* bỏ qua lỗi */ }

  // Đếm yêu thích
  try {
    const fav = await listMediaPaged({ kind: 'image', limit: 200, sort: 'newest' });
    favoriteCount.value = fav.items.filter((a: MediaAssetItem) => a.favorited).length;
  } catch { favoriteCount.value = 0; }
}

// ── Tạo thư mục mới (Pancake style) ──────────────────────────────────────────
async function handleCreateFolder() {
  const name = prompt('Nhập tên thư mục mới:');
  if (!name || !name.trim()) return;
  try {
    const res = await createMediaFolder(name.trim(), 'public');
    toast.success(`Đã tạo thư mục "${res.folder.name}"`);
    await loadFolders();
    setFolder(res.folder.id);
  } catch (e: any) {
    toast.error(e?.response?.data?.error || 'Không tạo được thư mục');
  }
}

// ── Quản lý Popover Menus ──
function openFolderMenu(e: MouseEvent, folderId: string) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const modalRect = modalRef.value?.getBoundingClientRect() || { top: 0, left: 0 };
  folderMenu.value = {
    visible: true,
    folderId,
    style: {
      top: `${rect.bottom - modalRect.top + 4}px`,
      left: `${rect.right - modalRect.left - 160}px`
    }
  };
}

function openUploadMenu(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const modalRect = modalRef.value?.getBoundingClientRect() || { top: 0, left: 0 };
  uploadMenu.value = {
    visible: true,
    style: {
      top: `${rect.top - modalRect.top - 86}px`,
      left: `${rect.left - modalRect.left - 60}px`
    }
  };
}

function closeAllMenus() {
  folderMenu.value.visible = false;
  uploadMenu.value.visible = false;
}

// Sửa tên thư mục
async function handleRenameFolder() {
  const folderId = folderMenu.value.folderId;
  const folder = folders.value.find(f => f.id === folderId);
  if (!folder) return;
  closeAllMenus();

  const newName = prompt('Nhập tên mới cho thư mục:', folder.name);
  if (!newName || !newName.trim() || newName.trim() === folder.name) return;

  try {
    await updateMediaFolder(folderId, newName.trim());
    toast.success('Đã sửa tên thư mục thành công');
    await loadFolders();
  } catch (e: any) {
    toast.error(e?.response?.data?.error || 'Đổi tên thư mục thất bại');
  }
}

// Xoá thư mục
async function handleDeleteFolder() {
  const folderId = folderMenu.value.folderId;
  const folder = folders.value.find(f => f.id === folderId);
  if (!folder) return;
  closeAllMenus();

  if (!confirm(`Bạn có chắc chắn muốn xoá thư mục "${folder.name}" không? Các ảnh trong thư mục sẽ không bị xoá.`)) return;

  try {
    await deleteMediaFolder(folderId);
    toast.success('Đã xoá thư mục thành công');
    if (activeFolder.value === folderId) {
      activeFolder.value = '__recent';
      await resetAndReload();
    }
    await loadFolders();
  } catch (e: any) {
    toast.error(e?.response?.data?.error || 'Xoá thư mục thất bại');
  }
}

// Gửi toàn bộ ảnh trong thư mục
async function handleSendAllFolderImages() {
  const folderId = folderMenu.value.folderId;
  closeAllMenus();

  try {
    const res = await listMediaPaged({ kind: 'image', folderId, limit: 200 });
    const assets = res.items;
    if (assets.length === 0) {
      toast.warning('Thư mục này không có ảnh nào để gửi');
      return;
    }
    if (!confirm(`Bạn có chắc chắn muốn gửi toàn bộ ${assets.length} ảnh trong thư mục này không?`)) return;

    emit('pick', assets);
    emit('close');
  } catch (e: any) {
    toast.error('Không lấy được danh sách ảnh trong thư mục');
  }
}

// Trigger upload file/folder
function triggerFileUpload() {
  closeAllMenus();
  const fileInput = document.querySelector('.cmp-btn-upload-footer input[type="file"]') as HTMLInputElement;
  fileInput?.click();
}

function triggerFolderUpload() {
  closeAllMenus();
  dirUploadInputRef.value?.click();
}

// Tải lên thư mục
async function onUploadFolder(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files || [])
    .filter(f => f.type.startsWith('image/'));
  if (!files.length) return;
  uploading.value = true;
  try {
    const res = await uploadMedia(files, {
      visibility: 'public',
      folderId: (activeFolder.value && !activeFolder.value.startsWith('__')) ? activeFolder.value : undefined
    });
    toast.success(`Đã tải lên ${res.assets.length} ảnh từ thư mục`);
    await resetAndReload();
    await loadFolders();
  } catch (e: any) {
    toast.error(e?.response?.data?.error || 'Tải ảnh thư mục lên thất bại');
  } finally {
    uploading.value = false;
    (e.target as HTMLInputElement).value = '';
  }
}

// ── Infinite scroll ───────────────────────────────────────────────────────────
function setupObserver() {
  if (observer) observer.disconnect();
  observer = new IntersectionObserver(entries => {
    if (entries[0]?.isIntersecting && !loading.value && !loadingMore.value && hasMore.value) {
      loadPage();
    }
  }, { root: gridContainerRef.value, rootMargin: '120px' });
  if (sentinelRef.value) observer.observe(sentinelRef.value);
}

watch(() => props.visible, async (v) => {
  if (v) {
    search.value = '';
    folderSearch.value = '';
    activeFolder.value = '__recent';
    pickedMap.value = new Map();
    items.value = [];
    hasMore.value = true;
    currentSkip.value = 0;
    await loadFolders();
    await resetAndReload();
    await nextTick();
    modalRef.value?.focus();
    setupObserver();
  } else {
    observer?.disconnect();
  }
});

watch(() => items.value.length, async () => {
  await nextTick();
  if (sentinelRef.value && observer) {
    observer.observe(sentinelRef.value);
  }
});

// ── Select / deselect ─────────────────────────────────────────────────────────
function togglePick(a: MediaAssetItem) {
  const map = new Map(pickedMap.value);
  if (map.has(a.id)) {
    map.delete(a.id);
  } else {
    if (map.size >= MAX_PICK) {
      toast.warning(`Tối đa ${MAX_PICK} ảnh mỗi lần`);
      return;
    }
    map.set(a.id, a);
  }
  pickedMap.value = map;
}

function selectAll() {
  const map = new Map(pickedMap.value);
  for (const a of items.value) {
    if (map.size >= MAX_PICK) break;
    if (!map.has(a.id)) map.set(a.id, a);
  }
  pickedMap.value = map;
}

// ── Keyboard ──────────────────────────────────────────────────────────────────
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { emit('close'); return; }
  if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
    if (document.activeElement !== searchInputRef.value) {
      e.preventDefault();
      selectAll();
    }
  }
}

// ── Upload từ máy ─────────────────────────────────────────────────────────────
async function onUploadFiles(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files || []);
  if (!files.length) return;
  uploading.value = true;
  try {
    const res = await uploadMedia(files, {
      visibility: 'public',
      // Nếu đang active một folder dự án thật, upload thẳng vào folder đó
      folderId: (activeFolder.value && !activeFolder.value.startsWith('__')) ? activeFolder.value : undefined
    });
    toast.success(`Đã tải lên ${res.assets.length} ảnh`);
    await resetAndReload();
    await loadFolders(); // Reload số lượng ảnh thư mục
    const uploadedNames = new Set(files.map(f => f.name));
    const map = new Map(pickedMap.value);
    for (const a of items.value) {
      if (uploadedNames.has(a.name) && !map.has(a.id) && map.size < MAX_PICK) {
        map.set(a.id, a);
      }
    }
    pickedMap.value = map;
  } catch (e: any) {
    toast.error(e?.response?.data?.error || 'Tải ảnh lên thất bại');
  } finally {
    uploading.value = false;
    (e.target as HTMLInputElement).value = '';
  }
}

// ── Bulk Actions ─────────────────────────────────────────────────────────────
async function handleBulkMove() {
  if (pickedList.value.length === 0) return;
  const folderNames = folders.value.map((f, i) => `${i + 1}. ${f.name}`).join('\n');
  const choose = prompt(
    `Chọn thư mục để chuyển ${pickedList.value.length} ảnh:\n\n${folderNames}\n\nNhập số thứ tự thư mục:`
  );
  if (!choose) return;
  const idx = parseInt(choose.trim()) - 1;
  const targetFolder = folders.value[idx];
  if (!targetFolder) {
    toast.warning('Lựa chọn không hợp lệ');
    return;
  }

  try {
    const ids = pickedList.value.map(a => a.id);
    await bulkUpdateMedia(ids, { folderId: targetFolder.id });
    toast.success(`Đã di chuyển ${ids.length} ảnh sang thư mục "${targetFolder.name}"`);
    pickedMap.value = new Map();
    await resetAndReload();
    await loadFolders();
  } catch (e: any) {
    toast.error(e?.response?.data?.error || 'Di chuyển ảnh hàng loạt thất bại');
  }
}

async function handleBulkDelete() {
  if (pickedList.value.length === 0) return;
  if (!confirm(`Bạn có chắc chắn muốn xóa ${pickedList.value.length} ảnh đã chọn?`)) return;

  try {
    const ids = pickedList.value.map(a => a.id);
    toast.push(`🗑️ Đang xóa ${ids.length} ảnh…`);

    await Promise.all(ids.map(id => archiveMedia(id)));

    toast.success(`Đã xóa ${ids.length} ảnh`);
    pickedMap.value = new Map();
    await resetAndReload();
    await loadFolders();
  } catch (e: any) {
    toast.error(e?.response?.data?.error || 'Xóa ảnh hàng loạt thất bại');
  }
}

// ── Confirm ───────────────────────────────────────────────────────────────────
function onConfirm() {
  if (pickedList.value.length === 0) return;
  emit('pick', pickedList.value);
  emit('close');
}

function onGridScroll() {
  const el = gridContainerRef.value;
  if (!el || loading.value || loadingMore.value || !hasMore.value) return;
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
    loadPage();
  }
}

onUnmounted(() => { observer?.disconnect(); });
</script>

<style scoped>
/* ── Transitions ── */
.cmp-fade-enter-active, .cmp-fade-leave-active { transition: opacity 180ms ease, transform 180ms ease; }
.cmp-fade-enter-from, .cmp-fade-leave-to { opacity: 0; }
.cmp-fade-enter-from .cmp-modal { transform: scale(.97) translateY(6px); }
.cmp-fade-leave-to .cmp-modal { transform: scale(.97) translateY(6px); }

/* ── Overlay ── */
.cmp-overlay {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(15, 18, 28, 0.45);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}

/* ── Modal card ── */
.cmp-modal {
  width: 960px; max-width: 95vw; height: 680px; max-height: 90vh;
  background: #ffffff; border-radius: 12px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.15);
  display: flex; flex-direction: column; overflow: hidden;
  outline: none;
  position: relative; /* Định vị relative để popover menu căn toạ độ top/left đúng */
  --accent: #10b981; /* Đổi màu chủ đạo nhẹ nhàng hơn */
  --accent-soft: #ecfdf5;
  --accent-mid: #34d399;
  --ink: #1f2937;
  --body: #4b5563;
  --muted: #9ca3af;
  --hairline: #e5e7eb;
  --surface: #f9fafb;
}

/* ── Header ── */
.cmp-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--hairline);
  flex-shrink: 0;
}
.cmp-title {
  font-size: 16px; font-weight: 700; color: var(--ink);
}
.cmp-header-actions {
  display: flex; align-items: center; gap: 12px;
}

/* search */
.cmp-search-wrap {
  position: relative; display: flex; align-items: center;
}
.cmp-search-wrap--header {
  width: 320px;
}
.cmp-search-icon {
  position: absolute; left: 10px; color: var(--muted); pointer-events: none;
}
.cmp-search {
  border: 1px solid var(--hairline); border-radius: 20px;
  padding: 6px 12px 6px 32px; font-size: 13.5px; width: 100%;
  outline: none; background: var(--surface); color: var(--ink);
  transition: all 140ms;
}
.cmp-search:focus { border-color: var(--muted); background: #fff; }

/* close */
.cmp-close {
  border: none; background: none; cursor: pointer; color: var(--muted);
  display: flex; align-items: center; justify-content: center;
}
.cmp-close:hover { color: var(--ink); }

/* ── Body ── */
.cmp-body {
  display: flex; flex: 1; min-height: 0; overflow: hidden;
}

/* ── Sidebar ── */
.cmp-sidebar {
  width: 220px; flex-shrink: 0;
  border-right: 1px solid var(--hairline);
  background: #ffffff;
  padding: 12px 6px;
  display: flex; flex-direction: column;
}

.cmp-sidebar-search-group {
  display: flex; gap: 6px; align-items: center; padding: 0 4px 10px;
}
.cmp-search-wrap--sidebar {
  flex: 1;
}
.cmp-search--sidebar {
  font-size: 12px; padding: 5px 24px 5px 24px; border-radius: 6px;
}
.cmp-sidebar-search-suffix {
  position: absolute; right: 8px; font-size: 11px; color: var(--muted); pointer-events: none;
}
.cmp-btn-add-folder {
  width: 28px; height: 28px; border: 1px solid var(--hairline); border-radius: 6px;
  background: var(--surface); color: var(--body); display: flex; align-items: center;
  justify-content: center; cursor: pointer; transition: all 130ms;
}
.cmp-btn-add-folder:hover { border-color: var(--muted); color: var(--ink); background: #fff; }

.cmp-sidebar-scroll {
  flex: 1; overflow-y: auto; margin-top: 8px;
}

.cmp-folder-item {
  display: flex; align-items: center; gap: 8px;
  width: 100%; border: none; background: none; cursor: pointer;
  font-size: 13px; color: var(--body); padding: 8px 10px;
  border-radius: 6px; text-align: left; font-family: inherit;
  transition: background 130ms, color 130ms;
  margin-bottom: 2px;
}
.cmp-folder-item:hover { background: var(--surface); color: var(--ink); }
.cmp-folder-item.active { background: #f3f4f6; color: var(--ink); font-weight: 600; }

/* Wrapper cho thư mục dự án hỗ trợ hover nút 3 chấm */
.cmp-folder-item-wrapper {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; position: relative; border-radius: 6px;
  margin-bottom: 2px;
}
.cmp-folder-item-wrapper:hover { background: var(--surface); }
.cmp-folder-item-wrapper.active { background: #f3f4f6; font-weight: 600; }
.cmp-folder-item-wrapper.active .cmp-folder-item-btn { color: var(--ink); }

.cmp-folder-item-btn {
  display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;
  border: none; background: none; cursor: pointer;
  font-size: 13px; color: var(--body); padding: 8px 10px;
  text-align: left; font-family: inherit;
}
.cmp-folder-item-btn:hover { color: var(--ink); }

.cmp-folder-more-btn {
  border: none; background: none; cursor: pointer;
  color: var(--muted); padding: 4px; display: none;
  align-items: center; justify-content: center;
  margin-right: 6px; border-radius: 4px;
}
.cmp-folder-more-btn:hover { background: #e5e7eb; color: var(--ink); }
.cmp-folder-item-wrapper:hover .cmp-folder-more-btn { display: flex; }

.cmp-folder-name {
  flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cmp-folder-count {
  font-size: 11px; color: var(--muted); margin-left: auto;
}

/* ── Main grid area ── */
.cmp-main {
  flex: 1; min-width: 0;
  overflow-y: auto; overflow-x: hidden;
  padding: 12px;
  background: #f9fafb;
}

/* Empty */
.cmp-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; height: 100%; color: var(--muted); font-size: 13.5px;
}
.cmp-empty-icon { color: #d1d5db; }
.cmp-empty-sub { font-size: 12px; color: var(--muted); }

/* Grid */
.cmp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 12px;
}

/* Cell */
.cmp-cell {
  position: relative; aspect-ratio: 1;
  border: 1px solid var(--hairline);
  border-radius: 6px; overflow: hidden;
  background: #ffffff; cursor: pointer; padding: 0;
  transition: transform 120ms;
}
.cmp-cell:hover { transform: scale(1.02); border-color: var(--muted); }
.cmp-cell.picked {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}
.cmp-cell img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
.cmp-cell-ph {
  display: flex; align-items: center; justify-content: center;
  width: 100%; height: 100%; color: #d1d5db;
}
.cmp-cell-badge {
  position: absolute; top: 6px; left: 6px;
  width: 18px; height: 18px; border-radius: 50%;
  background: #3b82f6; color: #fff;
  font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.cmp-cell-name {
  position: absolute; left: 0; right: 0; bottom: 0;
  font-size: 10px; color: #fff;
  background: rgba(0, 0, 0, 0.45);
  padding: 4px 6px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  pointer-events: none;
}

/* Sentinel (invisible, used for IntersectionObserver) */
.cmp-sentinel { height: 1px; width: 100%; grid-column: 1 / -1; }

/* Load more spinner */
.cmp-load-more {
  display: flex; justify-content: center; padding: 12px 0;
}

/* Spinner */
.cmp-spinner {
  width: 20px; height: 20px; border: 2px solid var(--hairline);
  border-top-color: var(--muted); border-radius: 50%;
  animation: cmp-spin 0.6s linear infinite;
}
.cmp-spinner--sm { width: 14px; height: 14px; }
@keyframes cmp-spin { to { transform: rotate(360deg); } }

/* ── Footer Pancake style ── */
.cmp-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px;
  border-top: 1px solid var(--hairline);
  flex-shrink: 0;
  background: #ffffff;
}

.cmp-footer-left {
  display: flex; align-items: center; gap: 8px;
}
.cmp-foot-icon-btn {
  width: 28px; height: 28px; border: 1px solid var(--hairline); border-radius: 6px;
  background: #fff; color: var(--body); display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.cmp-foot-icon-btn:hover { background: var(--surface); color: var(--ink); }

.cmp-foot-text-btn {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--hairline); border-radius: 6px; background: #fff;
  padding: 4px 10px; font-size: 12.5px; color: var(--body); cursor: pointer;
}
.cmp-foot-text-btn:hover { background: var(--surface); }
.cmp-foot-icon-a {
  font-weight: 700; border: 1px solid var(--body); border-radius: 3px;
  padding: 0 4px; font-size: 10px; line-height: 1.2;
}

.cmp-picked-lbl {
  font-size: 12.5px; color: var(--muted); margin-left: 8px;
}

.cmp-footer-right {
  display: flex; align-items: center; gap: 8px;
}
.cmp-btn-upload-footer {
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 600; color: var(--body);
  border: 1px solid var(--hairline); background: #fff;
  border-radius: 6px; padding: 6px 16px; cursor: pointer;
  transition: all 130ms;
}
.cmp-btn-upload-footer:hover { background: var(--surface); color: var(--ink); }
.cmp-btn-upload-footer.loading { opacity: 0.6; cursor: wait; }

.cmp-btn-more-options {
  width: 32px; height: 32px; border: 1px solid var(--hairline); border-radius: 6px;
  background: #fff; color: var(--body); display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.cmp-btn-more-options:hover { background: var(--surface); }

.cmp-btn-confirm-action {
  background: #3b82f6; color: #fff; border: none; border-radius: 6px;
  padding: 6px 24px; font-size: 13px; font-weight: 700; cursor: pointer;
  transition: opacity 120ms;
}
.cmp-btn-confirm-action:hover:not(:disabled) { opacity: 0.9; }
.cmp-btn-confirm-action:disabled { background: #d1d5db; color: #9ca3af; cursor: default; }
.cmp-foot-divider {
  width: 1px; height: 18px; background: var(--hairline); margin: 0 4px;
}
.cmp-foot-action-icon-btn {
  width: 28px; height: 28px; border: 1px solid var(--hairline); border-radius: 6px;
  background: #fff; color: var(--body); display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 130ms;
}
.cmp-foot-action-icon-btn:hover { background: #f3f4f6; color: var(--ink); border-color: var(--muted); }
.cmp-foot-action-icon-btn--danger:hover { background: #fef2f2; color: #ef4444; border-color: #fca5a5; }

.cmp-picked-badge {
  display: inline-flex; align-items: center; gap: 6px;
  background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;
  font-size: 12.5px; font-weight: 600; padding: 4px 10px; border-radius: 6px;
  cursor: pointer; user-select: none;
}
.cmp-picked-badge:hover { background: #dbeafe; }
.cmp-picked-badge-x {
  font-size: 10px; color: #3b82f6; font-weight: 700;
}

/* Upload Button Group dưới chân */
.cmp-upload-btn-group {
  display: flex; align-items: center;
}
.cmp-upload-btn-group .cmp-btn-upload-footer {
  border-top-right-radius: 0px; border-bottom-right-radius: 0px;
  border-right: none;
}
.cmp-upload-btn-group .cmp-btn-more-options {
  border-top-left-radius: 0px; border-bottom-left-radius: 0px;
  height: 32px;
}

/* Popover Menu Bay Nổi */
.cmp-popover-menu {
  position: absolute; z-index: 9999;
  background: #ffffff; border-radius: 8px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.15);
  border: 1px solid var(--hairline);
  padding: 4px; min-width: 160px;
  display: flex; flex-direction: column;
}
.cmp-popover-item {
  display: flex; align-items: center; gap: 8px;
  width: 100%; border: none; background: none; cursor: pointer;
  font-size: 13px; color: var(--ink); padding: 8px 12px;
  border-radius: 6px; text-align: left; font-family: inherit;
  transition: background 130ms;
}
.cmp-popover-item:hover { background: var(--surface); }
.cmp-popover-item--danger { color: #ef4444; }
.cmp-popover-item--danger:hover { background: #fef2f2; }
.pop-icon { flex-shrink: 0; color: var(--body); }
.cmp-popover-item--danger .pop-icon { color: #ef4444; }
.pop-divider {
  height: 1px; background: var(--hairline); margin: 4px 0;
}

/* Popover Overlay */
.cmp-popover-overlay {
  position: absolute; inset: 0; z-index: 9998;
  background: transparent;
}
</style>
