<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { api } from '@/api';
import { useToast } from '@/composables/use-toast';
import { currentDate, LEAVE_SESSIONS } from '@/constants/hr';

const model = defineModel<boolean>({ default: false });
const emit = defineEmits<{ (e: 'submitted'): void }>();
const toast = useToast();

const leaveTypes = [
  { value: 'normal', title: 'Nghỉ thường', description: 'Đi chơi, về quê, việc cá nhân', icon: 'mdi-calendar-blank-outline' },
  { value: 'multi_day', title: 'Nghỉ nhiều ngày', description: 'Du lịch, cưới hỏi, công tác', icon: 'mdi-calendar-range-outline' },
  { value: 'emergency', title: 'Nghỉ khẩn cấp', description: 'Bệnh, tai nạn, người thân nhập viện', icon: 'mdi-alert-circle-outline' },
] as const;

const form = reactive({
  type: 'normal',
  session: 'full',
  startDate: currentDate(),
  endDate: currentDate(),
  reason: '',
});
const submitting = ref(false);
const error = ref('');
const maxReason = 200;
const isMultiDay = computed(() => form.type === 'multi_day' || form.session === 'multi');
const minEndDate = computed(() => form.startDate || currentDate());

watch(() => form.type, (value) => {
  if (value === 'multi_day') form.session = 'multi';
  else if (form.session === 'multi') form.session = 'full';
});
watch(() => form.startDate, (value) => {
  if (!isMultiDay.value || form.endDate < value) form.endDate = value;
});
watch(model, (open) => {
  if (open) error.value = '';
});

function selectSession(value: string) {
  form.session = value;
  if (value !== 'multi') form.endDate = form.startDate;
}
function close() {
  if (!submitting.value) model.value = false;
}
async function submit() {
  const reason = form.reason.trim();
  if (!form.startDate) { error.value = 'Chọn ngày nghỉ'; return; }
  if (isMultiDay.value && (!form.endDate || form.endDate < form.startDate)) {
    error.value = 'Ngày kết thúc phải từ ngày bắt đầu trở đi'; return;
  }
  if (!reason) { error.value = 'Nhập lý do nghỉ'; return; }
  error.value = '';
  submitting.value = true;
  try {
    await api.post('/leave', {
      type: form.type,
      session: form.session,
      startDate: form.startDate,
      endDate: isMultiDay.value ? form.endDate : form.startDate,
      reason,
    });
    toast.success('Đã gửi đơn nghỉ phép');
    model.value = false;
    form.reason = '';
    emit('submitted');
  } catch (err: any) {
    error.value = err?.response?.data?.hint || err?.response?.data?.error || 'Gửi đơn thất bại';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <v-dialog v-model="model" max-width="720" persistent scrollable>
    <v-card class="leave-dialog">
      <header class="dialog-header">
        <div>
          <h2>Xin nghỉ phép</h2>
          <p>Điền thông tin để gửi quản lý phê duyệt</p>
        </div>
        <button type="button" class="close-btn" aria-label="Đóng" :disabled="submitting" @click="close">
          <v-icon icon="mdi-close" size="20" />
        </button>
      </header>

      <v-card-text class="dialog-body">
        <section class="form-section">
          <div class="section-title"><span>1</span><div><strong>Chọn loại nghỉ</strong><small>Chọn trường hợp phù hợp với yêu cầu</small></div></div>
          <div class="type-grid">
            <button
              v-for="item in leaveTypes" :key="item.value" type="button"
              class="type-option" :class="{ 'is-selected': form.type === item.value }"
              :aria-pressed="form.type === item.value" @click="form.type = item.value"
            >
              <span class="type-icon"><v-icon :icon="item.icon" size="20" /></span>
              <span><strong>{{ item.title }}</strong><small>{{ item.description }}</small></span>
              <v-icon v-if="form.type === item.value" icon="mdi-check-circle" size="18" class="selected-check" />
            </button>
          </div>
          <div class="policy-note"><v-icon icon="mdi-information-outline" size="18" /><span><strong>Lưu ý</strong> Nên gửi trước ít nhất 1 ngày để quản lý sắp xếp công việc.</span></div>
        </section>

        <section class="form-section">
          <div class="section-title"><span>2</span><div><strong>Chọn thời gian</strong><small>Chọn buổi hoặc khoảng ngày muốn nghỉ</small></div></div>
          <div class="session-options" role="group" aria-label="Chọn thời gian nghỉ">
            <button
              v-for="session in LEAVE_SESSIONS" :key="session.value" type="button"
              :class="{ 'is-selected': form.session === session.value }"
              :aria-pressed="form.session === session.value" @click="selectSession(session.value)"
            >{{ session.label }}</button>
          </div>
          <div class="date-grid" :class="{ 'is-single': !isMultiDay }">
            <label><span>{{ isMultiDay ? 'Từ ngày' : 'Ngày nghỉ' }}</span><input v-model="form.startDate" type="date" /></label>
            <label v-if="isMultiDay"><span>Đến ngày</span><input v-model="form.endDate" type="date" :min="minEndDate" /></label>
          </div>
        </section>

        <section class="form-section">
          <div class="section-title"><span>3</span><div><strong>Lý do nghỉ</strong><small>Mô tả ngắn gọn để quản lý xem xét</small></div></div>
          <div class="reason-field" :class="{ 'has-error': error }">
            <textarea v-model="form.reason" :maxlength="maxReason" rows="4" placeholder="Nhập lý do nghỉ..." />
            <span>{{ form.reason.length }}/{{ maxReason }}</span>
          </div>
          <div v-if="error" class="form-error" role="alert"><v-icon icon="mdi-alert-circle-outline" size="17" />{{ error }}</div>
        </section>
      </v-card-text>

      <footer class="dialog-footer">
        <v-btn variant="outlined" color="default" :disabled="submitting" @click="close">Huỷ</v-btn>
        <v-btn color="primary" prepend-icon="mdi-calendar-check-outline" :loading="submitting" @click="submit">Gửi đơn nghỉ</v-btn>
      </footer>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.leave-dialog { border-radius:16px !important; overflow:hidden; background:#f8f9fc; }
.dialog-header { min-height:80px; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:16px 24px; border-bottom:1px solid var(--smax-grey-200); background:#fff; }
.dialog-header h2 { margin:0; color:var(--smax-text); font-size:22px; font-weight:750; }.dialog-header p { margin:3px 0 0; color:#858a96; font-size:13.5px; }
.close-btn { width:40px; height:40px; display:grid; place-items:center; border:0; border-radius:9px; color:#667085; background:#f2f4f7; cursor:pointer; }.close-btn:hover { color:var(--smax-text); background:#e8ebf0; }
.dialog-body { display:flex; flex-direction:column; gap:12px; padding:18px 22px !important; }
.form-section { padding:18px; border:1px solid var(--smax-grey-200); border-radius:14px; background:#fff; box-shadow:0 1px 2px rgba(16,24,40,.03); }
.section-title { display:flex; align-items:flex-start; gap:9px; margin-bottom:13px; }.section-title>span { width:38px; height:38px; flex:0 0 38px; display:grid; place-items:center; border-radius:9px; color:var(--smax-primary); background:var(--smax-primary-soft); font-size:13px; font-weight:750; }.section-title div { display:flex; flex-direction:column; gap:1px; }.section-title strong { color:#303442; font-size:15px; }.section-title small { color:#969aa5; font-size:12.5px; }
.type-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }.type-option { min-height:112px; position:relative; display:flex; align-items:flex-start; gap:9px; padding:14px; border:1px solid #dfe3ea; border-radius:11px; color:inherit; background:#fff; text-align:left; cursor:pointer; }.type-option:hover { border-color:#a9c3ed; }.type-option.is-selected { border-color:var(--smax-primary); background:#f6f9ff; box-shadow:0 0 0 2px rgba(47,128,237,.07); }.type-icon { width:38px; height:38px; flex:0 0 38px; display:grid; place-items:center; border-radius:8px; color:#667085; background:#f2f4f7; }.is-selected .type-icon { color:var(--smax-primary); background:var(--smax-primary-soft); }.type-option>span:nth-child(2) { display:flex; flex-direction:column; gap:4px; }.type-option strong { color:#303442; font-size:13.5px; }.type-option small { color:#8d919c; font-size:12px; line-height:1.45; }.selected-check { position:absolute; top:8px; right:8px; color:var(--smax-primary); }
.policy-note { display:flex; align-items:flex-start; gap:7px; margin-top:10px; padding:11px 12px; border:1px solid #f6ddb0; border-radius:9px; color:#9a650e; background:#fff9ec; font-size:12.5px; }.policy-note strong { margin-right:3px; }
.session-options { display:flex; flex-wrap:wrap; gap:7px; margin-bottom:12px; }.session-options button { min-height:48px; padding:0 17px; border:1px solid #dfe3ea; border-radius:999px; color:#667085; background:#fff; font:650 14px inherit; cursor:pointer; }.session-options button.is-selected { border-color:var(--smax-primary); color:var(--smax-primary-700); background:var(--smax-primary-soft); }
.date-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }.date-grid.is-single { grid-template-columns:1fr; }.date-grid label { display:flex; flex-direction:column; gap:6px; }.date-grid label>span { color:#596171; font-size:13px; font-weight:700; }.date-grid input { min-height:48px; width:100%; padding:0 12px; border:1px solid #dfe3ea; border-radius:10px; color:#303442; background:#fff; font:600 14px inherit; outline:0; }.date-grid input:focus { border-color:var(--smax-primary); box-shadow:0 0 0 3px var(--smax-primary-soft); }
.reason-field { position:relative; border:1px solid #dfe3ea; border-radius:10px; overflow:hidden; background:#fff; }.reason-field:focus-within { border-color:var(--smax-primary); box-shadow:0 0 0 3px var(--smax-primary-soft); }.reason-field.has-error { border-color:var(--smax-error); }.reason-field textarea { width:100%; resize:vertical; display:block; padding:14px 14px 32px; border:0; outline:0; color:#303442; background:transparent; font:14px/1.55 inherit; }.reason-field textarea::placeholder { color:#a4a8b2; }.reason-field>span { position:absolute; right:10px; bottom:7px; color:#9ca0aa; font-size:11.5px; }.form-error { display:flex; align-items:center; gap:5px; margin-top:7px; color:#c4373e; font-size:12.5px; }
.dialog-footer { display:flex; justify-content:flex-end; gap:9px; padding:14px 22px 16px; border-top:1px solid var(--smax-grey-200); background:#fff; }.dialog-footer .v-btn { min-height:44px; font-weight:700; }
.section-title { margin-bottom:16px; }.section-title small { color:#707888; line-height:1.4; }.type-option small { color:#697386; }.dialog-header p { color:#667085; }.reason-field textarea { min-height:112px; }.dialog-footer .v-btn { font-size:14px; padding-inline:18px; }@media(max-width:600px){.leave-dialog{border-radius:14px 14px 0 0 !important}.dialog-header{padding:13px 14px}.dialog-body{padding:12px !important}.form-section{padding:13px}.type-grid{grid-template-columns:1fr}.type-option{min-height:74px}.date-grid{grid-template-columns:1fr}.dialog-footer{padding:10px 12px 14px}.dialog-footer .v-btn{flex:1}.section-title small{font-size:12px}}
</style>
