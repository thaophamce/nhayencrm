<script setup lang="ts">
import { ref, watch } from 'vue';
import { api } from '@/api';
import { useToast } from '@/composables/use-toast';

const model = defineModel<boolean>({ default: false });
const emit = defineEmits<{ (e: 'submitted'): void }>();
const toast = useToast();

const amount = ref('');
const reason = ref('');
const submitting = ref(false);
const error = ref('');
const maxReason = 200;

watch(model, (open) => {
  if (open) {
    amount.value = '';
    reason.value = '';
    error.value = '';
  }
});

function close() {
  if (!submitting.value) model.value = false;
}

function formatAmountInput(value: string) {
  // Remove non-digits
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return new Intl.NumberFormat('vi-VN').format(Number(digits));
}

function onAmountInput(e: Event) {
  const input = e.target as HTMLInputElement;
  const digits = input.value.replace(/\D/g, '');
  input.value = digits ? new Intl.NumberFormat('vi-VN').format(Number(digits)) : '';
}

async function submit() {
  const rawAmount = Number(amount.value.replace(/\D/g, ''));
  if (!rawAmount || rawAmount <= 0) {
    error.value = 'Nhập số tiền muốn ứng';
    return;
  }
  if (rawAmount < 100000) {
    error.value = 'Số tiền ứng tối thiểu 100.000 đ';
    return;
  }
  const reasonText = reason.value.trim();
  if (!reasonText) {
    error.value = 'Nhập lý do ứng lương';
    return;
  }
  error.value = '';
  submitting.value = true;
  try {
    await api.post('/salary-advance', {
      amount: rawAmount,
      reason: reasonText,
    });
    toast.success('Đã gửi đơn xin ứng lương');
    model.value = false;
    emit('submitted');
  } catch (err: any) {
    error.value = err?.response?.data?.hint || err?.response?.data?.error || 'Gửi đơn thất bại';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <v-dialog v-model="model" max-width="520" persistent scrollable>
    <v-card class="advance-dialog">
      <header class="dialog-header">
        <div>
          <h2>Xin ứng lương</h2>
          <p>Gửi yêu cầu tạm ứng lương cho quản lý phê duyệt</p>
        </div>
        <button type="button" class="close-btn" aria-label="Đóng" :disabled="submitting" @click="close">
          <v-icon icon="mdi-close" size="20" />
        </button>
      </header>

      <v-card-text class="dialog-body">
        <section class="form-section">
          <div class="section-title">
            <span class="step-badge">1</span>
            <div><strong>Số tiền muốn ứng</strong><small>Nhập số tiền bạn muốn tạm ứng</small></div>
          </div>
          <div class="amount-field" :class="{ 'has-error': error && !amount }">
            <span class="currency-prefix">đ</span>
            <input
              v-model="amount"
              type="text"
              inputmode="numeric"
              placeholder="Nhập số tiền..."
              @input="onAmountInput"
            />
          </div>
          <p class="quick-amounts">
            <button
              v-for="val in [1000000, 2000000, 5000000, 10000000]"
              :key="val"
              type="button"
              class="quick-amount-btn"
              @click="amount = formatAmountInput(String(val))"
            >
              {{ formatAmountInput(String(val)) }} đ
            </button>
          </p>
        </section>

        <section class="form-section">
          <div class="section-title">
            <span class="step-badge">2</span>
            <div><strong>Lý do ứng lương</strong><small>Mô tả ngắn gọn để quản lý xem xét</small></div>
          </div>
          <div class="reason-field" :class="{ 'has-error': error && !reason }">
            <textarea
              v-model="reason"
              :maxlength="maxReason"
              rows="3"
              placeholder="Nhập lý do cần ứng lương..."
            />
            <span>{{ reason.length }}/{{ maxReason }}</span>
          </div>
          <div v-if="error" class="form-error" role="alert">
            <v-icon icon="mdi-alert-circle-outline" size="17" />{{ error }}
          </div>
        </section>
      </v-card-text>

      <footer class="dialog-footer">
        <v-btn variant="outlined" color="default" :disabled="submitting" @click="close">Huỷ</v-btn>
        <v-btn color="#7b1fa2" prepend-icon="mdi-cash-fast" :loading="submitting" @click="submit">Gửi đơn ứng lương</v-btn>
      </footer>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.advance-dialog { border-radius:16px !important; overflow:hidden; background:#f8f9fc; }
.dialog-header { min-height:80px; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:16px 24px; border-bottom:1px solid var(--smax-grey-200); background:#fff; }
.dialog-header h2 { margin:0; color:var(--smax-text); font-size:22px; font-weight:750; }
.dialog-header p { margin:3px 0 0; color:#858a96; font-size:13.5px; }
.close-btn { width:40px; height:40px; display:grid; place-items:center; border:0; border-radius:9px; color:#667085; background:#f2f4f7; cursor:pointer; }
.close-btn:hover { color:var(--smax-text); background:#e8ebf0; }
.dialog-body { display:flex; flex-direction:column; gap:12px; padding:18px 22px !important; }
.form-section { padding:18px; border:1px solid var(--smax-grey-200); border-radius:14px; background:#fff; box-shadow:0 1px 2px rgba(16,24,40,.03); }
.section-title { display:flex; align-items:flex-start; gap:9px; margin-bottom:13px; }
.step-badge { width:38px; height:38px; flex:0 0 38px; display:grid; place-items:center; border-radius:9px; color:#7b1fa2; background:#f3e5f5; font-size:13px; font-weight:750; }
.section-title div { display:flex; flex-direction:column; gap:1px; }
.section-title strong { color:#303442; font-size:15px; }
.section-title small { color:#969aa5; font-size:12.5px; }
.amount-field { position:relative; display:flex; align-items:center; border:1px solid #dfe3ea; border-radius:10px; overflow:hidden; background:#fff; }
.amount-field:focus-within { border-color:#7b1fa2; box-shadow:0 0 0 3px rgba(123,31,162,.08); }
.amount-field.has-error { border-color:var(--smax-error); }
.currency-prefix { padding:0 14px; font-size:18px; font-weight:800; color:#7b1fa2; border-right:1px solid #e8ebf0; background:#fafafa; }
.amount-field input { flex:1; min-height:56px; padding:0 14px; border:0; outline:0; color:#303442; background:transparent; font-size:20px; font-weight:700; font-family:inherit; }
.amount-field input::placeholder { color:#b0b4be; font-size:16px; font-weight:600; }
.quick-amounts { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
.quick-amount-btn { padding:6px 12px; border:1px solid #dfe3ea; border-radius:8px; background:#fff; color:#667085; font-size:12.5px; font-weight:700; cursor:pointer; font-family:inherit; }
.quick-amount-btn:hover { border-color:#7b1fa2; color:#7b1fa2; background:#fdf8ff; }
.reason-field { position:relative; border:1px solid #dfe3ea; border-radius:10px; overflow:hidden; background:#fff; }
.reason-field:focus-within { border-color:#7b1fa2; box-shadow:0 0 0 3px rgba(123,31,162,.08); }
.reason-field.has-error { border-color:var(--smax-error); }
.reason-field textarea { width:100%; resize:vertical; display:block; padding:14px 14px 32px; border:0; outline:0; color:#303442; background:transparent; font:14px/1.55 inherit; }
.reason-field textarea::placeholder { color:#a4a8b2; }
.reason-field>span { position:absolute; right:10px; bottom:7px; color:#9ca0aa; font-size:11.5px; }
.form-error { display:flex; align-items:center; gap:5px; margin-top:7px; color:#c4373e; font-size:12.5px; }
.dialog-footer { display:flex; justify-content:flex-end; gap:9px; padding:14px 22px 16px; border-top:1px solid var(--smax-grey-200); background:#fff; }
.dialog-footer .v-btn { min-height:44px; font-weight:700; }
@media(max-width:600px){.advance-dialog{border-radius:14px 14px 0 0 !important}.dialog-header{padding:13px 14px}.dialog-body{padding:12px !important}.form-section{padding:13px}.dialog-footer{padding:10px 12px 14px}.dialog-footer .v-btn{flex:1}}
</style>