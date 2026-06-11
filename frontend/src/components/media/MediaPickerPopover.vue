<template>
  <div class="mp-pop" @click.self="$emit('close')">
    <div class="mp-card">
      <div class="mp-row1">
        <div class="seg">
          <span :class="{ on: tab === 'recent' }" @click="setTab('recent')">Gần đây</span>
          <span :class="{ on: tab === 'fav' }" @click="setTab('fav')">⭐ Yêu thích</span>
          <span :class="{ on: tab === 'all' }" @click="setTab('all')">Tất cả kho</span>
        </div>
        <input v-model="search" class="mp-search" placeholder="🔍 Tìm trong kho…" @input="debouncedReload" />
        <button class="mp-x" @click="$emit('close')">✕</button>
      </div>
      <div v-if="loading" class="mp-empty">Đang tải…</div>
      <div v-else-if="items.length === 0" class="mp-empty">
        Kho trống. Tải ảnh ở trang <b>Kho ảnh</b> hoặc chuột phải tin nhắn → Lưu vào Media.
      </div>
      <div v-else class="mp-grid">
        <button v-for="a in items" :key="a.id" class="mp-cell" :disabled="sending === a.id" @click="send(a)">
          <img v-if="a.thumbnailUrl" :src="a.thumbnailUrl" loading="lazy" alt="" />
          <span v-else class="ph">{{ a.kind === 'video' ? '🎬' : a.kind === 'file' ? '📄' : '🖼' }}</span>
          <span class="mp-name">{{ a.name }}</span>
          <span v-if="sending === a.id" class="mp-sending">Đang gửi…</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { listMedia, listFavorites, sendMediaToConversation, type MediaAssetItem } from '@/api/media';
import { useToast } from '@/composables/use-toast';

const props = defineProps<{ conversationId: string }>();
const emit = defineEmits<{ close: []; sent: [] }>();
const toast = useToast();

const tab = ref<'recent' | 'fav' | 'all'>('recent');
const items = ref<MediaAssetItem[]>([]);
const loading = ref(false);
const search = ref('');
const sending = ref<string | null>(null);

let timer: ReturnType<typeof setTimeout> | null = null;
function debouncedReload() { if (timer) clearTimeout(timer); timer = setTimeout(reload, 300); }
function setTab(t: any) { tab.value = t; reload(); }

async function reload() {
  loading.value = true;
  try {
    // GĐ5: tab Yêu thích dùng data thật; Gần đây = sort lastUsed; Tất cả = toàn kho ảnh.
    if (tab.value === 'fav') {
      items.value = await listFavorites();
    } else {
      items.value = await listMedia({ kind: 'image', q: search.value || undefined, limit: 24 });
    }
  } catch (e: any) {
    toast.warning(e?.response?.data?.error || 'Không tải được kho');
  } finally {
    loading.value = false;
  }
}

async function send(a: MediaAssetItem) {
  if (sending.value) return;
  sending.value = a.id;
  try {
    await sendMediaToConversation(a.id, props.conversationId);
    toast.success(`Đã gửi "${a.name}"`);
    emit('sent');
    emit('close');
  } catch (e: any) {
    toast.warning(e?.response?.data?.error || 'Gửi thất bại');
  } finally {
    sending.value = null;
  }
}

onMounted(reload);
</script>

<style scoped>
.mp-pop { position:absolute; inset:0 0 auto 0; bottom:100%; z-index:40; }
.mp-card {
  --ink:#181d26; --muted:#41454d; --hairline:#dddddd; --canvas:#fff; --soft:#f8fafc;
  background:var(--soft); border:1px solid var(--hairline); border-radius:10px 10px 0 0;
  border-bottom:none; padding:12px 14px; max-height:320px; display:flex; flex-direction:column;
  box-shadow:0 -4px 16px rgba(0,0,0,.06);
}
.mp-row1 { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
.seg { display:inline-flex; border:1px solid var(--hairline); border-radius:9999px; overflow:hidden; font-size:12px; background:var(--canvas); }
.seg span { padding:4px 12px; cursor:pointer; color:var(--muted); }
.seg span.on { background:var(--ink); color:#fff; }
.mp-search { margin-left:auto; border:1px solid var(--hairline); border-radius:6px; padding:4px 10px; font-size:12px; width:150px; outline:none; }
.mp-x { border:none; background:none; cursor:pointer; color:var(--muted); }
.mp-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(78px,1fr)); gap:8px; overflow:auto; }
.mp-cell { border:1px solid var(--hairline); border-radius:6px; overflow:hidden; cursor:pointer; background:var(--canvas); padding:0; position:relative; }
.mp-cell:disabled { opacity:.6; }
.mp-cell img { width:100%; height:56px; object-fit:cover; display:block; }
.mp-cell .ph { display:flex; align-items:center; justify-content:center; height:56px; font-size:22px; background:linear-gradient(135deg,#cfd6dd,#aeb6bf); }
.mp-name { display:block; font-size:10px; padding:3px 4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--ink); }
.mp-sending { position:absolute; inset:0; background:rgba(255,255,255,.8); display:flex; align-items:center; justify-content:center; font-size:11px; color:var(--ink); }
.mp-empty { padding:24px 12px; text-align:center; font-size:12.5px; color:var(--muted); }
</style>
