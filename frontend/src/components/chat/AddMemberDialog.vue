<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Dialog thêm thành viên vào nhóm — giống group-create-dialog nhưng bỏ bước nhập tên nhóm. -->
<template>
  <v-dialog v-model="open" max-width="560" persistent scrollable>
    <div class="gcd-shell">
      <header class="gcd-head">
        <strong>Thêm thành viên vào nhóm</strong>
        <button type="button" aria-label="Đóng" @click="cancel">✕</button>
      </header>

      <div class="gcd-toolbar">
        <label class="gcd-search">
          <span>⌕</span>
          <input v-model="search" placeholder="Nhập tên, số điện thoại hoặc UID Zalo" @input="debouncedLoad" />
        </label>
        <div v-if="availableTags.length" class="gcd-tags-wrap">
          <button v-show="canScrollTagsLeft" type="button" class="gcd-tag-arrow left" aria-label="Xem nhãn bên trái" @click="scrollTags(-1)">&#8249;</button>
          <div ref="tagsScroller" class="gcd-tags" @scroll.passive="updateTagScrollState">
            <button :class="{ active: !activeTag }" @click="selectNativeTag('')">Tất cả</button>
            <button
              v-for="tag in availableTags"
              :key="tag.key"
              class="gcd-native-tag"
              :class="{ active: activeTag === tag.key }"
              :style="{ '--tag-color': tag.color }"
              :title="`${tag.assignedCount} bạn đang có nhãn này`"
              @click="selectNativeTag(tag.key)"
            ><span class="gcd-tag-dot" />{{ tag.name }}<small>{{ tag.assignedCount }}</small></button>
          </div>
          <button v-show="canScrollTagsRight" type="button" class="gcd-tag-arrow right" aria-label="Xem nhãn bên phải" @click="scrollTags(1)">&#8250;</button>
        </div>
      </div>

      <main class="gcd-body">
        <div v-if="selectedMembers.length" class="gcd-picked">
          <span>Đã chọn {{ selectedMembers.length }}</span>
          <div class="gcd-picked-list">
            <button v-for="member in selectedMembers" :key="member.uid" :title="`Bỏ chọn ${member.name}`" @click="toggle(member)">
              <img v-if="member.avatarUrl" :src="member.avatarUrl" alt="" />
              <span v-else>{{ initials(member.name) }}</span>
              <i>×</i>
            </button>
          </div>
        </div>

        <div class="gcd-section-title">Trò chuyện gần đây</div>
        <div v-if="loading" class="gcd-state">Đang tải danh sách bạn bè…</div>
        <div v-else-if="!members.length" class="gcd-state">
          <template v-if="!accountId">⚠ Không xác định được tài khoản Zalo. Vui lòng thử lại.</template>
          <template v-else>Không tìm thấy người phù hợp</template>
        </div>
        <div v-else class="gcd-list">
          <button v-for="member in members" :key="member.uid" type="button" class="gcd-row" @click="toggle(member)">
            <span class="gcd-check" :class="{ checked: selected.has(member.uid) }">{{ selected.has(member.uid) ? '✓' : '' }}</span>
            <span class="gcd-avatar"><img v-if="member.avatarUrl" :src="member.avatarUrl" alt="" /><span v-else>{{ initials(member.name) }}</span></span>
            <span class="gcd-person"><strong>{{ member.name }}</strong><small v-if="member.phone">{{ member.phone }}</small></span>
          </button>
        </div>
      </main>

      <footer class="gcd-foot">
        <span>{{ selected.size }} người được chọn</span>
        <button class="secondary" type="button" @click="cancel">Hủy</button>
        <button class="primary" type="button" :disabled="selected.size === 0 || loading" @click="confirm">Thêm vào nhóm</button>
      </footer>
    </div>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { api } from '@/api';

interface PickerMember {
  uid: string;
  name: string;
  avatarUrl: string;
  phone: string;
  tags: Array<{ key: string; name: string; color: string }>;
  lastInteractionAt: string;
}

const props = defineProps<{
  modelValue: boolean;
  accountId?: string | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  add: [memberIds: string[]];
}>();

const open = ref(props.modelValue);
const loading = ref(false);
const search = ref('');
const activeTag = ref('');
const members = ref<PickerMember[]>([]);
const selected = ref<Set<string>>(new Set());

const tagsScroller = ref<HTMLElement | null>(null);
const canScrollTagsLeft = ref(false);
const canScrollTagsRight = ref(false);

type NativeLabel = { key: string; id: number; name: string; color: string; assignedCount: number; offset: number };
const nativeLabels = ref<NativeLabel[]>([]);
const availableTags = computed(() => nativeLabels.value);

const selectedMembers = computed(() => {
  const byId = new Map(members.value.map(m => [m.uid, m]));
  return [...selected.value].map(uid => byId.get(uid) || { uid, name: 'Thành viên', avatarUrl: '', phone: '', tags: [], lastInteractionAt: '' });
});

watch(() => props.modelValue, (value) => {
  open.value = value;
  if (value) {
    selected.value = new Set();
    search.value = '';
    activeTag.value = '';
    void initializePicker();
  }
}, { immediate: true });

watch(open, (value) => emit('update:modelValue', value));
// accountId có thể resolve bất đồng bộ → nạp lại thẻ + thành viên khi sẵn sàng.
watch(() => props.accountId, () => { if (open.value) void initializePicker(); });

let timer: ReturnType<typeof setTimeout> | undefined;
function debouncedLoad() { clearTimeout(timer); timer = setTimeout(loadMembers, 250); }

async function initializePicker() {
  await Promise.all([loadNativeLabels(), loadMembers()]);
}

async function loadNativeLabels() {
  if (!props.accountId) { nativeLabels.value = []; return; }
  try {
    const { data } = await api.get(`/zalo-accounts/${props.accountId}/labels`);
    nativeLabels.value = (data.labels || []).map((label: any) => ({
      key: `zalo:${String(label.id)}`,
      id: Number(label.id),
      name: String(label.text || 'Nhãn Zalo'),
      color: normalizeTagColor(label.color),
      assignedCount: Number(label.assignedCount || 0),
      offset: Number(label.offset || 0),
    })).sort((a: NativeLabel, b: NativeLabel) => a.offset - b.offset);
    await nextTick();
    updateTagScrollState();
  } catch { nativeLabels.value = []; }
}

function updateTagScrollState() {
  const el = tagsScroller.value;
  if (!el) { canScrollTagsLeft.value = false; canScrollTagsRight.value = false; return; }
  canScrollTagsLeft.value = el.scrollLeft > 2;
  canScrollTagsRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
}

function scrollTags(direction: -1 | 1) {
  const el = tagsScroller.value;
  if (!el) return;
  el.scrollBy({ left: direction * Math.max(180, el.clientWidth * 0.7), behavior: 'smooth' });
  window.setTimeout(updateTagScrollState, 350);
}

function selectedNativeLabelId(): number | undefined {
  if (!activeTag.value.startsWith('zalo:')) return undefined;
  const id = Number(activeTag.value.slice(5));
  return Number.isInteger(id) ? id : undefined;
}

function selectNativeTag(key: string) {
  activeTag.value = !key || activeTag.value === key ? '' : key;
  void loadMembers();
}

let memberRequestId = 0;
async function loadMembers() {
  if (!props.accountId) { members.value = []; return; }
  const requestId = ++memberRequestId;
  loading.value = true;
  try {
    const { data } = await api.get(`/zalo-accounts/${props.accountId}/friends-db/picker`, {
      params: { limit: 80, search: search.value, zaloLabelId: selectedNativeLabelId() },
    });
    if (requestId !== memberRequestId) return;
    members.value = (data.friends || []).map((friend: any) => ({
      uid: String(friend.zaloUidInNick || ''),
      name: friend.aliasInNick || friend.zaloDisplayName || friend.contact?.crmName || friend.contact?.fullName || 'Bạn Zalo',
      avatarUrl: friend.zaloAvatarUrl || friend.contact?.avatarUrl || '',
      phone: friend.contact?.phone || '',
      tags: normalizeZaloLabels(friend.zaloLabels),
      lastInteractionAt: friend.lastInteractionAt || '',
    })).filter((m: PickerMember) => m.uid);
  } catch { if (requestId === memberRequestId) members.value = []; }
  finally { if (requestId === memberRequestId) loading.value = false; }
}

function normalizeTagColor(value: unknown): string {
  const raw = String(value || '').trim();
  if (/^#[0-9a-f]{3,8}$/i.test(raw)) return raw;
  if (/^rgb(a)?\(/i.test(raw)) return raw;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return `#${(numeric & 0xffffff).toString(16).padStart(6, '0')}`;
  return '#4DA3FF';
}

function normalizeZaloLabels(labels: unknown): Array<{ key: string; name: string; color: string }> {
  if (!Array.isArray(labels)) return [];
  const unique = new Map<string, { key: string; name: string; color: string }>();
  for (const label of labels) {
    const name = String(label?.name || '').trim();
    if (!name) continue;
    const key = label?.id != null ? `zalo:${String(label.id)}` : `zalo-name:${name.toLocaleLowerCase('vi')}`;
    if (!unique.has(key)) unique.set(key, { key, name, color: normalizeTagColor(label?.color) });
  }
  return [...unique.values()];
}

function toggle(member: PickerMember) {
  const next = new Set(selected.value);
  next.has(member.uid) ? next.delete(member.uid) : next.add(member.uid);
  selected.value = next;
}

function initials(name: string) {
  const words = name.trim().split(/\s+/);
  return (words[0]?.[0] || '?') + (words.length > 1 ? words.at(-1)?.[0] || '' : '');
}

function confirm() {
  if (!selected.value.size) return;
  emit('add', [...selected.value]);
  open.value = false;
}

function cancel() {
  open.value = false;
  members.value = [];
  nativeLabels.value = [];
  selected.value = new Set();
  search.value = '';
  activeTag.value = '';
}
</script>

<style scoped>
.gcd-shell {
  --gcd-primary: var(--smax-primary, #2F80ED);
  --gcd-primary-hover: var(--smax-primary-hover, #1a6fd4);
  --gcd-primary-soft: var(--smax-primary-soft, #EBF3FF);
  --gcd-text: var(--smax-text, #1E202C);
  --gcd-muted: var(--smax-grey-700, #5F6173);
  --gcd-line: var(--smax-grey-200, #EAECEF);
  --gcd-surface: var(--smax-grey-100, #F7F8FC);
  background: var(--smax-bg, #fff); border-radius: var(--smax-radius-sm, 10px); overflow: hidden;
  box-shadow: 0 20px 60px rgba(30,32,44,.24); color: var(--gcd-text);
  font-family: 'Quicksand', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  border: 1px solid var(--gcd-line);
}
.gcd-head { min-height: 56px; padding: 0 20px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--gcd-line); background: #fff; }
.gcd-head strong { font-size: 16px; font-weight: 700; }
.gcd-head button { width: 32px; height: 32px; border: 0; border-radius: 50%; background: transparent; color: var(--gcd-muted); font-size: 17px; cursor: pointer; }
.gcd-head button:hover { background: var(--gcd-primary-soft); color: var(--gcd-primary); }
.gcd-toolbar { padding: 14px 18px 10px; border-bottom: 1px solid var(--gcd-line); background: #fff; }
.gcd-search { height: 42px; border: 1px solid var(--gcd-line); border-radius: var(--smax-radius-sm, 10px); display: flex; align-items: center; gap: 8px; padding: 0 13px; color: var(--gcd-muted); transition: border-color .15s, box-shadow .15s; }
.gcd-search:focus-within { border-color: var(--gcd-primary); box-shadow: 0 0 0 3px var(--gcd-primary-soft); }
.gcd-search span { font-size: 18px; }
.gcd-search input { border: 0; outline: 0; min-width: 0; flex: 1; font: inherit; font-size: 13px; color: var(--gcd-text); background: transparent; }
.gcd-search input::placeholder { color: #9398a7; }
.gcd-tags-wrap { position: relative; margin-top: 11px; }
.gcd-tags { display: flex; gap: 7px; overflow-x: auto; padding-right: 28px; scroll-behavior: smooth; scrollbar-width: none; }
.gcd-tags::-webkit-scrollbar { display: none; }
.gcd-tag-arrow { position: absolute; z-index: 2; top: 50%; transform: translateY(-50%); width: 28px; height: 30px; padding: 0; border: 1px solid var(--gcd-line); border-radius: 50%; background: #fff; color: var(--gcd-primary); box-shadow: 0 2px 8px rgba(30,32,44,.16); font: 700 22px/26px Arial, sans-serif; cursor: pointer; }
.gcd-tag-arrow:hover { background: var(--gcd-primary-soft); }
.gcd-tag-arrow.left { left: -7px; }
.gcd-tag-arrow.right { right: -7px; }
.gcd-tags button { border: 1px solid transparent; border-radius: 999px; background: var(--gcd-surface); color: var(--gcd-muted); padding: 5px 12px; white-space: nowrap; font: 600 11px/1.2 inherit; cursor: pointer; }
.gcd-tags button:hover { border-color: #d8d2ff; color: var(--gcd-primary); }
.gcd-tags button.active { background: var(--gcd-primary); color: #fff; }
.gcd-tags .gcd-native-tag { display: inline-flex; align-items: center; gap: 6px; }
.gcd-native-tag small { min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px; display: inline-grid; place-items: center; background: rgba(95,97,115,.12); color: inherit; font: 700 9px/1 inherit; }
.gcd-native-tag.active small { background: rgba(255,255,255,.22); }
.gcd-tag-dot { width: 11px; height: 11px; border-radius: 50%; flex: 0 0 auto; background: var(--tag-color, #4DA3FF); box-shadow: inset 0 0 0 1px rgba(0,0,0,.18); }
.gcd-tags .gcd-native-tag.active .gcd-tag-dot { box-shadow: 0 0 0 2px rgba(255,255,255,.7), inset 0 0 0 1px rgba(0,0,0,.15); }
.gcd-body { height: min(500px, 62vh); overflow-y: auto; background: #fff; scrollbar-color: #d8dbe3 transparent; scrollbar-width: thin; }
.gcd-picked { padding: 10px 18px; border-bottom: 1px solid var(--gcd-line); background: var(--gcd-primary-soft); }
.gcd-picked > span { font-size: 11px; font-weight: 600; color: var(--gcd-primary-700, #1565c0); }
.gcd-picked-list { display: flex; gap: 8px; margin-top: 8px; overflow-x: auto; }
.gcd-picked-list button { position: relative; width: 36px; height: 36px; border: 2px solid #fff; box-shadow: 0 0 0 1px #d8d2ff; border-radius: 50%; padding: 0; background: #e9e5ff; color: var(--gcd-primary); font: 700 10px inherit; cursor: pointer; flex: 0 0 auto; }
.gcd-picked-list img, .gcd-avatar img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
.gcd-picked-list i { position: absolute; right: -4px; top: -5px; width: 15px; height: 15px; border-radius: 50%; background: var(--gcd-primary); color: #fff; border: 1px solid #fff; font-style: normal; font-size: 11px; line-height: 13px; }
.gcd-section-title { padding: 14px 18px 7px; font-size: 12px; font-weight: 700; color: var(--gcd-text); }
.gcd-list { padding: 0 8px 10px; }
.gcd-row { width: 100%; min-height: 54px; padding: 6px 10px; border: 0; border-radius: var(--smax-radius-sm, 10px); background: #fff; display: flex; align-items: center; gap: 11px; text-align: left; cursor: pointer; font-family: inherit; }
.gcd-row:hover { background: var(--gcd-primary-soft); }
.gcd-check { width: 19px; height: 19px; border: 1.5px solid #c4c8d1; border-radius: 50%; display: grid; place-items: center; color: #fff; font-size: 11px; flex: 0 0 auto; }
.gcd-check.checked { background: var(--gcd-primary); border-color: var(--gcd-primary); }
.gcd-avatar { width: 39px; height: 39px; border-radius: 50%; background: linear-gradient(135deg,#ded8ff,#9a85f8); display: grid; place-items: center; color: #fff; font-size: 11px; font-weight: 700; overflow: hidden; flex: 0 0 auto; }
.gcd-person { min-width: 0; display: flex; flex-direction: column; }
.gcd-person strong { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gcd-person small { font-size: 10.5px; color: var(--gcd-muted); margin-top: 2px; }
.gcd-state { padding: 52px 16px; text-align: center; color: var(--gcd-muted); font-size: 13px; }
.gcd-foot { min-height: 68px; border-top: 1px solid var(--gcd-line); display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 0 18px; background: var(--gcd-surface); }
.gcd-foot > span { margin-right: auto; font-size: 12px; color: var(--gcd-muted); }
.gcd-foot button { min-width: 84px; border: 0; border-radius: var(--smax-radius-sm, 10px); padding: 10px 18px; font: 700 13px/1 inherit; cursor: pointer; transition: background .15s, transform .1s; }
.gcd-foot button:active:not(:disabled) { transform: translateY(1px); }
.gcd-foot .secondary { background: #fff; color: var(--gcd-muted); border: 1px solid var(--gcd-line); }
.gcd-foot .secondary:hover { background: #f0f1f5; color: var(--gcd-text); }
.gcd-foot .primary { background: var(--gcd-primary); color: #fff; box-shadow: 0 4px 12px rgba(108,76,241,.22); }
.gcd-foot .primary:hover:not(:disabled) { background: var(--gcd-primary-hover); }
.gcd-foot .primary:disabled { background: #d8d3ee; color: #fff; box-shadow: none; cursor: not-allowed; }
</style>
