<template>
  <v-dialog v-model="open" max-width="520" scrollable>
    <v-card class="bulk-create-dialog">
      <header class="dialog-header">
        <div class="header-icon">
          <v-icon size="22" color="#ffffff">mdi-layers-triple</v-icon>
        </div>
        <div class="header-info">
          <h2>Tạo đơn hàng loạt</h2>
          <p>Mỗi dòng một mã đơn</p>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" class="close-btn" @click="open = false" />
      </header>

      <v-card-text class="dialog-body">
        <div class="input-section">
          <label class="input-label">Nhập mã đơn</label>
          <v-textarea
            v-model="text"
            rows="6"
            no-resize
            placeholder="anh quỳnh D090212&#10;trang hảo D250402&#10;thanh hải D220422"
            class="bulk-textarea"
            hide-details
          />
        </div>

        <div v-if="dupLines.length > 0" class="dup-alert">
          <v-icon size="16" color="#D97706">mdi-alert-circle-outline</v-icon>
          <span>Có {{ dupLines.length }} mã đơn đã tồn tại (sẽ tự động bỏ qua)</span>
        </div>
      </v-card-text>

      <footer class="dialog-footer">
        <v-btn variant="outlined" class="cancel-btn" @click="open = false">Hủy</v-btn>
        <v-btn
          color="#1A6FD4"
          class="submit-btn"
          :disabled="validLines.length === 0"
          :loading="saving"
          @click="handleSave"
        >
          <v-icon prepend size="18" class="mr-1">mdi-content-save-outline</v-icon>
          Tạo {{ validLines.length }} đơn
        </v-btn>
      </footer>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api } from '@/api';
import { useToast } from '@/composables/use-toast';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'saved'): void;
}>();

const toast = useToast();
const text = ref('');
const saving = ref(false);
const existingCodes = ref<Set<string>>(new Set());

const open = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
});

watch(open, async (val) => {
  if (val) {
    text.value = '';
    try {
      const { data } = await api.get('/delivery/orders?limit=1000');
      const set = new Set<string>();
      if (data.orders) {
        data.orders.forEach((o: any) => {
          if (o.orderCode) set.add(o.orderCode.trim().toLowerCase());
        });
      }
      existingCodes.value = set;
    } catch {}
  }
});

const lines = computed(() =>
  text.value
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
);

const parsed = computed(() =>
  lines.value.map((code) => ({
    code,
    duplicate: existingCodes.value.has(code.toLowerCase()),
  }))
);

const validLines = computed(() => parsed.value.filter((p) => !p.duplicate));
const dupLines = computed(() => parsed.value.filter((p) => p.duplicate));

async function handleSave() {
  if (validLines.value.length === 0 || saving.value) return;
  saving.value = true;
  try {
    const codes = validLines.value.map((x) => x.code);
    await api.post('/delivery/orders/bulk', { orderCodes: codes });
    toast.success(`Đã tạo hàng loạt ${codes.length} đơn hàng`);
    open.value = false;
    emit('saved');
  } catch (error: any) {
    toast.error(error.response?.data?.error || 'Không thể tạo đơn hàng loạt');
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.bulk-create-dialog {
  border-radius: 16px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.18);
}
.dialog-header {
  padding: 18px 22px;
  background: #1A6FD4;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 12px;
}
.header-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: grid;
  place-items: center;
}
.header-info h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}
.header-info p {
  margin: 2px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
}
.close-btn {
  margin-left: auto;
  color: #fff !important;
  background: rgba(255, 255, 255, 0.15);
}
.dialog-body {
  padding: 20px 22px !important;
}
.input-label {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: #374151;
  margin-bottom: 8px;
}
.bulk-textarea :deep(.v-field) {
  border-radius: 12px;
  border: 1px solid #E5E7EB;
}
.bulk-textarea :deep(textarea) {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.6;
  color: #1F2937;
}
.dup-alert {
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  background: #FEF3C7;
  color: #92400E;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}
.dialog-footer {
  padding: 14px 22px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid #F3F4F6;
  background: #FAFAFA;
}
.cancel-btn {
  border-color: #D1D5DB;
  color: #374151;
  font-weight: 700;
}
.submit-btn {
  font-weight: 700;
}
</style>
