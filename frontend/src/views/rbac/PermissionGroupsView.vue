<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <div class="dept-page">
    <header class="page-hero">
      <div class="hero-left">
        <h1 class="hero-title">Phân quyền</h1>
        <p class="hero-sub">
          Bật/tắt hiển thị site &amp; tab cho từng nhóm · Chọn nhóm bên trái → tích site/tab bên phải ·
          Nút "🔒 Chỉ Admin" khóa cứng, không cấp cho nhóm khác
        </p>
      </div>
      <div class="hero-actions">
        <button class="btn-ghost" :disabled="seeding" @click="seedDefaults">
          {{ seeding ? 'Đang seed...' : '⚙ Seed nhóm mặc định' }}
        </button>
        <button class="btn-primary" @click="openCreate(null)">
          <span class="btn-icon">+</span> Thêm nhóm
        </button>
      </div>
    </header>

    <section class="stats-row" v-if="!loading && stats.total > 0">
      <div class="stat-card stat-primary">
        <div class="stat-label">Tổng nhóm</div>
        <div class="stat-value">{{ stats.total }}</div>
      </div>
      <div class="stat-card stat-forest">
        <div class="stat-label">Nhóm hệ thống</div>
        <div class="stat-value">{{ stats.system }}<span class="stat-unit"> / {{ stats.total }}</span></div>
      </div>
      <div class="stat-card stat-mustard">
        <div class="stat-label">Tổng user đã gán</div>
        <div class="stat-value">{{ stats.totalMembers }}</div>
      </div>
      <div class="stat-card stat-cream">
        <div class="stat-label">Slot quyền tối đa</div>
        <div class="stat-value">{{ totalSlots }}<span class="stat-unit"> / nhóm</span></div>
      </div>
    </section>

    <div v-if="loading" class="loading-state">
      <div class="skel-card" v-for="i in 3" :key="i" style="height: 60px"></div>
    </div>

    <div v-else-if="store.permissionGroups.length === 0" class="empty-state">
      <div class="empty-icon">🛡</div>
      <h3>Chưa có nhóm quyền nào</h3>
      <p>Bắt đầu bằng seed nhóm mặc định (Admin, Sale).</p>
      <button class="btn-primary" :disabled="seeding" @click="seedDefaults">
        {{ seeding ? 'Đang seed...' : '⚙ Seed nhóm mặc định' }}
      </button>
    </div>

    <!-- 2-COLUMN LAYOUT: list groups + matrix -->
    <div v-else class="pg-layout">
      <!-- LEFT: groups list -->
      <aside class="pg-sidebar">
        <div class="pg-sidebar-head">
          <div class="search-box at-search">
            <span class="search-icon">🔍</span>
            <input v-model="searchQ" placeholder="Tìm nhóm..." />
            <button v-if="searchQ" class="search-clear" @click="searchQ = ''">×</button>
          </div>
        </div>
        <ul class="pg-group-list">
          <li
            v-for="g in filteredGroups"
            :key="g.id"
            class="pg-group-item"
            :class="{ active: selectedId === g.id }"
            @click="selectedId = g.id"
          >
            <span class="pg-accent-strip" :style="{ background: accentByDepth(g._depth) }"></span>
            <div class="pg-group-body">
              <div class="pg-group-name">
                <span v-if="g._depth > 0" class="pg-indent-arrow">└</span>{{ g.name }}
              </div>
              <div class="pg-group-meta">
                <span v-if="g.isSystem" class="at-chip chip-system chip-xs">🛡 Hệ thống</span>
                <span v-else class="at-chip chip-custom chip-xs">✎ Tùy chỉnh</span>
                <span class="pg-count">👥 {{ memberCountsLive[g.id] ?? 0 }}</span>
                <span class="pg-grants-mini" :style="{ color: grantsColor(grantsPct(g)) }">
                  {{ grantsActive(g) }}/{{ totalSlots }}
                </span>
              </div>
            </div>
          </li>
        </ul>
        <button class="pg-add-btn" @click="openCreate(null)">+ Thêm nhóm quyền</button>
      </aside>

      <!-- RIGHT: matrix -->
      <section class="pg-main">
        <div v-if="!selected" class="empty-state" style="margin: 0">
          <div class="empty-icon">⬅</div>
          <h3>Chọn nhóm quyền bên trái</h3>
          <p>Click vào 1 nhóm để bật/tắt site &amp; tab hiển thị.</p>
        </div>

        <template v-else>
          <!-- Matrix header bar -->
          <div class="pg-matrix-head">
            <div class="pg-matrix-title">
              <span class="pg-accent-strip" :style="{ background: accentByDepth(selected._depth ?? 0) }"></span>
              <div>
                <h2 class="pg-name-big">{{ selected.name }}</h2>
                <div class="pg-name-meta">
                  <span v-if="selected.isSystem" class="at-chip chip-system">🛡 Hệ thống</span>
                  <span v-else class="at-chip chip-custom">✎ Tùy chỉnh</span>
                  <span class="at-chip chip-dept">👥 {{ memberCountsLive[selected.id] ?? 0 }} user</span>
                  <span class="at-chip chip-active">✓ {{ grantsActive(selected) }} / {{ totalSlots }} bật</span>
                </div>
              </div>
            </div>
            <div class="pg-matrix-actions">
              <select class="filter-select pg-copy-select" v-model="copyFromId">
                <option value="">📋 Sao chép hiển thị từ...</option>
                <option v-for="g in copyableGroups" :key="g.id" :value="g.id">
                  {{ '— '.repeat(g._depth) }}{{ g.name }} ({{ grantsActive(g) }}/{{ totalSlots }})
                </option>
              </select>
              <button class="btn-ghost btn-sm" :disabled="!copyFromId" @click="doCopyFrom">
                ↓ Áp dụng
              </button>
              <button class="btn-ghost btn-sm" @click="bulkTree(true)">✓ Bật tất cả</button>
              <button class="btn-ghost btn-sm" @click="bulkTree(false)">✗ Ẩn tất cả</button>
            </div>
          </div>

          <!-- Cây hiển thị site / tab -->
          <div class="pg-tree-wrap">
            <p class="pg-tree-hint">
              Bật = user thấy site/tab. Tab con tự khóa khi site cha đang tắt.
              Nút <strong>🔒 Chỉ Admin</strong> chỉ Admin/Owner thấy, không cấp được cho nhóm khác.
            </p>
            <ul class="menu-tree">
              <li v-for="(node, i) in menuTree" :key="i" class="tree-site">
                <div class="tree-row tree-row-site">
                  <label class="tree-toggle">
                    <input
                      v-if="isTickable(node)"
                      type="checkbox"
                      :checked="isNodeOn(node)"
                      @change="toggleNode(node, ($event.target as HTMLInputElement).checked)"
                    />
                    <span v-else-if="node.sensitive" class="lock-badge">🔒 Chỉ Admin</span>
                    <span v-else class="always-badge">Luôn mở</span>
                    <span class="tree-label">{{ node.label }}</span>
                  </label>
                </div>
                <ul v-if="node.children?.length" class="tree-children">
                  <li v-for="(child, j) in node.children" :key="j" class="tree-row tree-row-child">
                    <label class="tree-toggle">
                      <input
                        v-if="isTickable(child)"
                        type="checkbox"
                        :checked="isNodeOn(child)"
                        :disabled="isTickable(node) && !isNodeOn(node)"
                        @change="toggleNode(child, ($event.target as HTMLInputElement).checked)"
                      />
                      <span v-else-if="child.sensitive" class="lock-badge">🔒 Chỉ Admin</span>
                      <span v-else class="always-badge">Luôn mở</span>
                      <span class="tree-label">{{ child.label }}</span>
                    </label>
                  </li>
                </ul>
              </li>
            </ul>
          </div>

          <!-- Save indicator -->
          <div class="pg-save-bar" :class="{ 'is-saving': saving, 'is-saved': justSaved }">
            <span v-if="saving">💾 Đang lưu...</span>
            <span v-else-if="justSaved">✅ Đã lưu</span>
            <span v-else class="pg-save-hint">Mọi thay đổi được tự động lưu</span>
          </div>

          <!-- Danger zone for custom groups -->
          <div v-if="!selected.isSystem" class="pg-danger-zone">
            <div>
              <strong>Xóa nhóm "{{ selected.name }}"</strong>
              <p class="pg-danger-hint">Chỉ xóa được khi nhóm rỗng (không user, không nhóm con).</p>
            </div>
            <button class="btn-danger" @click="confirmArchive">🗑 Xóa nhóm</button>
          </div>
        </template>
      </section>
    </div>

    <!-- Create modal -->
    <Transition name="modal-fade">
      <div v-if="showCreate" class="modal-backdrop" @click.self="showCreate = false">
        <div class="modal-card">
          <header class="modal-head">
            <h3>{{ createParentId ? 'Thêm nhóm con' : 'Thêm nhóm quyền gốc' }}</h3>
            <button class="modal-close" @click="showCreate = false">×</button>
          </header>
          <div class="modal-body">
            <p v-if="createParentName" class="parent-hint">
              <span class="hint-label">Thuộc:</span><strong>{{ createParentName }}</strong>
            </p>
            <label class="form-label">Tên nhóm quyền</label>
            <input
              ref="nameInput"
              v-model="newName"
              placeholder="VD: Sale Cấp Cao"
              class="form-input"
              @keyup.enter="submitCreate"
            />
            <label class="form-label" style="margin-top: 14px">Sao chép quyền từ</label>
            <select v-model="cloneFromId" class="form-input">
              <option value="">— Tạo mới (chưa có quyền) —</option>
              <option v-for="g in flatGroupsList" :key="g.id" :value="g.id">
                {{ '— '.repeat(g._depth) }}{{ g.name }} ({{ grantsActive(g) }}/{{ totalSlots }})
              </option>
            </select>
            <p v-if="createError" class="form-error">{{ createError }}</p>
          </div>
          <footer class="modal-foot">
            <button class="btn-ghost" @click="showCreate = false">Hủy</button>
            <button class="btn-primary" :disabled="!newName.trim()" @click="submitCreate">
              Tạo nhóm
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRbacStore, type PermissionGroupNode, type RbacUser, type MenuNode } from '@/stores/rbac';
import { api } from '@/api/index';

const store = useRbacStore();
const allUsers = ref<RbacUser[]>([]);
const searchQ = ref('');
const seeding = ref(false);
const saving = ref(false);
const justSaved = ref(false);
const copyFromId = ref('');

const selectedId = ref<string | null>(null);
// Bản nháp grants của nhóm đang chọn — checkbox bind vào đây để tick mượt, không phụ
// thuộc reload store. Đồng bộ từ store khi đổi nhóm (watch ở mục Grant mutations).
const localGrants = ref<Record<string, Record<string, boolean>>>({});

onMounted(async () => {
  await Promise.all([
    store.loadPermissionGroups(),
    api.get('/rbac/users').then((r) => { allUsers.value = r.data.users ?? []; }).catch(() => {}),
  ]);
  // Auto-select first group
  if (store.permissionGroups.length > 0 && !selectedId.value) {
    selectedId.value = flatGroupsList.value[0]?.id ?? null;
  }
});

const menuTree = computed<MenuNode[]>(() => store.matrixMeta?.menuTree ?? []);

// Node "tickable" = có key + không nhạy cảm. Nút nhạy cảm khóa cứng cho admin;
// nút key=null (Cá nhân) luôn mở → không render checkbox.
function isTickable(node: MenuNode): boolean {
  return !!node.key && !node.sensitive;
}
function nodeAction(node: MenuNode): string {
  return node.action ?? 'access';
}
function isNodeOn(node: MenuNode): boolean {
  if (!node.key) return false;
  return !!localGrants.value[node.key]?.[nodeAction(node)];
}
function collectTickable(nodes: MenuNode[]): MenuNode[] {
  const out: MenuNode[] = [];
  for (const n of nodes) {
    if (isTickable(n)) out.push(n);
    if (n.children?.length) out.push(...collectTickable(n.children));
  }
  return out;
}

const totalSlots = computed(() => collectTickable(menuTree.value).length);

const memberCountsLive = computed(() => {
  const m: Record<string, number> = {};
  for (const u of allUsers.value) {
    if (u.permissionGroupId) m[u.permissionGroupId] = (m[u.permissionGroupId] ?? 0) + 1;
  }
  return m;
});

const flatGroupsList = computed(() => {
  const out: Array<PermissionGroupNode & { _depth: number }> = [];
  function walk(nodes: PermissionGroupNode[], depth: number) {
    for (const n of nodes) {
      out.push({ ...n, _depth: depth });
      if (n.children?.length) walk(n.children, depth + 1);
    }
  }
  walk(store.permissionGroups, 0);
  return out;
});

const filteredGroups = computed(() => {
  const q = searchQ.value.trim().toLowerCase();
  if (!q) return flatGroupsList.value;
  return flatGroupsList.value.filter((g) => g.name.toLowerCase().includes(q));
});

const selected = computed(() => flatGroupsList.value.find((g) => g.id === selectedId.value));

const copyableGroups = computed(() =>
  flatGroupsList.value.filter((g) => g.id !== selectedId.value)
);

const stats = computed(() => {
  let total = 0, system = 0, totalMembers = 0;
  for (const g of flatGroupsList.value) {
    total++;
    if (g.isSystem) system++;
    totalMembers += memberCountsLive.value[g.id] ?? 0;
  }
  return { total, system, totalMembers };
});

const loading = computed(() => store.loading);

watch(
  () => store.permissionGroups,
  async () => {
    try {
      const { data } = await api.get('/rbac/users');
      allUsers.value = data.users ?? [];
    } catch {}
  }
);

// ─── Grants helpers ───
function grantsActive(g: PermissionGroupNode): number {
  let count = 0;
  for (const node of collectTickable(menuTree.value)) {
    if (node.key && g.grants?.[node.key]?.[nodeAction(node)]) count++;
  }
  return count;
}
function grantsPct(g: PermissionGroupNode): number {
  if (totalSlots.value === 0) return 0;
  return Math.round((grantsActive(g) / totalSlots.value) * 100);
}
function grantsColor(pct: number): string {
  if (pct >= 80) return '#aa2d00';
  if (pct >= 50) return '#d9a441';
  if (pct >= 20) return '#1b61c9';
  if (pct > 0) return '#0a2e0e';
  return '#9297a0';
}
function accentByDepth(d: number): string {
  return ['#181d26', '#aa2d00', '#0a2e0e', '#d9a441', '#1b61c9'][Math.min(d, 4)];
}

// ─── Grant mutations (bản nháp local + debounce auto-save, KHÔNG reload cả cây) ───
// Fix 2026-06-20: trước đây mỗi tick gọi updateGroupGrants → loadPermissionGroups()
// reload toàn bộ cây quyền (màn nhảy về đầu trang) + :disabled="saving" khóa checkbox
// (không tick liên tục được) + dựng lại newGrants từ selected.grants mỗi lần (click nhanh
// làm mất tick trước). Nay: tick cập nhật localGrants tức thì, lưu gộp sau 500ms, store
// cập nhật grants TẠI CHỖ nên không re-render cả cây.
// Fix#2 (code-review 2026-06-20): (a) CHỤP snapshot grants theo nhóm NGAY lúc tick (không
// đọc lại localGrants lúc flush) → đổi nhóm giữa chừng không lưu nhầm/mất tick; (b) re-sync
// localGrants ĐỒNG BỘ khi đổi nhóm (không await trước khi nạp) → không có khoảng hiện sai;
// (c) nối CHUỖI save (saveChain) → các PATCH chạy tuần tự, không đè ngược thứ tự.
let saveTimer: any;
let pendingGroupId: string | null = null;
let pendingGrants: Record<string, Record<string, boolean>> | null = null;
let saveChain: Promise<void> = Promise.resolve();

function scheduleSave() {
  if (!selected.value) return;
  pendingGroupId = selected.value.id;
  // Chụp nguyên trạng bản nháp tại đúng thời điểm tick — flush sau dùng snapshot này.
  pendingGrants = JSON.parse(JSON.stringify(localGrants.value));
  saving.value = true;
  justSaved.value = false;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 500);
}

function flushSave() {
  clearTimeout(saveTimer);
  const gid = pendingGroupId;
  const grants = pendingGrants;
  pendingGroupId = null;
  pendingGrants = null;
  if (!gid || !grants) { saving.value = false; return; }
  // Nối chuỗi: PATCH chạy lần lượt theo thứ tự lên lịch (snapshot sau ⊇ snapshot trước).
  saveChain = saveChain.then(async () => {
    try {
      await store.updateGroupGrants(gid, grants);
      justSaved.value = true;
      setTimeout(() => { justSaved.value = false; }, 1500);
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Lỗi cập nhật quyền');
      // Lưu lỗi → nếu vẫn đang ở đúng nhóm đó, khôi phục bản nháp từ store.
      if (selected.value?.id === gid) {
        localGrants.value = JSON.parse(JSON.stringify(selected.value?.grants ?? {}));
      }
    } finally {
      // Chỉ tắt "Đang lưu..." khi không còn lần lưu nào đang chờ.
      if (!pendingGroupId) saving.value = false;
    }
  });
}

// Đổi nhóm → lưu nốt nhóm trước (dùng snapshot đã chụp, không cần await) rồi nạp bản nháp
// nhóm mới NGAY (đồng bộ) — không còn khoảng "header nhóm mới + tick nhóm cũ".
watch(selectedId, (_newId, oldId) => {
  if (oldId && pendingGroupId) flushSave();
  localGrants.value = JSON.parse(JSON.stringify(selected.value?.grants ?? {}));
}, { immediate: true });

// Rời trang khi còn thay đổi chưa lưu → lưu nốt.
onBeforeUnmount(() => { if (pendingGroupId) flushSave(); });

function toggleNode(node: MenuNode, value: boolean) {
  if (!selected.value || !node.key) return;
  const action = nodeAction(node);
  if (!localGrants.value[node.key]) localGrants.value[node.key] = {};
  localGrants.value[node.key][action] = value;
  // Tắt site cha → tắt luôn các tab con (đồng bộ với UI: con bị disable khi cha off).
  if (!value) {
    const site = menuTree.value.find((n) => n === node);
    if (site?.children?.length) {
      for (const child of site.children) {
        if (isTickable(child) && child.key) {
          if (!localGrants.value[child.key]) localGrants.value[child.key] = {};
          localGrants.value[child.key][nodeAction(child)] = false;
        }
      }
    }
  }
  scheduleSave();
}

function bulkTree(value: boolean) {
  if (!selected.value) return;
  if (value && !confirm(`Bật hiển thị TẤT CẢ site/tab cho nhóm "${selected.value.name}"?`)) return;
  if (!value && !confirm(`Ẩn TẤT CẢ site/tab của nhóm "${selected.value.name}"?`)) return;
  for (const node of collectTickable(menuTree.value)) {
    if (!node.key) continue;
    if (!localGrants.value[node.key]) localGrants.value[node.key] = {};
    localGrants.value[node.key][nodeAction(node)] = value;
  }
  scheduleSave();
}

async function doCopyFrom() {
  if (!selected.value || !copyFromId.value) return;
  const src = flatGroupsList.value.find((g) => g.id === copyFromId.value);
  if (!src) return;
  if (!confirm(`Sao chép quyền từ "${src.name}" sang "${selected.value.name}"? Sẽ ghi đè quyền hiện tại của ${selected.value.name}.`)) return;
  localGrants.value = JSON.parse(JSON.stringify(src.grants ?? {}));
  scheduleSave();
  copyFromId.value = '';
}

async function confirmArchive() {
  if (!selected.value) return;
  if (!confirm(`Xóa nhóm "${selected.value.name}"? Chỉ xóa được khi nhóm rỗng.`)) return;
  try {
    await api.delete(`/permission-groups/${selected.value.id}`);
    await store.loadPermissionGroups();
    selectedId.value = flatGroupsList.value[0]?.id ?? null;
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Lỗi xóa nhóm');
  }
}

// ─── Create modal ───
const showCreate = ref(false);
const createParentId = ref<string | null>(null);
const createParentName = ref('');
const newName = ref('');
const cloneFromId = ref('');
const createError = ref('');
const nameInput = ref<HTMLInputElement | null>(null);

function openCreate(parent: PermissionGroupNode | null) {
  createParentId.value = parent?.id ?? null;
  createParentName.value = parent?.name ?? '';
  newName.value = '';
  cloneFromId.value = '';
  createError.value = '';
  showCreate.value = true;
  setTimeout(() => nameInput.value?.focus(), 50);
}
async function submitCreate() {
  if (!newName.value.trim()) return;
  try {
    await store.createPermissionGroup({
      name: newName.value.trim(),
      parentId: createParentId.value,
      cloneFromId: cloneFromId.value || undefined,
    });
    showCreate.value = false;
    // Auto-select newly created group
    const newest = flatGroupsList.value[flatGroupsList.value.length - 1];
    if (newest) selectedId.value = newest.id;
  } catch (e: any) {
    createError.value = e?.response?.data?.error || 'Lỗi tạo nhóm';
  }
}

async function seedDefaults() {
  seeding.value = true;
  try {
    await store.seedDefaultGroups();
    const { data } = await api.get('/rbac/users');
    allUsers.value = data.users ?? [];
    if (!selectedId.value) selectedId.value = flatGroupsList.value[0]?.id ?? null;
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Lỗi seed');
  } finally {
    seeding.value = false;
  }
}
</script>

<style>
/* PermissionGroupsView — Getfly-style 2-col layout + Airtable theme */

.hero-actions { display: flex; gap: 8px; }

.pg-layout {
  display: grid;
  grid-template-columns: 290px 1fr;
  gap: 16px;
  background: white;
  border: 1px solid #e0e2e6;
  border-radius: 12px;
  overflow: hidden;
  min-height: 600px;
  box-shadow: 0 1px 3px rgba(24,29,38,0.04);
}

/* ── Left sidebar ── */
.pg-sidebar {
  background: #f8fafc;
  border-right: 1px solid #e0e2e6;
  display: flex;
  flex-direction: column;
}
.pg-sidebar-head {
  padding: 14px 14px 10px;
  border-bottom: 1px solid #e0e2e6;
}
.pg-group-list {
  list-style: none;
  padding: 8px;
  margin: 0;
  flex: 1;
  overflow-y: auto;
}
.pg-group-item {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.1s;
  align-items: stretch;
  margin-bottom: 4px;
  background: white;
  border: 1px solid transparent;
}
.pg-group-item:hover { background: #fdfdfd; border-color: #e0e2e6; }
.pg-group-item.active {
  background: white;
  border-color: #181d26;
  box-shadow: 0 2px 8px rgba(24,29,38,0.08);
}
.pg-accent-strip {
  width: 4px;
  border-radius: 2px;
  flex-shrink: 0;
}
.pg-group-body { flex: 1; min-width: 0; }
.pg-group-name {
  font-size: 13px;
  font-weight: 600;
  color: #181d26;
  line-height: 1.3;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pg-indent-arrow {
  color: #c9ccd1;
  font-family: 'JetBrains Mono', monospace;
  margin-right: 4px;
}
.pg-group-meta {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}
.chip-xs { font-size: 9px !important; padding: 2px 6px !important; }
.pg-count { font-size: 10px; color: #41454d; font-weight: 500; }
.pg-grants-mini { font-size: 10px; font-weight: 700; font-variant-numeric: tabular-nums; }

.pg-add-btn {
  margin: 12px;
  background: white;
  border: 1px dashed #9297a0;
  color: #41454d;
  padding: 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.1s;
}
.pg-add-btn:hover { border-color: #181d26; color: #181d26; background: #f8fafc; }

/* ── Right pane ── */
.pg-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.pg-matrix-head {
  padding: 16px 20px;
  border-bottom: 1px solid #e0e2e6;
  background: white;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}
.pg-matrix-title {
  display: flex;
  gap: 12px;
  align-items: stretch;
  min-width: 0;
}
.pg-matrix-title .pg-accent-strip { width: 5px; height: 44px; }
.pg-name-big {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 6px;
  color: #181d26;
  letter-spacing: -0.01em;
}
.pg-name-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.pg-matrix-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.pg-copy-select {
  min-width: 220px;
  font-size: 12px;
}
.btn-sm {
  font-size: 12px !important;
  padding: 7px 12px !important;
}

/* ── Cây hiển thị site / tab ── */
.pg-tree-wrap {
  overflow: auto;
  flex: 1;
  background: white;
  padding: 16px 20px;
}
.pg-tree-hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: #5f6173;
  line-height: 1.5;
}
.pg-tree-hint strong { color: #7a2000; }
.menu-tree {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid #e0e2e6;
  border-radius: 8px;
  overflow: hidden;
  background: white;
}
.tree-site + .tree-site { border-top: 1px solid #f0f1f3; }
.tree-row { display: flex; align-items: center; }
.tree-row-site {
  padding: 10px 14px;
  background: #f8fafc;
}
.tree-children { list-style: none; margin: 0; padding: 0; }
.tree-row-child {
  padding: 8px 14px 8px 34px;
  border-top: 1px solid #f4f5f7;
}
.tree-row-child:hover { background: #fafbfc; }
.tree-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  width: 100%;
}
.tree-toggle input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #0a2e0e;
  flex-shrink: 0;
}
.tree-toggle input:disabled { cursor: not-allowed; opacity: 0.4; }
.tree-label {
  font-size: 13px;
  color: #181d26;
  font-weight: 500;
}
.tree-row-site .tree-label { font-weight: 600; }
.lock-badge {
  font-size: 10px;
  font-weight: 600;
  color: #7a2000;
  background: #fbe6dc;
  border-radius: 4px;
  padding: 2px 6px;
  flex-shrink: 0;
}
.always-badge {
  font-size: 10px;
  font-weight: 600;
  color: #0a2e0e;
  background: #e3ede4;
  border-radius: 4px;
  padding: 2px 6px;
  flex-shrink: 0;
}

/* Save bar */
.pg-save-bar {
  padding: 10px 20px;
  border-top: 1px solid #e0e2e6;
  background: #f8fafc;
  font-size: 12px;
  color: #41454d;
  display: flex;
  align-items: center;
  gap: 8px;
}
.pg-save-bar.is-saving { color: #1b61c9; background: #eef4fc; }
.pg-save-bar.is-saved { color: #0a2e0e; background: #e3ede4; }
.pg-save-hint { color: #9297a0; font-style: italic; }

/* Danger zone */
.pg-danger-zone {
  margin: 0 20px 20px;
  padding: 16px;
  background: #fbe6dc;
  border: 1px solid rgba(170,45,0,0.2);
  border-radius: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.pg-danger-zone strong { color: #7a2000; font-size: 13px; }
.pg-danger-hint { font-size: 11px; color: #41454d; margin: 4px 0 0; }
.btn-danger {
  background: white;
  border: 1px solid #aa2d00;
  color: #aa2d00;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}
.btn-danger:hover { background: #aa2d00; color: white; }
</style>
