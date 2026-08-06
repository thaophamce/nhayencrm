<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  QuickReplySettingsPage — Cài đặt "Hỗ trợ trả lời" (Mẫu trả lời nhanh).
  Đã loại bỏ tính năng Chủ đề theo yêu cầu của User.
  Bảng quản lý tin nhắn nhanh (Ký tự tắt, Nội dung văn bản, Ảnh đính kèm).
  Hỗ trợ dialog thêm/sửa trực quan theo phong cách Pancake:
    - Quản lý theo Khối nội dung
    - Tích hợp ChatMediaPickerModal chọn ảnh trực tiếp từ thư viện webapp.
-->
<template>
  <div class="qrs-page pa-4">
    <header class="qrs-head mb-4">
      <div class="qrs-ico">⚡</div>
      <div>
        <h1 class="text-h5 font-weight-bold">Hỗ trợ trả lời</h1>
        <p class="text-body-2 text-grey">
          Quản lý các mẫu câu trả lời nhanh dùng chung trong hệ thống chat. Sale có thể gõ phím "/" hoặc click biểu tượng ⚡ ở khung chat để chọn và gửi nhanh.
        </p>
      </div>
    </header>

    <v-card variant="outlined" class="ny-card pa-4 mb-4">
      <div class="d-flex align-center gap-3 mb-3 flex-wrap">
        <h2 class="text-subtitle-1 font-weight-bold mb-0">Trả lời nhanh</h2>
        <v-text-field
          v-model="filter.search"
          placeholder="Tìm ký tự tắt / nội dung..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width: 320px"
          class="ny-input"
          @keyup.enter="loadData"
        />
        <v-spacer />
        <v-btn variant="outlined" prepend-icon="mdi-download" @click="exportCSV">Xuất CSV</v-btn>
        <v-btn variant="outlined" prepend-icon="mdi-upload" @click="triggerCSVUpload">Nhập CSV</v-btn>
        <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreateDialog">Thêm mẫu</v-btn>
        <input type="file" ref="csvFileRef" accept=".csv" class="d-none" @change="onCSVImport" />
      </div>

      <v-data-table
        :headers="headers"
        :items="templates"
        :loading="loading"
        density="comfortable"
        class="ny-table"
      >
        <template #item.stt="{ index }">
          <span class="font-weight-bold text-grey-darken-1">{{ index + 1 }}</span>
        </template>
        <template #item.shortcut="{ item }">
          <code class="text-primary font-weight-bold">/{{ item.shortcut }}</code>
        </template>
        <template #item.photos="{ item }">
          <div class="d-flex align-center">
            <template v-if="getPhotoUrls(item).length">
              <v-avatar size="36" class="rounded border">
                <v-img :src="getPhotoUrls(item)[0]" cover />
              </v-avatar>
              <span v-if="getPhotoUrls(item).length > 1" class="photo-more-badge ml-1">
                +{{ getPhotoUrls(item).length - 1 }}
              </span>
            </template>
            <span v-else class="text-grey">—</span>
          </div>
        </template>
        <template #item.content="{ item }">
          <span class="text-truncate d-block" style="max-width: 500px" :title="item.content">
            {{ item.content }}
          </span>
        </template>
        <template #item.actions="{ item }">
          <div class="d-flex justify-end gap-1">
            <v-btn icon size="x-small" variant="text" @click="openEditDialog(item)">
              <v-icon size="18">mdi-pencil-outline</v-icon>
            </v-btn>
            <v-btn icon size="x-small" variant="text" color="error" @click="confirmDelete(item)">
              <v-icon size="18">mdi-delete-outline</v-icon>
            </v-btn>
          </div>
        </template>
      </v-data-table>
    </v-card>

    <div class="d-flex flex-wrap gap-4">
      <!-- Cài đặt tính năng và công cụ -->
      <v-card variant="outlined" class="ny-card pa-4 flex-grow-1" style="min-width: 320px;">
        <h3 class="text-subtitle-1 font-weight-bold mb-4">Chức năng &amp; công cụ</h3>
        <div class="d-flex flex-column gap-4">
          <div class="d-flex align-center justify-space-between gap-4">
            <div>
              <div class="font-weight-medium text-body-2">Gợi ý mẫu trả lời nhanh</div>
              <div class="text-caption text-grey">Khi nhập / + &lt;Ký tự tắt&gt;, hệ thống sẽ tự động hiển thị gợi ý.</div>
            </div>
            <v-switch v-model="settings.autoSuggest" color="primary" hide-details density="compact" @update:model-value="saveSettings" />
          </div>
          <v-divider />
          <div class="d-flex align-center justify-space-between gap-4">
            <div>
              <div class="font-weight-medium text-body-2">Gửi ngay mẫu trả lời nhanh</div>
              <div class="text-caption text-grey">Gửi ngay tin nhắn mẫu khi sale click chọn từ danh mục gợi ý.</div>
            </div>
            <v-switch v-model="settings.sendImmediately" color="primary" hide-details density="compact" @update:model-value="saveSettings" />
          </div>
          <v-divider />
          <div class="d-flex align-center justify-space-between gap-4">
            <div>
              <div class="font-weight-medium text-body-2">Cài đặt thông tin nhân viên</div>
              <div class="text-caption text-grey">Cấu hình thông tin chi tiết nhân viên trả lời để chèn vào biến <code>{STAFF_DETAILS}</code>.</div>
            </div>
            <v-btn variant="text" size="small" color="primary" @click="showStaffDialog = true">Cài đặt</v-btn>
          </div>
        </div>
      </v-card>
    </div>

    <!-- Dialog thêm/sửa mẫu trả lời nhanh (Thiết kế y hệt Pancake) -->
    <v-dialog v-model="dialog.show" max-width="650" scrollable>
      <v-card class="pa-2 dialog-quickreply">
        <v-card-title class="d-flex align-center justify-space-between py-2 border-b">
          <span class="font-weight-bold text-h6">
            {{ dialog.mode === 'create' ? 'Thêm câu trả lời nhanh' : 'Sửa câu trả lời nhanh' }}
          </span>
          <v-btn icon="mdi-close" variant="text" density="comfortable" @click="dialog.show = false" />
        </v-card-title>

        <v-card-text class="py-4 px-3" style="max-height: 70vh;">
          <div class="d-flex gap-3 mb-4">
            <v-text-field
              v-model="dialog.form.shortcut"
              label="Ký tự tắt"
              prefix="/"
              placeholder="gia"
              variant="outlined"
              density="comfortable"
              hide-details
              class="flex-grow-1"
            />
          </div>

          <!-- Trình soạn thảo khối nội dung đa phương tiện -->
          <div class="qrs-content-blocks d-flex flex-column gap-4 pa-3 rounded-lg" style="background-color: #f8fafc; border: 1px solid #e2e8f0;">
            <div class="d-flex align-center justify-space-between">
              <span class="text-subtitle-2 font-weight-bold d-flex align-center">
                <v-icon size="16" class="mr-1">mdi-chevron-down</v-icon> Nội dung
              </span>
            </div>

            <div class="content-block-item bg-white pa-3 rounded border">
              <v-textarea
                v-model="dialog.form.content"
                placeholder="Nhập nội dung mẫu tin nhắn..."
                rows="4"
                variant="plain"
                hide-details
                auto-grow
                class="content-block-textarea text-body-2"
              />

              <!-- Toolbar soạn thảo của Block -->
              <div class="d-flex align-center gap-2 mt-2 pt-2 border-t text-grey">
                <v-btn icon size="x-small" variant="text" title="Thêm hình ảnh" @click="openMediaPicker">
                  <v-icon size="18">mdi-image-outline</v-icon>
                </v-btn>
                <v-btn icon size="x-small" variant="text" title="Thêm tài liệu">
                  <v-icon size="18">mdi-paperclip</v-icon>
                </v-btn>
                <v-btn icon size="x-small" variant="text" title="Biểu tượng cảm xúc">
                  <v-icon size="18">mdi-emoticon-happy-outline</v-icon>
                </v-btn>
                <v-btn icon size="x-small" variant="text" title="Chèn biến động">
                  <v-icon size="18">mdi-curly-braces</v-icon>
                </v-btn>
              </div>

              <!-- List ảnh preview của mẫu câu -->
              <div v-if="dialog.form.photos.length > 0" class="d-flex flex-wrap gap-2 mt-3">
                <div v-for="(photoUrl, index) in dialog.form.photos" :key="photoUrl" class="photo-preview-box position-relative border rounded">
                  <v-img :src="photoUrl" width="80" height="80" cover class="rounded" />
                  <v-btn
                    icon="mdi-close"
                    size="x-small"
                    color="error"
                    variant="flat"
                    class="photo-remove-btn"
                    @click="removePhoto(index)"
                  />
                </div>
              </div>
            </div>
          </div>
        </v-card-text>

        <v-card-actions class="px-4 pb-4 border-t pt-3">
          <v-spacer />
          <v-btn variant="outlined" @click="dialog.show = false">Hủy</v-btn>
          <v-btn color="primary" variant="flat" :loading="saving" @click="saveTemplate">Lưu lại</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog cài đặt thông tin nhân viên -->
    <v-dialog v-model="showStaffDialog" max-width="450">
      <v-card class="pa-2">
        <v-card-title class="font-weight-bold">Thông tin nhân viên</v-card-title>
        <v-card-text>
          <div class="text-caption text-grey mb-3">
            Thông tin chi tiết này sẽ tự động thay thế biến <code>{STAFF_DETAILS}</code> trong mẫu tin nhắn của nhân viên khi chat.
          </div>
          <v-form class="d-flex flex-column gap-3">
            <v-text-field v-model="staffDetails.fullName" label="Họ và tên" variant="outlined" density="comfortable" />
            <v-text-field v-model="staffDetails.phone" label="Số điện thoại" variant="outlined" density="comfortable" />
            <v-text-field v-model="staffDetails.position" label="Chức vụ" variant="outlined" density="comfortable" />
          </v-form>
        </v-card-text>
        <v-card-actions class="px-6 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="showStaffDialog = false">Hủy</v-btn>
          <v-btn color="primary" variant="flat" @click="saveStaffDetails">Lưu thông tin</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Thư viện chọn ảnh từ kho ZaloCRM -->
    <ChatMediaPickerModal
      :visible="showMediaPicker"
      @close="showMediaPicker = false"
      @pick="onMediaPicked"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useMessageTemplates, type MessageTemplate } from '@/composables/use-message-templates';
import { useToast } from '@/composables/use-toast';
import ChatMediaPickerModal from '@/components/chat/ChatMediaPickerModal.vue';
import type { MediaAssetItem } from '@/api/media';

const {
  templates, fetchTemplates,
  createTemplate, updateTemplate, deleteTemplate
} = useMessageTemplates();

const toast = useToast();

const filter = reactive({
  search: '',
});

const loading = ref(false);
const saving = ref(false);
const showStaffDialog = ref(false);
const showMediaPicker = ref(false);

const headers = [
  { title: 'STT', key: 'stt', sortable: false, width: '60px', align: 'center' as const },
  { title: 'Ký tự tắt', key: 'shortcut', sortable: true, width: '150px' },
  { title: 'Ảnh đính kèm', key: 'photos', sortable: false, width: '120px' },
  { title: 'Nội dung tin nhắn', key: 'content', sortable: false },
  { title: '', key: 'actions', sortable: false, align: 'end' as const, width: '100px' },
];

// Local settings mock
const settings = reactive({
  autoSuggest: true,
  sendImmediately: false,
  enableSubjects: false,
});

const staffDetails = reactive({
  fullName: 'Nguyễn Tiến Lộc',
  phone: '0901234567',
  position: 'Sale CRM',
});

// Dialog templates state
const dialog = reactive({
  show: false,
  mode: 'create' as 'create' | 'edit',
  form: {
    id: '',
    shortcut: '',
    content: '',
    photos: [] as string[], // url lists
  },
});

const csvFileRef = ref<HTMLInputElement | null>(null);

function getPhotoUrls(item: any): string[] {
  if (item.tagIds && Array.isArray(item.tagIds)) {
    return item.tagIds;
  }
  if (item.contentRich?.attachments && Array.isArray(item.contentRich.attachments)) {
    return item.contentRich.attachments;
  }
  return [];
}

async function loadData() {
  loading.value = true;
  try {
    await fetchTemplates({
      search: filter.search || undefined,
    });
  } catch (err) {
    console.error('fetchTemplates err:', err);
  } finally {
    loading.value = false;
  }
}

function loadSettings() {
  const saved = localStorage.getItem('quick_reply_settings');
  if (saved) {
    Object.assign(settings, JSON.parse(saved));
  }
  const savedStaff = localStorage.getItem('quick_reply_staff');
  if (savedStaff) {
    Object.assign(staffDetails, JSON.parse(savedStaff));
  }
}

function saveSettings() {
  localStorage.setItem('quick_reply_settings', JSON.stringify(settings));
  toast.success('Đã lưu cấu hình công cụ');
}

function saveStaffDetails() {
  localStorage.setItem('quick_reply_staff', JSON.stringify(staffDetails));
  showStaffDialog.value = false;
  toast.success('Đã lưu thông tin nhân viên');
}

function openCreateDialog() {
  dialog.mode = 'create';
  dialog.form.id = '';
  dialog.form.shortcut = '';
  dialog.form.content = '';
  dialog.form.photos = [];
  dialog.show = true;
}

function openEditDialog(item: MessageTemplate) {
  dialog.mode = 'edit';
  dialog.form.id = item.id;
  dialog.form.shortcut = item.shortcut || '';
  dialog.form.content = item.content;
  dialog.form.photos = getPhotoUrls(item);
  dialog.show = true;
}

function openMediaPicker() {
  showMediaPicker.value = true;
}

function onMediaPicked(assets: MediaAssetItem[]) {
  assets.forEach(asset => {
    const url = asset.url || asset.thumbnailUrl;
    if (url && !dialog.form.photos.includes(url)) {
      dialog.form.photos.push(url);
    }
  });
  showMediaPicker.value = false;
}

function removePhoto(index: number) {
  dialog.form.photos.splice(index, 1);
}

async function saveTemplate() {
  if (!dialog.form.shortcut.trim() || !dialog.form.content.trim()) {
    toast.warning('Vui lòng điền đủ thông tin');
    return;
  }
  saving.value = true;
  try {
    // Lưu tạm hình ảnh đính kèm vào trường tagIds/contentRich
    const payload: Partial<MessageTemplate> = {
      shortcut: dialog.form.shortcut.trim(),
      content: dialog.form.content.trim(),
      tagIds: dialog.form.photos,
      contentRich: {
        text: dialog.form.content.trim(),
        styles: [],
        attachments: dialog.form.photos
      } as any
    };
    if (dialog.mode === 'create') {
      await createTemplate(payload);
      toast.success('Đã thêm mẫu trả lời nhanh');
    } else {
      await updateTemplate(dialog.form.id, payload);
      toast.success('Đã cập nhật mẫu trả lời nhanh');
    }
    dialog.show = false;
    await loadData();
  } catch (err) {
    toast.error('Lưu thất bại');
  } finally {
    saving.value = false;
  }
}

async function confirmDelete(item: MessageTemplate) {
  if (confirm(`Bạn có chắc chắn muốn xóa mẫu "/${item.shortcut}"?`)) {
    try {
      await deleteTemplate(item.id);
      toast.success('Đã xóa mẫu');
      await loadData();
    } catch {
      toast.error('Xóa thất bại');
    }
  }
}

function exportCSV() {
  let csvContent = 'data:text/csv;charset=utf-8,STT,Ky tu tat,Tin nhan\n';
  templates.value.forEach((tpl, i) => {
    const contentEscaped = tpl.content.replace(/"/g, '""');
    csvContent += `${i + 1},${tpl.shortcut || ''},"${contentEscaped}"\n`;
  });
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', 'mau_tra_loi_nhanh.csv');
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function triggerCSVUpload() {
  csvFileRef.value?.click();
}

async function onCSVImport(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (evt) => {
    const text = evt.target?.result as string;
    const lines = text.split('\n').slice(1); // bỏ header
    let imported = 0;
    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length >= 3) {
        const shortcut = parts[1]?.trim();
        const content = parts.slice(2).join(',').replace(/^"|"$/g, '').trim();
        if (shortcut && content) {
          await createTemplate({ shortcut, content });
          imported++;
        }
      }
    }
    toast.success(`Đã nhập thành công ${imported} mẫu câu từ file CSV`);
    await loadData();
  };
  reader.readAsText(file);
}

onMounted(() => {
  loadSettings();
  loadData();
});
</script>

<style scoped>
.qrs-page {
  background-color: #f8fafc;
  min-height: 100%;
}
.qrs-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.qrs-ico {
  font-size: 32px;
  background: #eff6ff;
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ny-card {
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
}
.content-block-textarea :deep(textarea) {
  outline: none;
  font-size: 14px;
  line-height: 1.5;
  color: #1e293b;
}
.photo-preview-box {
  width: 80px;
  height: 80px;
}
.photo-more-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 22px;
  padding: 0 6px;
  font-size: 12px;
  font-weight: 700;
  color: #475569;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
}
.photo-remove-btn {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px !important;
  height: 18px !important;
  min-width: 18px !important;
  padding: 0 !important;
  border-radius: 50%;
  font-size: 10px;
}
</style>
