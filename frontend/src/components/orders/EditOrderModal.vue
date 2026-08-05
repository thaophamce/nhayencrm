<template>
  <v-dialog
    v-model="visible"
    max-width="980"
    persistent
    scrollable
    :fullscreen="mobile"
    class="design-order-dialog"
  >
    <v-card class="design-order-modal">
      <header class="modal-header">
        <div class="header-mark" aria-hidden="true">
          <v-icon size="22">mdi-pencil-outline</v-icon>
        </div>
        <div class="header-copy">
          <h2>Chỉnh sửa đơn thiết kế</h2>
          <p>Cập nhật thông tin, phân công Designer và trạng thái đơn</p>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" aria-label="Đóng" class="close-button" @click="close" />
      </header>

      <v-card-text class="modal-body">
        <v-form ref="form" v-model="isValid" @submit.prevent="submit">
          <div class="form-layout">
            <section class="form-card">
              <div class="section-heading">
                <span class="section-icon"><v-icon size="19">mdi-clipboard-edit-outline</v-icon></span>
                <div><h3>Thông tin đơn thiết kế</h3><p>Mã đơn, số mẫu và thời hạn hoàn thành</p></div>
              </div>
              <div class="card-content">
                <template v-if="isAdminOrManager">
                  <div class="field-grid two-columns">
                    <v-text-field
                      v-model="formData.orderCode"
                      label="Mã đơn hàng *"
                      required
                      :rules="[v => !!v?.trim() || 'Mã đơn hàng là bắt buộc']"
                      variant="outlined" density="comfortable" color="#2F80ED"
                      prepend-inner-icon="mdi-barcode"
                    />
                    <v-text-field
                      v-model.number="formData.fileCount"
                      type="number" label="Số mẫu thiết kế" min="0"
                      variant="outlined" density="comfortable" color="#2F80ED"
                      prepend-inner-icon="mdi-file-multiple-outline"
                    />
                  </div>
                  <v-text-field
                    v-model="formData.deadline" type="datetime-local" label="Hạn chót (Deadline)"
                    variant="outlined" density="comfortable" color="#2F80ED"
                    prepend-inner-icon="mdi-calendar-clock-outline"
                  />
                  <v-select
                    v-model="formData.designerId" :items="designers" item-title="fullName" item-value="id"
                    label="Phân công Designer" placeholder="Chọn Designer phụ trách" clearable
                    :menu-props="{ contentClass: 'design-order-menu-bold' }"
                    variant="outlined" density="comfortable" color="#2F80ED"
                    prepend-inner-icon="mdi-account-edit-outline"
                  />
                </template>

                <div v-else class="readonly-summary">
                  <div class="summary-row"><span>Mã đơn hàng</span><strong>{{ order.orderCode }}</strong></div>
                  <div class="summary-row"><span>Số mẫu thiết kế</span><strong>{{ order.fileCount }}</strong></div>
                  <div class="summary-row"><span>Hạn chót</span><strong>{{ formatDeadline(order.deadline) }}</strong></div>
                  <div class="summary-row"><span>Designer</span><strong>{{ order.designer?.fullName || 'Chưa phân công' }}</strong></div>
                </div>
              </div>
            </section>

            <section class="form-card">
              <div class="section-heading">
                <span class="section-icon"><v-icon size="19">mdi-tune-variant</v-icon></span>
                <div><h3>Yêu cầu &amp; trạng thái</h3><p>Cập nhật quy trình, ghi chú và thuộc tính đơn</p></div>
              </div>
              <div class="card-content">
                <v-select
                  v-model="formData.status" :items="statusOptions" item-title="label" item-value="value"
                  :menu-props="{ contentClass: 'design-order-menu-bold' }"
                  label="Trạng thái đơn hàng *" required variant="outlined" density="comfortable"
                  color="#2F80ED" prepend-inner-icon="mdi-progress-check"
                />
                <v-textarea
                  v-model="formData.notes" label="Ghi chú"
                  variant="outlined" density="comfortable" rows="4" no-resize color="#2F80ED"
                  prepend-inner-icon="mdi-note-text-outline"
                />

                <div v-if="isAdminOrManager" class="option-list">
                  <label class="option-row urgent" :class="{ active: formData.isUrgent }">
                    <v-checkbox v-model="formData.isUrgent" color="red-darken-1" hide-details density="compact" />
                    <span class="option-icon"><v-icon size="18">mdi-alert-circle-outline</v-icon></span>
                    <span class="option-copy"><strong>Đơn hàng GẤP</strong><small>Ưu tiên xử lý trước các đơn thông thường</small></span>
                  </label>
                  <label class="option-row fee" :class="{ active: formData.hasDesignFee }">
                    <v-checkbox v-model="formData.hasDesignFee" color="orange-darken-2" hide-details density="compact" />
                    <span class="option-icon"><v-icon size="18">mdi-cash-plus</v-icon></span>
                    <span class="option-copy"><strong>Có phí thiết kế</strong><small>Cộng thêm 100.000đ vào đơn hàng</small></span>
                  </label>
                  <label class="option-row outsource" :class="{ active: formData.isOutsource }">
                    <v-checkbox v-model="formData.isOutsource" color="blue-darken-1" hide-details density="compact" />
                    <span class="option-icon"><v-icon size="18">mdi-account-group-outline</v-icon></span>
                    <span class="option-copy"><strong>Outsource</strong><small>Tính KPI Quang Trường</small></span>
                  </label>
                </div>
              </div>
            </section>

            <section v-if="order?.statusHistory?.length" class="form-card history-card">
              <div class="section-heading history-heading">
                <span class="section-icon"><v-icon size="19">mdi-history</v-icon></span>
                <div><h3>Lịch sử chuyển trạng thái</h3><p>{{ order.statusHistory.length }} lần cập nhật</p></div>
              </div>
              <div class="history-list">
                <article v-for="h in orderedStatusHistory" :key="h.id" class="history-item">
                  <div class="history-status-icon" aria-hidden="true">
                    <v-icon size="18">mdi-swap-horizontal</v-icon>
                  </div>
                  <div class="history-copy">
                    <span class="history-label">Chuyển trạng thái sang</span>
                    <strong>{{ getStatusLabel(h.status) }}</strong>
                    <div class="history-actor">
                      <v-icon size="14">mdi-account-outline</v-icon>
                      <span>{{ h.changedBy?.fullName || 'Hệ thống' }}</span>
                    </div>
                  </div>
                  <time class="history-time" :datetime="h.changedAt">
                    <v-icon size="14">mdi-clock-outline</v-icon>
                    <span>{{ formatTime(h.changedAt) }}</span>
                  </time>
                </article>
              </div>
            </section>
          </div>
        </v-form>
      </v-card-text>

      <footer class="modal-footer">
        <div class="footer-note"><v-icon size="17">mdi-information-outline</v-icon><span>Thay đổi được ghi lại trong lịch sử đơn</span></div>
        <div class="footer-actions">
          <v-btn variant="outlined" class="cancel-button" @click="close">Hủy</v-btn>
          <v-btn color="#2F80ED" class="create-button text-white" prepend-icon="mdi-content-save-outline"
            :loading="submitting" :disabled="!isValid" @click="submit">Lưu thay đổi</v-btn>
        </div>
      </footer>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useDisplay } from 'vuetify';
import { api } from '@/api/index';
import { useToast } from '@/composables/use-toast';
import { useAuthStore } from '@/stores/auth';
import { ORDER_STATUS_OPTIONS, getOrderStatusLabel } from '@/constants/order-status';

const props = defineProps<{ modelValue: boolean; order: any }>();
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void; (e: 'updated'): void }>();
const toast = useToast();
const authStore = useAuthStore();
const { mobile } = useDisplay();
const visible = ref(false);
const isValid = ref(false);
const submitting = ref(false);
const designers = ref<Array<{ id: string; fullName: string }>>([]);
const formData = ref({ orderCode: '', fileCount: 0, deadline: '', isUrgent: false, hasDesignFee: false, isOutsource: false, designerId: null as string | null, status: 'demo', notes: '' });
const statusOptions = ORDER_STATUS_OPTIONS;
const orderedStatusHistory = computed(() => [...(props.order?.statusHistory || [])].sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()));
const isAdminOrManager = computed(() => {
  const user = authStore.user;
  return user?.role === 'owner' || user?.role === 'admin' || authStore.canAccess('orders', 'edit');
});
watch(() => props.modelValue, (val) => {
  visible.value = val;
  if (val && props.order) { loadOrderData(); if (isAdminOrManager.value) loadDesigners(); }
});
watch(visible, val => emit('update:modelValue', val));
function loadOrderData() {
  const o = props.order;
  formData.value = {
    orderCode: o.orderCode || '', fileCount: o.fileCount || 0,
    deadline: o.deadline ? new Date(new Date(o.deadline).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '',
    isUrgent: !!o.isUrgent, hasDesignFee: !!o.hasDesignFee, isOutsource: !!o.isOutsource,
    designerId: o.designerId || null, status: o.status || 'demo', notes: o.notes || ''
  };
}
async function loadDesigners() {
  try { const res = await api.get<{ users?: Array<{ id: string; fullName: string }> }>('/users'); designers.value = res.data.users || []; }
  catch (err) { console.error('Cannot load designers:', err); }
}
async function submit() {
  if (submitting.value || !isValid.value) return;
  submitting.value = true;
  try {
    const payload = { ...formData.value, deadline: formData.value.deadline ? new Date(formData.value.deadline).toISOString() : null };
    await api.put(`/orders/${props.order.id}`, payload);
    toast.success('Cập nhật đơn hàng thành công!'); emit('updated'); close();
  } catch (err: any) { toast.error(err.response?.data?.error || 'Có lỗi xảy ra khi cập nhật đơn hàng'); }
  finally { submitting.value = false; }
}
function close() { visible.value = false; }
function getStatusLabel(s: string) { return getOrderStatusLabel(s); }
function formatDeadline(d: string) {
  if (!d) return 'Chưa cài đặt';
  return new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}
function formatTime(d: string) {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
  }).format(date);
}
</script>

<style scoped>
.design-order-modal {
  height: min(720px, calc(100vh - 32px));
  overflow: hidden;
  color: #172033;
  font-weight: 700;
  background: #f5f7fb;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.3) !important;
}

.modal-header {
  min-height: 84px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 0 24px;
  color: #fff;
  background: linear-gradient(135deg, #2879d8 0%, #1f6fce 100%);
}

.header-mark {
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.15);
}

.header-copy { min-width: 0; }
.header-copy h2 { margin: 0; font-size: 22px; line-height: 1.3; font-weight: 800; }
.header-copy p { margin: 3px 0 0; color: rgba(255, 255, 255, 0.82); font-size: 14px; font-weight: 700; }
.close-button { margin-left: auto !important; color: #fff !important; background: rgba(255, 255, 255, 0.1); }

.modal-body { padding: 20px !important; overflow: auto; }
.form-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
.form-card { overflow: hidden; background: #fff; border: 1px solid #dfe5ed; border-radius: 18px; box-shadow: 0 5px 20px rgba(31, 41, 55, 0.04); }
.section-heading { display: flex; align-items: center; gap: 11px; padding: 15px 16px; border-bottom: 1px solid #edf0f5; }
.section-icon { width: 34px; height: 34px; flex: 0 0 auto; display: grid; place-items: center; color: #2f80ed; background: #ebf3ff; border-radius: 11px; }
.section-heading h3 { margin: 0; color: #253248; font-size: 15px; line-height: 1.35; font-weight: 800; letter-spacing: 0.025em; text-transform: uppercase; }
.section-heading p { margin: 2px 0 0; color: #748196; font-size: 13px; font-weight: 700; }
.card-content { padding: 16px 16px 4px; }
.field-grid { display: grid; gap: 0 10px; }
.two-columns { grid-template-columns: repeat(2, minmax(0, 1fr)); }

.option-list { display: grid; gap: 8px; padding-bottom: 12px; }
.option-row { min-height: 60px; display: flex; align-items: center; gap: 7px; padding: 7px 12px 7px 5px; border: 1px solid #e1e6ed; border-radius: 12px; background: #fafbfc; cursor: pointer; transition: 0.18s ease; }
.option-row:hover { border-color: #b8c7d9; background: #fff; }
.option-row.active { border-color: #8bb7ed; background: #f3f8ff; box-shadow: 0 0 0 2px rgba(47, 128, 237, 0.07); }
.option-row.urgent.active { border-color: #f3a2a2; background: #fff7f7; box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.06); }
.option-row.fee.active { border-color: #f2c572; background: #fffbf2; box-shadow: 0 0 0 2px rgba(217, 119, 6, 0.06); }
.option-row :deep(.v-selection-control) { min-height: 38px; }
.option-icon { width: 30px; height: 30px; flex: 0 0 auto; display: grid; place-items: center; color: #657187; }
.urgent .option-icon { color: #dc2626; }
.fee .option-icon { color: #d97706; }
.outsource .option-icon { color: #2f80ed; }
.option-copy { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.option-copy strong { color: #273449; font-size: 14px; line-height: 1.3; }
.option-copy small { color: #748196; font-size: 12px; line-height: 1.35; font-weight: 700; }

.modal-footer { min-height: 70px; flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 22px; background: #fff; border-top: 1px solid #dfe5ed; }
.footer-note { display: flex; align-items: center; gap: 6px; color: #69768a; font-size: 13px; font-weight: 700; }
.footer-actions { display: flex; gap: 9px; }
.cancel-button { border-color: #d8dfe8; }
.create-button { min-width: 112px; }

.design-order-modal :deep(.v-field) { border-radius: 10px; background: #fff; }
.design-order-modal :deep(.v-field__input) { font-size: 15px; font-weight: 700; }
.design-order-modal :deep(.v-label) { font-size: 14px; font-weight: 700; }
.design-order-modal :deep(.v-input__details) { min-height: 15px; padding-top: 2px; }
.design-order-modal :deep(.v-textarea .v-field__input) { line-height: 1.45; }
.design-order-modal :deep(.v-btn) { font-size: 14px; font-weight: 800; }
.design-order-modal :deep(input::placeholder), .design-order-modal :deep(textarea::placeholder) { font-weight: 700; opacity: 0.82; }
.design-order-modal :deep(.v-select__selection-text), .design-order-modal :deep(.v-field__append-inner), .design-order-modal :deep(.v-field__prepend-inner) { font-weight: 700; }

@media (max-width: 800px) {
  .design-order-modal { height: 100%; border-radius: 0 !important; }
  .modal-header { min-height: 72px; padding: 0 16px; }
  .modal-body { padding: 14px !important; }
  .form-layout { grid-template-columns: 1fr; }
  .modal-footer { padding: 11px 16px; }
}

@media (max-width: 520px) {
  .header-mark { width: 38px; height: 38px; border-radius: 14px; }
  .header-copy h2 { font-size: 18px; }
  .header-copy p { display: none; }
  .two-columns { grid-template-columns: 1fr; }
  .footer-note { display: none; }
  .modal-footer { justify-content: flex-end; }
  .footer-actions { width: 100%; }
  .footer-actions .v-btn { flex: 1; }
}

.readonly-summary { display: grid; gap: 9px; margin-bottom: 14px; padding: 14px; border: 1px solid #e1e6ed; border-radius: 12px; background: #f8fafc; }
.summary-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; color: #5f6d82; font-size: 14px; font-weight: 700; }
.summary-row strong { color: #273449; text-align: right; }
.history-card { grid-column: 1 / -1; }
.history-heading { padding-bottom: 12px; }
.history-list { display: grid; gap: 10px; max-height: 220px; overflow: auto; padding: 14px 16px 16px; }
.history-item { display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; gap: 12px; align-items: center; min-height: 72px; padding: 12px 14px; border: 1px solid #e3e8ef; border-radius: 12px; background: #f8fafc; }
.history-status-icon { width: 38px; height: 38px; display: grid; place-items: center; color: #2f80ed; background: #eaf3ff; border-radius: 11px; }
.history-copy { min-width: 0; }
.history-label { display: block; margin-bottom: 2px; color: #748196; font-size: 11px; font-weight: 700; }
.history-copy strong { display: block; color: #253248; font-size: 15px; line-height: 1.35; }
.history-actor { display: flex; align-items: center; gap: 4px; margin-top: 5px; color: #657287; font-size: 12px; font-weight: 700; }
.history-time { display: flex; align-items: center; gap: 5px; align-self: center; white-space: nowrap; color: #657187; font-size: 12px; font-weight: 600; }
@media (max-width: 520px) {
  .history-list { padding: 12px; }
  .history-item { grid-template-columns: 34px minmax(0, 1fr); padding: 11px; }
  .history-status-icon { width: 34px; height: 34px; }
  .history-time { grid-column: 2; margin-top: -4px; }
}
:global(.design-order-menu-bold .v-list-item-title),
:global(.design-order-menu-bold .v-list-item-subtitle) { font-weight: 700 !important; }
:global(.design-order-menu-bold .v-list-item) { font-weight: 700; }
</style>
