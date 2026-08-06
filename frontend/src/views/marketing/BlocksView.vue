<!--
  Khối nội dung (Blocks) — sub-view 3 Marketing.
  HS Atlas re-skin 2026-06-06: .mkt-top sticky + .mkt-body, folder dọc .blk-folder
  + grid .blk-grid / card .blk chuẩn HS. Sidebar Công khai/Riêng tư GIỮ (Anh chốt 2026-06-04),
  chỉ re-skin token. KHÔNG đổi logic — chỉ markup/CSS. Token global
  (--brand/--ink/--line/--surface…), classes .btn/.chip/.field/.card tái dùng từ hs-crm-theme.css.
-->
<template>
  <div class="blocks-view">
    <!-- ================== TOPBAR (HS .mkt-top scaffold) ================== -->
    <div class="mkt-top">
      <div>
        <div class="mtt">Khối nội dung</div>
        <div class="mts">Mẫu hành động tái sử dụng — gửi 1-1 hàng ngày hoặc ghép vào Luồng</div>
      </div>
      <div class="actions">
        <button v-if="canCreateBlock" class="btn btn-ghost btn-sm" @click="createFolderInline">
          <v-icon size="16">mdi-folder-plus-outline</v-icon> Tạo thư mục
        </button>
        <button v-if="canCreateBlock" class="btn btn-primary btn-sm" @click="openCreate">
          <v-icon size="16">mdi-plus-circle-outline</v-icon> Tạo khối
        </button>
      </div>
    </div>

    <!-- ================== LAYOUT (sidebar + body) ================== -->
    <div class="bv-layout">
      <!-- ---- Sidebar: Folder Công khai / Riêng tư (Anh chốt 2026-06-04) ---- -->
      <aside class="bv-sidebar">
        <button
          class="bv-folder-item"
          :class="{ 'is-active': !selectedFolderId && !showArchived }"
          @click="onSelectAll"
        >
          <v-icon size="15">mdi-view-grid-outline</v-icon>
          <span class="bv-folder-label">Tất cả khối</span>
          <span class="bv-folder-count num">{{ activeBlocksCount }}</span>
        </button>

        <div v-if="publicFolders.length > 0" class="bv-sidebar-section">
          <div class="bv-sidebar-head">
            <v-icon size="13" class="vis-public">mdi-lock-open-variant-outline</v-icon>
            <span>Công khai</span>
            <span class="bv-sidebar-hint">cả org dùng</span>
          </div>
          <div
            v-for="folder in publicFolders"
            :key="folder.id"
            class="bv-folder-item"
            :class="{ 'is-active': selectedFolderId === folder.id }"
          >
            <button class="bv-folder-main" @click="onSelectFolder(folder.id)">
              <v-icon size="14">mdi-folder-outline</v-icon>
              <span class="bv-folder-label">{{ folder.name }}</span>
              <span class="bv-folder-count num">{{ folder._count?.blocks ?? 0 }}</span>
            </button>
            <v-menu v-if="canCreateBlock" location="bottom end" :close-on-content-click="true">
              <template #activator="{ props }">
                <button class="bv-folder-more" v-bind="props" @click.stop title="Tùy chọn"><v-icon size="14">mdi-dots-horizontal</v-icon></button>
              </template>
              <v-list density="compact" class="bk-menu" @click.stop>
                <v-list-item @click="onRenameFolder(folder)"><template #prepend><v-icon size="16">mdi-pencil-outline</v-icon></template><v-list-item-title>Đổi tên</v-list-item-title></v-list-item>
                <v-list-item @click="onToggleFolderVisibility(folder)"><template #prepend><v-icon size="16">mdi-lock-outline</v-icon></template><v-list-item-title>Chuyển sang Riêng tư</v-list-item-title></v-list-item>
                <v-list-item class="bk-menu-danger" @click="onDeleteFolder(folder)"><template #prepend><v-icon size="16">mdi-trash-can-outline</v-icon></template><v-list-item-title>Xoá thư mục</v-list-item-title></v-list-item>
              </v-list>
            </v-menu>
          </div>
        </div>

        <div v-if="privateFolders.length > 0" class="bv-sidebar-section">
          <div class="bv-sidebar-head">
            <v-icon size="13" class="vis-private">mdi-lock-outline</v-icon>
            <span>Riêng tư</span>
            <span class="bv-sidebar-hint">chỉ tôi</span>
          </div>
          <div
            v-for="folder in privateFolders"
            :key="folder.id"
            class="bv-folder-item"
            :class="{ 'is-active': selectedFolderId === folder.id }"
          >
            <button class="bv-folder-main" @click="onSelectFolder(folder.id)">
              <v-icon size="14">mdi-folder-outline</v-icon>
              <span class="bv-folder-label">{{ folder.name }}</span>
              <span class="bv-folder-count num">{{ folder._count?.blocks ?? 0 }}</span>
            </button>
            <v-menu v-if="canCreateBlock" location="bottom end" :close-on-content-click="true">
              <template #activator="{ props }">
                <button class="bv-folder-more" v-bind="props" @click.stop title="Tùy chọn"><v-icon size="14">mdi-dots-horizontal</v-icon></button>
              </template>
              <v-list density="compact" class="bk-menu" @click.stop>
                <v-list-item @click="onRenameFolder(folder)"><template #prepend><v-icon size="16">mdi-pencil-outline</v-icon></template><v-list-item-title>Đổi tên</v-list-item-title></v-list-item>
                <v-list-item @click="onToggleFolderVisibility(folder)"><template #prepend><v-icon size="16">mdi-lock-open-variant-outline</v-icon></template><v-list-item-title>Chuyển sang Công khai</v-list-item-title></v-list-item>
                <v-list-item class="bk-menu-danger" @click="onDeleteFolder(folder)"><template #prepend><v-icon size="16">mdi-trash-can-outline</v-icon></template><v-list-item-title>Xoá thư mục</v-list-item-title></v-list-item>
              </v-list>
            </v-menu>
          </div>
        </div>

        <div class="bv-folder-divider"></div>
        <button
          class="bv-folder-item bv-folder-archived"
          :class="{ 'is-active': showArchived }"
          @click="onSelectArchived"
        >
          <v-icon size="14">mdi-archive-outline</v-icon>
          <span class="bv-folder-label">Đã lưu trữ</span>
          <span class="bv-folder-count num">{{ archivedCount }}</span>
        </button>
        <button v-if="canCreateBlock" class="bv-new-folder" @click="createFolderInline">
          <v-icon size="14">mdi-folder-plus-outline</v-icon> Tạo thư mục mới
        </button>
      </aside>

      <!-- ================== BODY (.mkt-body) ================== -->
      <main class="mkt-body bv-main">
        <!-- ----- Filter bar ----- -->
        <div class="filter-bar">
          <div class="field sm search-wrap">
            <v-icon size="16">mdi-magnify</v-icon>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Tìm khối theo tên, nội dung, tag..."
            />
          </div>

          <div class="chips">
            <span class="filter-lbl">Tag:</span>
            <button
              v-for="tag in availableTags"
              :key="tag"
              class="fchip"
              :class="{ active: selectedTags.includes(tag) }"
              @click="toggleTag(tag)"
            >
              {{ tag }}
              <span class="count">{{ tagCounts[tag] || 0 }}</span>
            </button>
            <button class="fchip fchip-dashed" @click="openTagPicker">
              <v-icon size="13">mdi-plus</v-icon> Thêm tag
            </button>
          </div>

          <div class="filter-spacer"></div>

          <div class="chips">
            <span class="filter-lbl">Loại:</span>
            <button
              v-for="type in actionTypeChips"
              :key="type.value"
              class="fchip"
              :class="{ active: actionTypeFilter === type.value }"
              @click="actionTypeFilter = actionTypeFilter === type.value ? 'all' : type.value"
            >
              <v-icon size="13">{{ actionIcon(type.value) }}</v-icon>
              {{ type.label }}
            </button>
          </div>
        </div>

        <!-- ----- Loading ----- -->
        <div v-if="loading" class="bv-empty">
          <v-progress-circular indeterminate size="32" color="primary" />
        </div>

        <!-- ----- Empty state ----- -->
        <div v-else-if="filteredBlocks.length === 0" class="bv-empty">
          <v-icon size="40" color="#97a0b3">mdi-package-variant-closed</v-icon>
          <div class="bv-empty-title">
            {{ showArchived ? 'Không có khối đã lưu trữ' : 'Chưa có khối nào ở đây' }}
          </div>
          <p v-if="!showArchived" class="bv-empty-desc">
            Khối là 1 cụm tin nhắn (chữ + ảnh + tệp...) gửi cho khách hàng.
            Tạo 1 lần dùng nhiều nơi.
          </p>
          <button v-if="!showArchived && canCreateBlock" class="btn btn-primary btn-sm" @click="openCreate">
            <v-icon size="16">mdi-plus-circle-outline</v-icon> Tạo khối đầu tiên
          </button>
        </div>

        <!-- ----- Folder sections (Atlas .blk-folder dọc) ----- -->
        <template v-else>
          <section v-for="grp in groupedBlocks" :key="grp.key" class="blk-folder">
            <div class="blk-fh">
              <v-icon size="17">mdi-folder-outline</v-icon>
              <span class="fn">{{ grp.name }}</span>
              <span class="chip chip-grey">
                <v-icon size="12">{{ grp.visibility === 'private' ? 'mdi-lock-outline' : 'mdi-lock-open-variant-outline' }}</v-icon>
                {{ grp.visibility === 'private' ? 'Riêng tư' : 'Công khai' }}
              </span>
              <span class="fc num">{{ grp.blocks.length }} khối</span>
            </div>

            <div class="blk-grid">
              <article
                v-for="block in grp.blocks"
                :key="block.id"
                class="blk"
                @click="openEdit(block)"
              >
                <v-menu v-if="canEditBlock || canCreateBlock" location="bottom end" :close-on-content-click="true">
                  <template #activator="{ props }">
                    <button class="bk-more" v-bind="props" @click.stop title="Tùy chọn">
                      <v-icon size="16">mdi-dots-vertical</v-icon>
                    </button>
                  </template>
                  <v-list density="compact" class="bk-menu" @click.stop>
                    <v-list-item @click="openEdit(block)">
                      <template #prepend><v-icon size="16">mdi-pencil-outline</v-icon></template>
                      <v-list-item-title>Sửa</v-list-item-title>
                    </v-list-item>
                    <v-list-item @click="onDuplicate(block)">
                      <template #prepend><v-icon size="16">mdi-content-copy</v-icon></template>
                      <v-list-item-title>Nhân bản</v-list-item-title>
                    </v-list-item>
                    <v-list-item @click="onArchiveToggle(block)">
                      <template #prepend><v-icon size="16">{{ block.archivedAt ? 'mdi-archive-arrow-up-outline' : 'mdi-archive-outline' }}</v-icon></template>
                      <v-list-item-title>{{ block.archivedAt ? 'Khôi phục' : 'Lưu trữ' }}</v-list-item-title>
                    </v-list-item>
                    <v-list-item v-if="canDeleteBlock" class="bk-menu-danger" @click="onDeleteBlock(block)">
                      <template #prepend><v-icon size="16">mdi-trash-can-outline</v-icon></template>
                      <v-list-item-title>Xoá hẳn</v-list-item-title>
                    </v-list-item>
                  </v-list>
                </v-menu>

                <!-- action chip -->
                <span class="bk-act chip" :class="actionChipClass(block.actionType)">
                  <v-icon size="13">{{ actionIcon(block.actionType) }}</v-icon>
                  {{ actionLabel(block.actionType) }}
                </span>

                <div class="bn">{{ block.name }}</div>
                <div class="bp">{{ previewText(block) }}</div>

                <div class="bf">
                  <span class="bk-meta-left">
                    <template v-if="variantCount(block) > 0">
                      <v-icon size="13">mdi-shuffle-variant</v-icon>
                      <span class="num">{{ variantCount(block) }}</span> biến thể
                    </template>
                    <template v-for="tag in block.tagIds?.slice(0, 2) || []" :key="tag">
                      <span class="bk-tag" :class="tagColorClass(tag)">{{ tag }}</span>
                    </template>
                    <span v-if="(block.tagIds?.length || 0) > 2" class="bk-tag-more num">+{{ block.tagIds.length - 2 }}</span>
                  </span>
                  <span v-if="block.usageCount > 0" class="bk-meta-right">
                    <v-icon size="13">mdi-flash-outline</v-icon>
                    <span class="num">{{ block.usageCount }}</span> lượt
                  </span>
                </div>
              </article>
            </div>
          </section>
        </template>
      </main>
    </div>

    <BlockEditorDialog
      v-model="editorOpen"
      :block="editingBlock"
      :folders="folders"
      :status-items="statusItems"
      @saved="onSaved"
      @folders-changed="onFoldersChanged"
    />

    <v-snackbar v-model="toastOpen" :color="toastColor" timeout="3000" location="bottom right">
      {{ toastMsg }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { blocksApi } from '@/api/automation';
import { SUPPORTED_ACTION_TYPES, type Block, type BlockFolder, type BlockActionType } from '@/api/automation/types';
import BlockEditorDialog from '@/components/blocks/BlockEditorDialog.vue';
import { api } from '@/api';
import { useAuthStore } from '@/stores/auth';
import { useConfirm } from '@/composables/use-confirm';

const { confirm, confirmWithReason } = useConfirm();

// RBAC 2026-06-09 — Sale chỉ XEM + DÙNG Khối; tạo/sửa/xóa cần grant block.create/edit.
const authStore = useAuthStore();
const canCreateBlock = computed(() => authStore.canAccess('block', 'create'));
const canEditBlock = computed(() => authStore.canAccess('block', 'edit'));
const canDeleteBlock = computed(() => authStore.canAccess('block', 'delete'));

const blocks = ref<Block[]>([]);
const folders = ref<BlockFolder[]>([]);
const statusItems = ref<Array<{ id: string; name: string }>>([]);
const loading = ref(true);

const selectedFolderId = ref<string | null>(null);
const showArchived = ref(false);
const actionTypeFilter = ref<BlockActionType | 'all'>('all');
const searchQuery = ref('');
const selectedTags = ref<string[]>([]);

const editorOpen = ref(false);
const editingBlock = ref<Block | null>(null);

const toastOpen = ref(false);
const toastMsg = ref('');
const toastColor = ref<'success' | 'error' | 'info'>('info');

// 2026-06-04: split folder theo visibility (Anh chốt)
const publicFolders = computed(() => folders.value.filter((f) => f.visibility === 'public'));
const privateFolders = computed(() => folders.value.filter((f) => f.visibility === 'private'));

const activeBlocksCount = computed(() => blocks.value.filter((b) => !b.archivedAt).length);
const archivedCount = computed(() => blocks.value.filter((b) => b.archivedAt).length);

const ACTION_LABEL: Partial<Record<BlockActionType, string>> = {
  request_friend: 'Mời kết bạn',
  send_message: 'Gửi tin',
  update_status: 'Đổi trạng thái',
  add_tag: 'Gắn tag',
  remove_tag: 'Bỏ tag',
  assign_user: 'Giao việc',
  update_lead_score: 'Chấm điểm',
  send_image: 'Gửi ảnh',
  send_file: 'Gửi tệp',
  send_template: 'Gửi mẫu',
};
function actionLabel(t: BlockActionType): string {
  return ACTION_LABEL[t] ?? t;
}
const actionTypeChips = SUPPORTED_ACTION_TYPES.map((value) => ({
  value,
  label: actionLabel(value),
}));

// Icon mdi theo actionType (convention dự án — không emoji)
const ACTION_ICON: Partial<Record<BlockActionType, string>> = {
  request_friend: 'mdi-account-plus',
  send_message: 'mdi-message-text-outline',
  update_status: 'mdi-tag-outline',
  add_tag: 'mdi-tag-plus-outline',
  remove_tag: 'mdi-tag-minus-outline',
  assign_user: 'mdi-account-arrow-right-outline',
  update_lead_score: 'mdi-star-outline',
  send_image: 'mdi-image-outline',
  send_file: 'mdi-file-outline',
  send_template: 'mdi-card-text-outline',
};
function actionIcon(t: BlockActionType): string {
  return ACTION_ICON[t] ?? 'mdi-flash';
}

// Map actionType → chip màu HS (ACTION_TYPE_COLOR design-tokens.ts → chip global)
const ACTION_CHIP: Partial<Record<BlockActionType, string>> = {
  request_friend: 'chip-orange',
  send_message: 'chip-green',
  update_status: 'chip-amber',
  add_tag: 'chip-amber',
  remove_tag: 'chip-grey',
  assign_user: 'chip-blue',
  update_lead_score: 'chip-red',
  send_image: 'chip-orange',
  send_file: 'chip-grey',
  send_template: 'chip-green',
};
function actionChipClass(t: BlockActionType): string {
  return ACTION_CHIP[t] ?? 'chip-grey';
}

// Tags discovered from all blocks
const availableTags = computed(() => {
  const set = new Set<string>();
  for (const b of blocks.value) {
    for (const t of b.tagIds || []) set.add(t);
  }
  return Array.from(set).sort();
});
const tagCounts = computed(() => {
  const map: Record<string, number> = {};
  for (const b of blocks.value) {
    if (b.archivedAt) continue;
    for (const t of b.tagIds || []) map[t] = (map[t] || 0) + 1;
  }
  return map;
});

function tagColorClass(tag: string): string {
  // Hash tag name → 1 of 5 color classes
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) % 5;
  return ['tag-sky', 'tag-purple', 'tag-teal', 'tag-pink', 'tag-amber'][hash];
}

const filteredBlocks = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return blocks.value.filter((b) => {
    if (showArchived.value) { if (!b.archivedAt) return false; }
    else { if (b.archivedAt) return false; }
    if (selectedFolderId.value !== null && b.folderId !== selectedFolderId.value) return false;
    if (actionTypeFilter.value !== 'all' && b.actionType !== actionTypeFilter.value) return false;
    if (selectedTags.value.length > 0) {
      if (!b.tagIds?.some((t) => selectedTags.value.includes(t))) return false;
    }
    if (q) {
      const blob = `${b.name} ${JSON.stringify(b.content).slice(0, 500)} ${(b.tagIds || []).join(' ')}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
});

// Atlas: stack folder dọc — group filteredBlocks theo folder
interface BlockGroup {
  key: string;
  name: string;
  visibility: 'public' | 'private' | string;
  blocks: Block[];
}
const groupedBlocks = computed<BlockGroup[]>(() => {
  const map = new Map<string, BlockGroup>();
  const noFolderKey = '__none__';
  for (const b of filteredBlocks.value) {
    const key = b.folderId ?? noFolderKey;
    if (!map.has(key)) {
      map.set(key, {
        key,
        name: b.folder?.name ?? 'Chưa phân loại',
        visibility: b.folder?.visibility ?? 'public',
        blocks: [],
      });
    }
    map.get(key)!.blocks.push(b);
  }
  // sort: thư mục có tên trước, "Chưa phân loại" cuối
  return Array.from(map.values()).sort((a, z) => {
    if (a.key === noFolderKey) return 1;
    if (z.key === noFolderKey) return -1;
    return a.name.localeCompare(z.name);
  });
});

function previewText(block: Block): string {
  const c = block.content as any;
  if (Array.isArray(c?.greetingVariants) && c.greetingVariants.length > 0) {
    return String(c.greetingVariants[0]).slice(0, 160);
  }
  if (Array.isArray(c?.textVariants) && c.textVariants.length > 0) {
    return String(c.textVariants[0]).slice(0, 160);
  }
  if (Array.isArray(c?.components)) {
    const firstText = c.components.find((x: any) => x?.kind === 'text');
    if (firstText) {
      const txt = firstText?.defaultVariant?.text || firstText?.text || '';
      return String(txt).slice(0, 160);
    }
    const kinds = c.components.map((x: any) => x?.kind).filter(Boolean);
    return `Khối có ${c.components.length} thành phần: ${kinds.join(', ')}`;
  }
  return '(chưa có nội dung)';
}
function variantCount(block: Block): number {
  const c = block.content as any;
  if (Array.isArray(c?.greetingVariants)) return c.greetingVariants.length;
  if (Array.isArray(c?.textVariants)) return c.textVariants.length;
  if (Array.isArray(c?.components)) {
    let n = 0;
    for (const cmp of c.components) {
      if (cmp?.kind === 'text') {
        n += (Array.isArray(cmp.variants) ? cmp.variants.length : 0) + 1;
      }
    }
    return n;
  }
  return 0;
}

function onSelectAll() { selectedFolderId.value = null; showArchived.value = false; }
function onSelectFolder(id: string) { selectedFolderId.value = id; showArchived.value = false; }
function onSelectArchived() { showArchived.value = true; selectedFolderId.value = null; }

function toggleTag(tag: string) {
  const i = selectedTags.value.indexOf(tag);
  if (i >= 0) selectedTags.value.splice(i, 1);
  else selectedTags.value.push(tag);
}

async function openTagPicker() {
  const { ok, reason } = await confirmWithReason({
    title: 'Thêm tag lọc',
    confirmText: 'Thêm',
    cancelText: 'Hủy',
    reasonLabel: 'Tên tag',
    reasonPlaceholder: 'vd #SunshineQ7',
  });
  if (ok && reason?.trim()) {
    const tag = reason.trim().startsWith('#') ? reason.trim() : `#${reason.trim()}`;
    if (!selectedTags.value.includes(tag)) selectedTags.value.push(tag);
  }
}

async function loadAll() {
  loading.value = true;
  try {
    const [b, f, statusRes] = await Promise.all([
      blocksApi.listBlocks({ includeArchived: true, limit: 500 }),
      blocksApi.listFolders(),
      api.get<{ statuses: Array<{ id: string; name: string }> }>('/statuses').then((r) => r.data.statuses).catch(() => []),
    ]);
    blocks.value = b;
    folders.value = f;
    statusItems.value = Array.isArray(statusRes) ? statusRes : [];
  } finally {
    loading.value = false;
  }
}
onMounted(loadAll);

function openCreate() { editingBlock.value = null; editorOpen.value = true; }
function openEdit(block: Block) { editingBlock.value = block; editorOpen.value = true; }

function showToast(msg: string, color: 'success' | 'error' | 'info' = 'info') {
  toastMsg.value = msg; toastColor.value = color; toastOpen.value = true;
}
function onSaved(_block: Block) { loadAll(); showToast('Đã lưu khối', 'success'); }

// Editor vừa tạo thư mục inline → refresh list folder (không full reload để giữ editor mở).
async function onFoldersChanged(_newFolderId: string) {
  folders.value = await blocksApi.listFolders();
  showToast('Đã tạo thư mục mới', 'success');
}

// ── Menu "..." Khối (2026-06-18): dropdown thay popup nhập-số ──
async function onDuplicate(block: Block) {
  try {
    await blocksApi.duplicateBlock(block.id);
    loadAll();
    showToast('Đã nhân bản', 'success');
  } catch (e: any) {
    showToast(e?.response?.data?.error || 'Không nhân bản được', 'error');
  }
}
async function onArchiveToggle(block: Block) {
  try {
    if (block.archivedAt) {
      await blocksApi.unarchiveBlock(block.id);
      showToast('Đã khôi phục', 'success');
    } else {
      if (!(await confirm({ title: `Lưu trữ khối "${block.name}"?`, message: 'Khối sẽ chuyển sang mục "Đã lưu trữ" — không hiện khi chọn khối, nhưng GIỮ LẠI và khôi phục được bất cứ lúc nào.', confirmText: 'Lưu trữ', cancelText: 'Hủy' }))) return;
      await blocksApi.archiveBlock(block.id);
      showToast('Đã lưu trữ', 'success');
    }
    loadAll();
  } catch (e: any) {
    showToast(e?.response?.data?.error || 'Thao tác thất bại', 'error');
  }
}
async function onDeleteBlock(block: Block) {
  if (!(await confirm({
    title: `Xoá hẳn khối "${block.name}"?`,
    message: 'Xoá VĨNH VIỄN, KHÔNG khôi phục được. Nếu chỉ muốn cất đi mà giữ lại thì chọn "Lưu trữ".',
    tone: 'danger', confirmText: 'Xoá hẳn', cancelText: 'Hủy',
  }))) return;
  try {
    await blocksApi.deleteBlock(block.id);
    loadAll();
    showToast('Đã xoá khối', 'success');
  } catch (e: any) {
    // BE chặn xoá khi khối đang được Mục tiêu/Broadcast tham chiếu.
    showToast(e?.response?.data?.detail || e?.response?.data?.error || 'Không xoá được — khối đang được dùng ở Mục tiêu/Broadcast. Hãy gỡ tham chiếu hoặc "Lưu trữ" thay vì xoá.', 'error');
  }
}

// ── Menu "..." Thư mục (2026-06-18): đổi tên / đổi công khai↔riêng tư / xoá ──
async function onRenameFolder(folder: BlockFolder) {
  const { ok, reason } = await confirmWithReason({
    title: 'Đổi tên thư mục',
    confirmText: 'Lưu', cancelText: 'Hủy',
    reasonLabel: 'Tên mới', reasonPlaceholder: folder.name,
  });
  if (!ok || !reason?.trim() || reason.trim() === folder.name) return;
  try {
    await blocksApi.updateFolder(folder.id, { name: reason.trim() });
    loadAll();
    showToast('Đã đổi tên thư mục', 'success');
  } catch (e: any) {
    showToast(e?.response?.data?.error || 'Không đổi tên được', 'error');
  }
}
async function onToggleFolderVisibility(folder: BlockFolder) {
  const next = folder.visibility === 'private' ? 'public' : 'private';
  const okMsg = next === 'public'
    ? 'Cả tổ chức sẽ thấy & dùng được các khối trong thư mục này.'
    : 'Chỉ mình bạn thấy thư mục này. Khối đã lên lịch ở luồng vẫn gửi bình thường, nhưng người khác không mở khối được nữa.';
  if (!(await confirm({ title: `Chuyển "${folder.name}" sang ${next === 'public' ? 'Công khai' : 'Riêng tư'}?`, message: okMsg, confirmText: 'Đồng ý', cancelText: 'Hủy' }))) return;
  try {
    await blocksApi.updateFolder(folder.id, { visibility: next });
    loadAll();
    showToast(`Đã chuyển sang ${next === 'public' ? 'Công khai' : 'Riêng tư'}`, 'success');
  } catch (e: any) {
    showToast(e?.response?.data?.error || 'Không đổi được trạng thái', 'error');
  }
}
async function onDeleteFolder(folder: BlockFolder) {
  const n = folder._count?.blocks ?? 0;
  if (!(await confirm({
    title: `Xoá thư mục "${folder.name}"?`,
    message: n > 0
      ? `Thư mục có ${n} khối. Xoá thư mục KHÔNG xoá khối — các khối sẽ về "Chưa phân loại" (công khai).`
      : 'Thư mục trống sẽ bị xoá.',
    tone: 'danger', confirmText: 'Xoá thư mục', cancelText: 'Hủy',
  }))) return;
  try {
    // force=true: thư mục còn khối → BE cascade-detach khối về folderId=null (Chưa phân loại).
    await blocksApi.deleteFolder(folder.id, true);
    if (selectedFolderId.value === folder.id) selectedFolderId.value = null;
    loadAll();
    showToast('Đã xoá thư mục', 'success');
  } catch (e: any) {
    showToast(e?.response?.data?.error || 'Không xoá được thư mục', 'error');
  }
}

async function createFolderInline() {
  const { ok: nameOk, reason: name } = await confirmWithReason({
    title: 'Tạo thư mục mới',
    confirmText: 'Tiếp tục',
    cancelText: 'Hủy',
    reasonLabel: 'Tên thư mục',
    reasonPlaceholder: 'vd Dự án Sunshine Q7',
  });
  if (!nameOk || !name?.trim()) return;
  const ok = await confirm({
    title: 'Folder riêng tư (chỉ bạn thấy)?',
    message: 'Xác nhận = Riêng tư · Hủy = Công khai (cả tổ chức dùng)',
    confirmText: 'Riêng tư',
    cancelText: 'Công khai',
  });
  const visibility = ok ? 'private' : 'public';
  await blocksApi.createFolder({ name: name.trim(), visibility });
  loadAll();
  showToast(`Đã tạo thư mục ${visibility === 'private' ? 'riêng tư' : 'công khai'}`, 'success');
}
</script>

<style scoped>
/* 2026-06-06 HS Atlas re-skin — render TRỰC TIẾP trong .bot-auto-content của BotAutoShell.
   Token global (--brand/--ink/--line/--surface…). .mkt-top/.mkt-body/.blk-folder/.blk-grid/.blk
   /.bk-act/.fn/.fc/.bn/.bp/.bf đến từ hs-crm-theme.css. */
.blocks-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-2);
  color: var(--ink);
  font-size: 13px;
}

/* ----- Topbar action group (.mkt-top dùng class global) ----- */
.actions { display: flex; gap: 8px; flex-shrink: 0; }

/* ─── Layout (sidebar + body) ─── */
.bv-layout {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* ─── Sidebar (re-skin token, GIỮ Công khai/Riêng tư) ─── */
.bv-sidebar {
  width: 220px;
  background: var(--surface);
  border-right: 1px solid var(--line);
  padding: 14px 8px;
  overflow-y: auto;
  flex-shrink: 0;
}
.bv-sidebar-section { margin-top: 10px; }
.bv-sidebar-head {
  display: flex; align-items: center; gap: 6px;
  font-size: 10.5px; font-weight: 700;
  color: var(--ink-4);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  padding: 6px 10px 4px;
}
.bv-sidebar-hint {
  margin-left: auto;
  font-size: 9.5px;
  color: var(--ink-4);
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
}
.vis-public { color: var(--success); }
.vis-private { color: #c2410c; }

.bv-folder-item {
  display: flex; align-items: center;
  width: 100%;
  border-radius: var(--r-sm);
  color: var(--ink);
  background: transparent;
  margin-bottom: 1px;
  position: relative;
}
.bv-folder-main {
  flex: 1; min-width: 0;
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px;
  background: transparent; border: 0;
  cursor: pointer; font-size: 12.5px; color: inherit;
  text-align: left; font-family: inherit;
}
.bv-folder-more {
  flex-shrink: 0; width: 26px; height: 26px; margin-right: 4px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 0; background: transparent; border-radius: var(--r-sm);
  color: var(--ink-4); cursor: pointer; opacity: 0; transition: 0.12s;
}
.bv-folder-item:hover .bv-folder-more { opacity: 1; }
.bv-folder-more:hover { background: var(--surface); color: var(--ink); }
.bv-folder-item .v-icon { color: var(--ink-4); }
.bv-folder-item:hover { background: var(--surface-3); }
.bv-folder-item.is-active {
  background: var(--brand-soft);
  color: var(--brand-700);
  font-weight: 600;
}
.bv-folder-item.is-active .v-icon { color: var(--brand); }
.bv-folder-label {
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.bv-folder-count {
  font-size: 11px;
  color: var(--ink-4);
  background: var(--surface-3);
  padding: 1px 6px;
  border-radius: var(--r-pill);
  font-weight: 600;
}
.bv-folder-item.is-active .bv-folder-count {
  background: var(--surface);
  color: var(--brand-700);
}
.bv-folder-divider {
  border-top: 1px solid var(--line);
  margin: 10px 4px 8px;
}
.bv-folder-archived { color: var(--ink-3); }
.bv-new-folder {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 10px;
  color: var(--brand);
  font-size: 11.5px; font-weight: 600;
  cursor: pointer;
  border-radius: var(--r-sm);
  background: transparent;
  border: 0;
  font-family: inherit;
  width: 100%;
  text-align: left;
}
.bv-new-folder:hover { background: var(--brand-soft); }

/* ─── Main body ─── */
.bv-main {
  flex: 1;
  overflow-y: auto;
  min-width: 0;
}

/* ─── Filter bar ─── */
.filter-bar {
  display: flex; align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.search-wrap { width: 300px; }
.search-wrap input { width: 100%; }
.filter-spacer { flex: 1; }
.filter-lbl {
  font-size: 11px; font-weight: 700;
  color: var(--ink-4);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-right: 2px;
}
.chips { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.fchip {
  display: inline-flex; align-items: center; gap: 5px;
  height: 30px;
  padding: 0 11px;
  border-radius: var(--r-pill);
  font-size: 12px;
  font-weight: 600;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--ink-2);
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
}
.fchip:hover { background: var(--surface-3); }
.fchip.active {
  background: var(--brand-soft);
  border-color: var(--brand);
  color: var(--brand-700);
}
.fchip .count {
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--ink-3);
  background: var(--surface-3);
  padding: 1px 6px;
  border-radius: var(--r-pill);
}
.fchip.active .count { background: var(--surface); color: var(--brand-700); }
.fchip-dashed { border-style: dashed; }

/* ─── Folder section + grid (Atlas .blk-folder/.blk-grid/.blk global) ─── */
.blk { position: relative; cursor: pointer; transition: box-shadow .14s, border-color .14s, transform .14s; }
.blk:hover {
  border-color: var(--brand);
  box-shadow: var(--sh-sm);
  transform: translateY(-1px);
}
.bk-act { margin-bottom: 10px; }
.bk-more {
  position: absolute; top: 10px; right: 10px;
  width: 26px; height: 26px;
  border-radius: var(--r-sm);
  background: transparent;
  border: 0;
  color: var(--ink-4);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  opacity: 0;
  transition: opacity .12s;
}
.bk-more:hover { background: var(--surface-3); color: var(--ink); }
.blk:hover .bk-more { opacity: 1; }
/* v-menu activator (block "...") luôn hiện khi đang mở menu (Vuetify set aria-expanded) */
.blk .bk-more[aria-expanded="true"] { opacity: 1; background: var(--surface-3); color: var(--ink); }

/* Dropdown menu "..." (Khối + Thư mục) — 2026-06-18 */
.bk-menu {
  border: 1px solid var(--line); border-radius: var(--r-md);
  box-shadow: var(--sh-lg); padding: 4px; min-width: 172px; background: var(--surface);
}
.bk-menu :deep(.v-list-item) { border-radius: var(--r-sm); min-height: 36px; }
.bk-menu :deep(.v-list-item-title) { font-size: 13px; color: var(--ink); }
.bk-menu :deep(.v-list-item .v-icon) { color: var(--ink-3); }
.bk-menu-danger :deep(.v-list-item-title) { color: var(--error, #de350b); font-weight: 600; }
.bk-menu-danger :deep(.v-icon) { color: var(--error, #de350b) !important; }
.bn { padding-right: 24px; }

.bf { gap: 8px; }
.bk-meta-left, .bk-meta-right {
  display: inline-flex; align-items: center; gap: 4px;
  flex-wrap: wrap;
}
.bk-meta-left .v-icon, .bk-meta-right .v-icon { color: var(--ink-4); }
.bk-tag {
  font-size: 10.5px;
  padding: 1px 7px;
  border-radius: var(--r-pill);
  font-weight: 600;
  border: 1px solid;
}
.bk-tag.tag-sky { background: #e0f2fe; color: #0369a1; border-color: #7dd3fc; }
.bk-tag.tag-purple { background: var(--chip-purple-bg, #ede9fe); color: #6d28d9; border-color: #c4b5fd; }
.bk-tag.tag-teal { background: #cffafe; color: #0e7490; border-color: #67e8f9; }
.bk-tag.tag-pink { background: #fce7f3; color: #9d174d; border-color: #f9a8d4; }
.bk-tag.tag-amber { background: var(--chip-amber-bg, #fef3c7); color: #92400e; border-color: #fcd34d; }
.bk-tag-more {
  font-size: 10.5px;
  color: var(--ink-4);
  font-weight: 600;
}

/* ─── Empty / loading ─── */
.bv-empty {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 8px;
  padding: 56px 20px;
  text-align: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  margin: 14px 0;
}
.bv-empty-title {
  font-size: 15px; font-weight: 700;
  color: var(--ink);
}
.bv-empty-desc {
  font-size: 12.5px; color: var(--ink-3);
  max-width: 420px; line-height: 1.5;
  margin-bottom: 6px;
}

@media (max-width: 1100px) {
  .bv-sidebar { width: 200px; }
  .blk-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
