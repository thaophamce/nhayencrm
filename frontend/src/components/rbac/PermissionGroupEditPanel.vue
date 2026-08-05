<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <Transition name="panel-slide">
    <div v-if="open" class="panel-backdrop" @click.self="$emit('close')">
      <aside class="panel">
        <header class="panel-head">
          <div class="head-left">
            <div class="head-accent" :style="{ background: accentColor }"></div>
            <div>
              <div class="head-eyebrow">Nhóm quyền</div>
              <h2 class="head-title">{{ localName || '...' }}</h2>
            </div>
          </div>
          <button class="panel-close" @click="$emit('close')">×</button>
        </header>

        <div class="panel-body">
          <!-- ── Info section ─────────────────────── -->
          <section class="section">
            <h3 class="section-title">Thông tin</h3>
            <label class="field-label">Tên nhóm quyền</label>
            <input
              v-model="localName"
              class="field-input"
              :disabled="isSystem || busy"
              @blur="saveName"
              @keyup.enter="saveName"
            />
            <div v-if="isSystem" class="parent-hint hint-warning">
              <span class="hint-label">Hệ thống:</span>
              <strong>Nhóm mặc định — chỉ sửa được ô tick quyền, không đổi tên/xóa.</strong>
            </div>
            <div v-else-if="parentName" class="parent-hint">
              <span class="hint-label">Thuộc:</span>
              <strong>{{ parentName }}</strong>
            </div>
          </section>

          <!-- ── Cây hiển thị site / tab ─────────────── -->
          <section class="section">
            <div class="section-title-row">
              <h3 class="section-title">Hiển thị site &amp; tab</h3>
              <div class="matrix-stats">
                <span class="stat-chip stat-on">{{ totalChecked }} bật</span>
              </div>
            </div>

            <div class="bulk-row">
              <button class="btn-bulk" :disabled="busy" @click="bulkTree(true)">✓ Bật tất cả</button>
              <button class="btn-bulk" :disabled="busy" @click="bulkTree(false)">× Ẩn tất cả</button>
              <span class="bulk-sep">|</span>
              <span class="bulk-hint">Bật = user thấy site/tab. Nút "Chỉ Admin" khóa cứng, không cấp cho nhóm khác.</span>
            </div>

            <ul class="menu-tree">
              <li v-for="(node, i) in menuTree" :key="i" class="tree-site">
                <div class="tree-row tree-row-site">
                  <label class="tree-toggle">
                    <input
                      v-if="isTickable(node)"
                      type="checkbox"
                      :checked="isNodeOn(node)"
                      :disabled="busy"
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
                        :disabled="busy || (isTickable(node) && !isNodeOn(node))"
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
          </section>

          <!-- ── Members list ─────────────────────── -->
          <section class="section">
            <div class="section-title-row">
              <h3 class="section-title">Thành viên ({{ members.length }})</h3>
            </div>
            <ul v-if="members.length" class="member-list">
              <li v-for="m in members" :key="m.id" class="member-row">
                <span class="member-avatar" :style="{ background: avatarColor(m.fullName) }">
                  {{ initials(m.fullName) }}
                </span>
                <div class="member-info">
                  <div class="member-name">{{ m.fullName }}</div>
                  <div class="member-email">{{ m.email }}</div>
                </div>
                <button
                  class="btn-remove-member"
                  :disabled="busy"
                  title="Bỏ gán nhóm này"
                  @click="unassignUser(m.id)"
                >×</button>
              </li>
            </ul>
            <div v-else class="empty-members">
              Chưa có user nào dùng nhóm quyền này.
            </div>
          </section>

          <!-- ── Danger zone ─────────────────────── -->
          <section v-if="!isSystem" class="section section-danger">
            <h3 class="section-title danger-title">Vùng nguy hiểm</h3>
            <p class="danger-desc">
              Xóa nhóm quyền — chỉ khi không còn user nào đang gán. Khôi phục bằng cách tạo lại.
            </p>
            <button class="btn-danger" :disabled="busy || members.length > 0" @click="confirmArchive">
              🗑 Xóa nhóm quyền
            </button>
            <p v-if="members.length > 0" class="danger-warn">
              Còn {{ members.length }} user — bỏ gán hết trước khi xóa.
            </p>
          </section>
        </div>

        <p v-if="error" class="panel-error">{{ error }}</p>
      </aside>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRbacStore, type PermissionGroupNode, type RbacUser, type MenuNode } from '@/stores/rbac';
import { api } from '@/api/index';

const props = defineProps<{
  open: boolean;
  node: (PermissionGroupNode & { _depth?: number }) | null;
  parentName?: string | null;
  allUsers: RbacUser[];
}>();
const emit = defineEmits<{ close: []; archived: [] }>();

const store = useRbacStore();
const busy = ref(false);
const error = ref('');

const localName = ref('');
const localGrants = ref<Record<string, Record<string, boolean>>>({});

const isSystem = computed(() => !!props.node?.isSystem);

const accentColor = computed(() => {
  const depth = props.node?._depth ?? 0;
  return ['#181d26', '#aa2d00', '#0a2e0e', '#d9a441', '#1b61c9'][Math.min(depth, 4)];
});

const menuTree = computed<MenuNode[]>(() => store.matrixMeta?.menuTree ?? []);

const members = computed(() =>
  props.allUsers.filter((u) => u.permissionGroupId === props.node?.id)
);

// Node "tickable" = có key + không nhạy cảm. Nút nhạy cảm khóa cứng cho admin,
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

// Đếm số node tickable đang bật (thống kê hiển thị).
function collectTickable(nodes: MenuNode[]): MenuNode[] {
  const out: MenuNode[] = [];
  for (const n of nodes) {
    if (isTickable(n)) out.push(n);
    if (n.children?.length) out.push(...collectTickable(n.children));
  }
  return out;
}

const totalChecked = computed(() =>
  collectTickable(menuTree.value).filter((n) => isNodeOn(n)).length
);

watch(
  () => [props.open, props.node?.id],
  () => {
    if (!props.open || !props.node) return;
    localName.value = props.node.name;
    localGrants.value = JSON.parse(JSON.stringify(props.node.grants ?? {}));
    error.value = '';
  },
  { immediate: true }
);

async function saveName() {
  if (!props.node || isSystem.value) return;
  if (!localName.value.trim() || localName.value === props.node.name) return;
  busy.value = true;
  try {
    await api.patch(`/permission-groups/${props.node.id}`, { name: localName.value.trim() });
    await store.loadPermissionGroups();
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Lỗi đổi tên';
    localName.value = props.node.name;
  } finally {
    busy.value = false;
  }
}

async function persistGrants() {
  if (!props.node) return;
  busy.value = true;
  error.value = '';
  try {
    await store.updateGroupGrants(props.node.id, localGrants.value);
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Lỗi cập nhật quyền';
  } finally {
    busy.value = false;
  }
}

async function toggleNode(node: MenuNode, value: boolean) {
  if (!node.key) return;
  const action = nodeAction(node);
  if (!localGrants.value[node.key]) localGrants.value[node.key] = {};
  localGrants.value[node.key][action] = value;

  const parentSite = menuTree.value.find((parent) => parent.children?.some((child) => child === node));

  if (value && parentSite && isTickable(parentSite) && parentSite.key) {
    const parentAction = nodeAction(parentSite);
    if (!localGrants.value[parentSite.key]) localGrants.value[parentSite.key] = {};
    localGrants.value[parentSite.key][parentAction] = true;
  }

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
  await persistGrants();
}

async function bulkTree(value: boolean) {
  for (const node of collectTickable(menuTree.value)) {
    if (!node.key) continue;
    if (!localGrants.value[node.key]) localGrants.value[node.key] = {};
    localGrants.value[node.key][nodeAction(node)] = value;
  }
  await persistGrants();
}

async function unassignUser(userId: string) {
  busy.value = true;
  try {
    await store.setUserPermissionGroup(userId, null);
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Lỗi bỏ gán';
  } finally {
    busy.value = false;
  }
}

async function confirmArchive() {
  if (!props.node) return;
  if (!confirm(`Xóa nhóm quyền "${props.node.name}"?`)) return;
  busy.value = true;
  try {
    await api.delete(`/permission-groups/${props.node.id}`);
    await store.loadPermissionGroups();
    emit('archived');
    emit('close');
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Lỗi xóa';
  } finally {
    busy.value = false;
  }
}

function initials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function avatarColor(name: string): string {
  const colors = ['#aa2d00', '#0a2e0e', '#d9a441', '#1b61c9', '#7a2000', '#1a3866'];
  const h = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return colors[h % colors.length];
}
</script>

<style>
/* PermissionGroupEditPanel — reuse pattern from DepartmentEditPanel */
/* Most classes shared via DepartmentEditPanel's non-scoped styles. */
/* Adds matrix-specific styles only. */

.matrix-stats { display: flex; gap: 6px; }
.stat-chip {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 9999px;
  background: #f0f1f3;
  color: #41454d;
}
.stat-chip.stat-on { background: #e3ede4; color: #0a2e0e; }

.bulk-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.btn-bulk {
  background: white;
  border: 1px dashed #9297a0;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  color: #41454d;
}
.btn-bulk:hover { background: #181d26; color: white; border-color: #181d26; border-style: solid; }
.btn-bulk:disabled { opacity: 0.4; cursor: not-allowed; }
.bulk-sep { color: #d6d8dc; font-size: 11px; }
.bulk-hint { font-size: 10px; color: #9297a0; font-style: italic; }

/* ── Cây hiển thị site / tab ─────────────────────────── */
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
  padding: 8px 12px;
  background: #f8fafc;
}
.tree-children { list-style: none; margin: 0; padding: 0; }
.tree-row-child {
  padding: 6px 12px 6px 30px;
  border-top: 1px solid #f4f5f7;
}
.tree-row-child:hover { background: #fafbfc; }
.tree-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  width: 100%;
}
.tree-toggle input[type="checkbox"] {
  width: 15px;
  height: 15px;
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

.hint-warning { background: #fbe6dc !important; border-left-color: #aa2d00 !important; color: #7a2000 !important; }

.danger-warn {
  margin: 8px 0 0;
  font-size: 11px;
  color: #7a2000;
  font-style: italic;
}
</style>
