<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <Teleport to="body">
    <Transition name="video-picker-fade">
      <div v-if="visible" class="video-picker-overlay" @mousedown.self="emit('close')">
        <section
          ref="dialogRef"
          class="video-picker"
          role="dialog"
          aria-modal="true"
          aria-labelledby="video-picker-title"
          tabindex="-1"
          @keydown.esc="emit('close')"
        >
          <header class="video-picker__header">
            <div>
              <h2 id="video-picker-title">Thư viện video</h2>
              <p>Dùng chung toàn hệ thống · tối đa 20 MB/video</p>
            </div>
            <button type="button" class="icon-button" aria-label="Đóng thư viện video" @click="emit('close')">
              <XIcon :size="19" />
            </button>
          </header>

          <div class="video-picker__toolbar">
            <label class="search-box">
              <SearchIcon :size="17" aria-hidden="true" />
              <span class="sr-only">Tìm kiếm video</span>
              <input v-model="search" type="search" placeholder="Tìm kiếm theo tên video" @input="queueReload" />
            </label>
            <label class="upload-button" :class="{ disabled: uploading }">
              <UploadIcon :size="17" aria-hidden="true" />
              {{ uploading ? uploadLabel : 'Thêm video' }}
              <input type="file" accept="video/mp4,video/quicktime,video/webm" multiple :disabled="uploading" @change="uploadVideos" />
            </label>
          </div>

          <div class="video-picker__body" aria-live="polite">
            <div v-if="loading" class="state-message"><span class="spinner" />Đang tải thư viện video…</div>
            <div v-else-if="loadError" class="state-message state-message--error">
              <AlertCircleIcon :size="22" />
              <span>{{ loadError }}</span>
              <button type="button" @click="loadVideos">Thử lại</button>
            </div>
            <div v-else-if="videos.length === 0" class="state-message">
              <VideoIcon :size="34" />
              <strong>Chưa có video nào</strong>
              <span>Tải video MP4, MOV hoặc WEBM lên để sử dụng chung.</span>
            </div>
            <ul v-else class="video-list" role="listbox" aria-label="Danh sách video" aria-multiselectable="true">
              <li v-for="video in videos" :key="video.id">
                <button
                  type="button"
                  class="video-row"
                  :class="{ selected: selected.has(video.id) }"
                  role="option"
                  :aria-selected="selected.has(video.id)"
                  @click="toggle(video)"
                >
                  <span class="video-thumb">
                    <img v-if="video.thumbnailUrl" :src="video.thumbnailUrl" alt="" loading="lazy" />
                    <video
                      v-else-if="video.url"
                      :src="video.url"
                      muted
                      playsinline
                      preload="metadata"
                      aria-hidden="true"
                      @loadedmetadata="primeVideoThumbnail"
                    />
                    <VideoIcon v-else :size="25" aria-hidden="true" />
                    <span class="play-mark"><PlayIcon :size="14" fill="currentColor" /></span>
                  </span>
                  <span class="video-info">
                    <span v-if="editingId === video.id" class="rename-box" @click.stop>
                      <input
                        ref="renameInputRef"
                        v-model="editingName"
                        maxlength="160"
                        aria-label="Tên video mới"
                        @keydown.enter.prevent="saveName(video)"
                        @keydown.esc.prevent="cancelRename"
                      />
                      <button type="button" title="Lưu tên" aria-label="Lưu tên video" :disabled="renaming" @click="saveName(video)">
                        <CheckIcon :size="16" />
                      </button>
                      <button type="button" title="Hủy" aria-label="Hủy sửa tên" :disabled="renaming" @click="cancelRename">
                        <XIcon :size="16" />
                      </button>
                    </span>
                    <strong v-else :title="video.name">{{ video.name }}</strong>
                    <span>Tệp video<span v-if="video.sizeBytes"> · {{ formatBytes(video.sizeBytes) }}</span><span v-if="video.durationSec"> · {{ formatDuration(video.durationSec) }}</span></span>
                  </span>
                  <span v-if="selected.has(video.id)" class="selection-order">{{ selectionOrder(video.id) }}</span>
                </button>
                <button type="button" class="edit-button" :aria-label="`Sửa tên ${video.name}`" @click="startRename(video)">
                  <PencilIcon :size="16" />
                </button>
                <button type="button" class="delete-button" :aria-label="`Xóa ${video.name}`" @click="removeVideo(video)">
                  <TrashIcon :size="17" />
                </button>
              </li>
            </ul>
          </div>

          <footer class="video-picker__footer">
            <span>{{ selected.size ? `Đã chọn ${selected.size} video` : 'Chọn một hoặc nhiều video để xem trước' }}</span>
            <div>
              <button type="button" class="button button--secondary" @click="emit('close')">Hủy</button>
              <button type="button" class="button button--primary" :disabled="selected.size === 0" @click="confirmSelection">
                Đưa vào xem trước
              </button>
            </div>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { AlertCircle as AlertCircleIcon, Check as CheckIcon, Pencil as PencilIcon, Play as PlayIcon, Search as SearchIcon, Trash2 as TrashIcon, Upload as UploadIcon, Video as VideoIcon, X as XIcon } from 'lucide-vue-next';
import { archiveMedia, listMediaPaged, updateMedia, uploadMedia, type MediaAssetItem } from '@/api/media';
import { useToast } from '@/composables/use-toast';

const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ close: []; pick: [assets: MediaAssetItem[]] }>();
const toast = useToast();
const dialogRef = ref<HTMLElement | null>(null);
const videos = ref<MediaAssetItem[]>([]);
const selected = ref(new Map<string, MediaAssetItem>());
const loading = ref(false);
const uploading = ref(false);
const uploadLabel = ref('Đang tải…');
const loadError = ref('');
const search = ref('');
const editingId = ref<string | null>(null);
const editingName = ref('');
const renaming = ref(false);
const renameInputRef = ref<HTMLInputElement | null>(null);
let reloadTimer: ReturnType<typeof setTimeout> | undefined;

function formatBytes(bytes: number) { return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`; }
function formatDuration(seconds: number) { const value = Math.round(seconds); return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`; }
function selectionOrder(id: string) { return Array.from(selected.value.keys()).indexOf(id) + 1; }
function primeVideoThumbnail(event: Event) {
  const element = event.currentTarget as HTMLVideoElement;
  if (Number.isFinite(element.duration) && element.duration > 0) element.currentTime = Math.min(0.2, element.duration / 2);
}

async function loadVideos() {
  loading.value = true;
  loadError.value = '';
  try {
    const result = await listMediaPaged({ kind: 'video', visibility: 'public', q: search.value.trim() || undefined, limit: 200, sort: 'newest' });
    videos.value = result.items;
  } catch (error: any) {
    loadError.value = error?.response?.data?.error || 'Không tải được thư viện video.';
  } finally {
    loading.value = false;
  }
}

function queueReload() {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(loadVideos, 250);
}

function toggle(video: MediaAssetItem) {
  const next = new Map(selected.value);
  next.has(video.id) ? next.delete(video.id) : next.set(video.id, video);
  selected.value = next;
}

function confirmSelection() {
  emit('pick', Array.from(selected.value.values()));
  emit('close');
}

async function startRename(video: MediaAssetItem) {
  editingId.value = video.id;
  editingName.value = video.name;
  await nextTick();
  renameInputRef.value?.focus();
  renameInputRef.value?.select();
}

function cancelRename() {
  editingId.value = null;
  editingName.value = '';
}

async function saveName(video: MediaAssetItem) {
  const name = editingName.value.trim();
  if (!name) return toast.warning('Tên video không được để trống');
  if (name === video.name) return cancelRename();
  renaming.value = true;
  try {
    const result = await updateMedia(video.id, { name });
    video.name = result.asset.name;
    const selectedVideo = selected.value.get(video.id);
    if (selectedVideo) selectedVideo.name = result.asset.name;
    cancelRename();
    toast.success('Đã đổi tên video');
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Không đổi được tên video');
  } finally {
    renaming.value = false;
  }
}

async function uploadVideos(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = '';
  if (!files.length) return;
  const invalidType = files.find(file => !['video/mp4', 'video/quicktime', 'video/webm'].includes(file.type));
  const oversized = files.find(file => file.size > MAX_VIDEO_BYTES);
  if (invalidType) return toast.error(`${invalidType.name}: chỉ hỗ trợ MP4, MOV hoặc WEBM`);
  if (oversized) return toast.error(`${oversized.name}: video vượt quá 20 MB`);
  uploading.value = true;
  uploadLabel.value = `Đang tải 0/${files.length}`;
  try {
    const result = await uploadMedia(files, {
      visibility: 'public',
      onProgress: progress => { uploadLabel.value = `Đang tải ${progress.completed}/${progress.total}`; },
    });
    toast.success(`Đã tải lên ${result.assets.length} video`);
    if (result.failed.length) toast.warning(`${result.failed.length} video tải lên thất bại`);
    await loadVideos();
    const uploadedIds = new Set(result.assets.map(asset => asset.id));
    const next = new Map(selected.value);
    for (const video of videos.value) if (uploadedIds.has(video.id)) next.set(video.id, video);
    selected.value = next;
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Tải video lên thất bại');
  } finally {
    uploading.value = false;
  }
}

async function removeVideo(video: MediaAssetItem) {
  if (!window.confirm(`Xóa “${video.name}” khỏi thư viện? Video có thể khôi phục trong Thùng rác.`)) return;
  try {
    await archiveMedia(video.id);
    videos.value = videos.value.filter(item => item.id !== video.id);
    const next = new Map(selected.value); next.delete(video.id); selected.value = next;
    toast.success('Đã chuyển video vào Thùng rác');
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Không xóa được video');
  }
}

watch(() => props.visible, async visible => {
  if (!visible) return;
  search.value = '';
  selected.value = new Map();
  cancelRename();
  await loadVideos();
  await nextTick();
  dialogRef.value?.focus();
});
</script>

<style scoped>
.video-picker-overlay { position: fixed; inset: 0; z-index: 2400; display: grid; place-items: center; padding: 16px; background: rgba(15, 23, 42, .42); }
.video-picker { width: min(560px, 100%); height: min(680px, calc(100vh - 32px)); display: flex; flex-direction: column; overflow: hidden; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 20px 50px rgba(15, 23, 42, .2); color: #0f172a; outline: none; }
.video-picker__header, .video-picker__toolbar, .video-picker__footer { flex-shrink: 0; padding: 14px 16px; border-bottom: 1px solid #e2e8f0; }
.video-picker__header { display: flex; align-items: flex-start; justify-content: space-between; }
.video-picker__header h2 { margin: 0; font-size: 17px; line-height: 1.35; }
.video-picker__header p { margin: 3px 0 0; color: #64748b; font-size: 12px; }
.icon-button, .edit-button, .delete-button { display: grid; place-items: center; border: 0; background: transparent; color: #64748b; cursor: pointer; }
.icon-button { width: 32px; height: 32px; border-radius: 6px; }
.icon-button:hover, .edit-button:hover, .delete-button:hover { background: #f1f5f9; color: #0f172a; }
.video-picker__toolbar { display: flex; gap: 10px; background: #f8fafc; }
.search-box { min-width: 0; flex: 1; height: 38px; display: flex; align-items: center; gap: 8px; padding: 0 11px; background: #fff; border: 1px solid #cbd5e1; border-radius: 7px; color: #64748b; }
.search-box:focus-within { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, .12); }
.search-box input { min-width: 0; flex: 1; border: 0; outline: 0; font: inherit; font-size: 13px; color: #0f172a; }
.upload-button { height: 38px; display: inline-flex; align-items: center; gap: 7px; padding: 0 13px; border-radius: 7px; background: #2563eb; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.upload-button:hover { background: #1d4ed8; }.upload-button.disabled { opacity: .65; cursor: wait; }.upload-button input { display: none; }
.video-picker__body { min-height: 0; flex: 1; overflow-y: auto; padding: 8px; }
.state-message { min-height: 260px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; color: #64748b; font-size: 13px; }
.state-message strong { color: #334155; }.state-message button { border: 0; background: none; color: #2563eb; font-weight: 600; cursor: pointer; }.state-message--error { color: #b91c1c; }
.spinner { width: 20px; height: 20px; border: 2px solid #cbd5e1; border-top-color: #2563eb; border-radius: 50%; animation: spin .7s linear infinite; }
.video-list { margin: 0; padding: 0; list-style: none; }.video-list li { position: relative; display: flex; align-items: center; border-bottom: 1px solid #f1f5f9; }
.video-row { min-width: 0; flex: 1; display: flex; align-items: center; gap: 12px; padding: 10px; border: 0; border-radius: 8px; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.video-row:hover { background: #f8fafc; }.video-row.selected { background: #eff6ff; box-shadow: inset 0 0 0 1px #93c5fd; }
.video-thumb { position: relative; width: 72px; height: 52px; flex-shrink: 0; display: grid; place-items: center; overflow: hidden; border-radius: 7px; background: #e2e8f0; color: #64748b; }
.video-thumb img, .video-thumb video { width: 100%; height: 100%; object-fit: cover; display: block; }.play-mark { position: absolute; inset: 0; display: grid; place-items: center; color: #fff; background: rgba(15, 23, 42, .16); pointer-events: none; }
.video-info { min-width: 0; display: flex; flex: 1; flex-direction: column; gap: 4px; }.video-info strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }.video-info span { color: #64748b; font-size: 12px; }
.rename-box { display: flex !important; align-items: center; gap: 3px !important; }.rename-box input { min-width: 0; height: 30px; flex: 1; padding: 0 8px; border: 1px solid #60a5fa; border-radius: 5px; outline: none; font: inherit; font-size: 13px; color: #0f172a; }.rename-box input:focus { box-shadow: 0 0 0 3px rgba(59, 130, 246, .12); }.rename-box button { width: 28px; height: 28px; display: grid; place-items: center; flex-shrink: 0; padding: 0; border: 0; border-radius: 5px; background: #eff6ff; color: #2563eb; cursor: pointer; }.rename-box button:last-child { background: #f1f5f9; color: #64748b; }
.selection-order { width: 22px; height: 22px; display: grid; place-items: center; border-radius: 50%; background: #2563eb; color: #fff; font-size: 11px; font-weight: 700; }.edit-button, .delete-button { width: 34px; height: 36px; border-radius: 6px; }.delete-button { margin-right: 4px; }.delete-button:hover { color: #dc2626; background: #fef2f2; }
.video-picker__footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-top: 1px solid #e2e8f0; border-bottom: 0; color: #64748b; font-size: 12px; }.video-picker__footer > div { display: flex; gap: 8px; }
.button { min-height: 36px; padding: 0 14px; border-radius: 7px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }.button--secondary { border: 1px solid #cbd5e1; background: #fff; color: #334155; }.button--primary { border: 1px solid #2563eb; background: #2563eb; color: #fff; }.button:disabled { opacity: .45; cursor: not-allowed; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.video-picker-fade-enter-active, .video-picker-fade-leave-active { transition: opacity .16s ease; }.video-picker-fade-enter-from, .video-picker-fade-leave-to { opacity: 0; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 560px) { .video-picker-overlay { padding: 0; }.video-picker { width: 100%; height: 100%; border-radius: 0; }.video-picker__toolbar { flex-direction: column; }.upload-button { justify-content: center; }.video-picker__footer { align-items: flex-start; flex-direction: column; }.video-picker__footer > div { width: 100%; }.button { flex: 1; } }
</style>
