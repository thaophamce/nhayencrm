<template>
  <aside class="m-panel">
    <header class="p-head">
      <b>Chi tiết</b>
      <button class="x" @click="$emit('close')">✕</button>
    </header>
    <div class="p-body">
      <div class="preview">
        <img v-if="asset.thumbnailUrl" :src="wmUrl || asset.thumbnailUrl" alt="" />
        <span v-else class="ph">{{ asset.kind === 'video' ? '🎬' : asset.kind === 'file' ? '📄' : '🖼' }}</span>
      </div>

      <div class="fld">
        <label>Tên</label>
        <input v-model="name" class="ipt" @blur="saveName" />
      </div>

      <div class="fld">
        <label>Quyền xem</label>
        <div class="seg" :class="{ disabled: lockedPrivate }">
          <span :class="{ on: visibility === 'public' }" @click="setVis('public')">Công khai</span>
          <span :class="{ on: visibility === 'private' }" @click="setVis('private')">Riêng tư</span>
        </div>
        <div v-if="lockedPrivate" class="warn">🔒 Ảnh lưu từ nick Riêng tư — không thể chuyển Công khai (bảo vệ thông tin khách).</div>
      </div>

      <div v-if="asset.kind === 'image'" class="fld">
        <label>Đóng dấu logo HS (Watermark)</label>
        <button class="btn-ghost" :disabled="wmLoading" @click="doWatermark">
          {{ wmLoading ? 'Đang tạo…' : (wmUrl ? '✓ Đã có bản watermark' : '＋ Tạo bản có logo') }}
        </button>
        <div class="hint">Bản gốc vẫn giữ. Bản watermark là phiên bản riêng để gửi.</div>
      </div>

      <div class="fld">
        <label>Tag dự án</label>
        <div class="tags">
          <span v-for="t in tagIds" :key="t" class="tg coral">{{ t }} <i @click="removeTag(t)">✕</i></span>
          <input v-model="newTag" class="tg-input" placeholder="+ tag" @keyup.enter="addTag" />
        </div>
      </div>

      <div class="fld stat">
        <label>Thống kê</label>
        <div>Đã dùng <b>{{ asset.usageCount }}</b> lần · {{ sizeText }}</div>
      </div>
    </div>
    <footer class="p-foot">
      <button class="btn-fav" :class="{ on: isFav }" @click="doFavorite">{{ isFav ? '★ Đã yêu thích' : '☆ Yêu thích' }}</button>
      <button class="btn-danger" @click="doArchive">🗑 Xóa khỏi kho</button>
    </footer>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { updateMedia, archiveMedia, watermarkMedia, toggleFavorite, type MediaAssetItem, type MediaFolder } from '@/api/media';
import { useToast } from '@/composables/use-toast';

const props = defineProps<{ asset: MediaAssetItem; folders: MediaFolder[] }>();
const emit = defineEmits<{ close: []; updated: [patch: Partial<MediaAssetItem>]; archived: [id: string] }>();
const toast = useToast();

const name = ref(props.asset.name);
const visibility = ref(props.asset.visibility);
const tagIds = ref<string[]>([...props.asset.tagIds]);
const newTag = ref('');
const wmUrl = ref<string | null>(null);
const wmLoading = ref(false);
const isFav = ref(false);

// Reset khi đổi asset chọn.
watch(() => props.asset.id, () => {
  name.value = props.asset.name;
  visibility.value = props.asset.visibility;
  tagIds.value = [...props.asset.tagIds];
  wmUrl.value = null;
  isFav.value = false;
});

async function doFavorite() {
  try {
    const r = await toggleFavorite(props.asset.id);
    isFav.value = r.favorited;
    toast.success(r.favorited ? 'Đã thêm vào Yêu thích' : 'Đã bỏ khỏi Yêu thích');
  } catch (e: any) {
    toast.warning(e?.response?.data?.error || 'Không lưu được');
  }
}

// Ảnh lưu từ nick Riêng tư không cho public (backend chặn, FE phản ánh) — suy từ private + không đổi được.
const lockedPrivate = computed(() => false); // backend là nguồn chân lý; nếu 403 sẽ báo lỗi.
const sizeText = computed(() => {
  const b = props.asset.sizeBytes ?? 0;
  return b > 1024 * 1024 ? (b / 1024 / 1024).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB';
});

async function patch(p: any, okMsg?: string) {
  try {
    await updateMedia(props.asset.id, p);
    emit('updated', p);
    if (okMsg) toast.success(okMsg);
  } catch (e: any) {
    if (e?.response?.data?.code === 'PRIVACY_LOCKED') {
      toast.warning('Ảnh lưu từ nick Riêng tư — không thể chuyển Công khai');
      visibility.value = 'private';
    } else {
      toast.warning(e?.response?.data?.error || 'Không lưu được');
    }
  }
}
function saveName() { if (name.value !== props.asset.name) patch({ name: name.value }); }
function setVis(v: 'public' | 'private') { if (v === visibility.value) return; visibility.value = v; patch({ visibility: v }); }
function addTag() {
  const t = newTag.value.trim();
  if (t && !tagIds.value.includes(t)) { tagIds.value.push(t); patch({ tagIds: tagIds.value }); }
  newTag.value = '';
}
function removeTag(t: string) { tagIds.value = tagIds.value.filter((x) => x !== t); patch({ tagIds: tagIds.value }); }

async function doWatermark() {
  wmLoading.value = true;
  try {
    const res = await watermarkMedia(props.asset.id, { position: 'bottom-right', opacity: 0.65 });
    wmUrl.value = res.url;
    toast.success('Đã tạo bản có logo HS');
  } catch (e: any) {
    toast.warning(e?.response?.data?.error || 'Không tạo được watermark');
  } finally {
    wmLoading.value = false;
  }
}

async function doArchive() {
  if (!window.confirm(`Xóa "${props.asset.name}" khỏi kho? (Lịch sử chat đã gửi không bị ảnh hưởng)`)) return;
  try {
    await archiveMedia(props.asset.id);
    emit('archived', props.asset.id);
  } catch (e: any) {
    toast.warning(e?.response?.data?.error || 'Không xóa được');
  }
}
</script>

<style scoped>
.m-panel {
  --ink:#181d26; --body:#333840; --muted:#41454d; --hairline:#dddddd;
  --canvas:#fff; --soft:#f8fafc; --strong:#e0e2e6; --coral:#aa2d00;
  --r-sm:6px; --r-md:10px; --pill:9999px;
  width:380px; border-left:1px solid var(--hairline); flex-shrink:0; background:var(--soft);
  display:flex; flex-direction:column; min-height:0;
}
.p-head { padding:14px 18px; border-bottom:1px solid var(--hairline); display:flex; align-items:center; justify-content:space-between; background:var(--canvas); color:var(--ink); }
.p-head .x { border:none; background:none; cursor:pointer; color:var(--muted); font-size:15px; }
.p-body { padding:18px; overflow:auto; flex:1; }
.preview { height:200px; background:var(--strong); border-radius:var(--r-md); display:flex; align-items:center; justify-content:center; margin-bottom:16px; overflow:hidden; }
.preview img { width:100%; height:100%; object-fit:contain; }
.preview .ph { font-size:48px; color:var(--muted); }
.fld { margin-bottom:16px; }
.fld label { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); margin-bottom:6px; font-weight:500; }
.ipt { width:100%; border:1px solid var(--hairline); border-radius:var(--r-sm); padding:7px 10px; font-size:14px; color:var(--ink); outline:none; }
.seg { display:inline-flex; border:1px solid var(--hairline); border-radius:var(--pill); overflow:hidden; font-size:12.5px; background:var(--canvas); }
.seg span { padding:6px 16px; cursor:pointer; color:var(--muted); }
.seg span.on { background:var(--ink); color:#fff; }
.seg.disabled { opacity:.5; pointer-events:none; }
.warn { background:#f5e9d4; border:1px solid #e6d3ad; color:#6b5520; border-radius:var(--r-sm); padding:8px 11px; font-size:12px; margin-top:8px; }
.btn-ghost { border:1px solid var(--hairline); background:var(--canvas); border-radius:var(--r-md); padding:8px 14px; font-size:13px; cursor:pointer; color:var(--body); }
.btn-ghost:disabled { opacity:.6; cursor:default; }
.hint { font-size:11.5px; color:var(--muted); margin-top:5px; }
.tags { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.tg { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--hairline); border-radius:var(--pill); padding:3px 10px; font-size:11.5px; color:var(--muted); }
.tg.coral { background:#fbe9e2; border-color:#f0c4b3; color:var(--coral); }
.tg i { cursor:pointer; font-style:normal; }
.tg-input { border:1px dashed var(--hairline); border-radius:var(--pill); padding:3px 10px; font-size:11.5px; width:70px; outline:none; }
.stat div { font-size:13.5px; color:var(--ink); }
.p-foot { padding:14px 18px; border-top:1px solid var(--hairline); background:var(--canvas); display:flex; gap:8px; }
.btn-fav { flex:1; border:1px solid var(--hairline); background:var(--canvas); color:var(--body); border-radius:var(--r-md); padding:9px; font-size:13px; font-weight:500; cursor:pointer; }
.btn-fav.on { background:#fef3c7; border-color:#f4d35e; color:#92710a; }
.btn-danger { flex:1; border:1px solid #f0c4b3; background:#fbe9e2; color:var(--coral); border-radius:var(--r-md); padding:9px; font-size:13px; font-weight:500; cursor:pointer; }
</style>
