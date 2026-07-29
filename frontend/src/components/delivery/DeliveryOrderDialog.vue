<template>
  <v-dialog
    v-model="open"
    :max-width="isEditing ? 1120 : 720"
    scrollable
    :fullscreen="mobile"
    class="delivery-order-dialog"
  >
    <v-card class="order-modal" :class="{ 'is-editing': isEditing }">
      <header class="modal-header">
        <div class="header-mark">
          <v-icon size="22">mdi-package-variant-closed</v-icon>
        </div>
        <div class="header-copy">
          <h2>{{ isEditing ? 'Cập nhật đơn giao vận' : 'Tạo đơn hàng mới' }}</h2>
          <p>{{ isEditing ? `Chỉnh sửa thông tin đơn ${form.orderCode || ''}` : 'Điền thông tin đơn, người nhận và vận chuyển' }}</p>
        </div>
        <v-btn
          icon="mdi-close"
          variant="text"
          size="small"
          aria-label="Đóng"
          class="close-button"
          @click="open = false"
        />
      </header>

      <v-card-text class="modal-body">
        <v-form ref="formRef" v-model="valid" @submit.prevent="save">
          <div class="form-layout" :class="{ 'is-editing': isEditing }">
            <section class="order-column">
              <div class="section-heading standalone">
                <span class="section-icon amber"><v-icon size="18">mdi-shopping-outline</v-icon></span>
                <div><h3>Thông tin đơn hàng</h3><p>Sản phẩm và giá trị đơn</p></div>
              </div>

              <div class="product-picker" role="radiogroup" aria-label="Loại sản phẩm">
                <button
                  v-for="item in productTypes"
                  :key="item.value"
                  type="button"
                  :class="{ active: form.productType === item.value }"
                  :aria-checked="form.productType === item.value"
                  role="radio"
                  @click="form.productType = item.value"
                >
                  <v-icon size="19">{{ item.icon }}</v-icon>
                  <span>{{ item.label }}</span>
                </button>
              </div>

              <div class="field-grid two">
                <v-text-field v-model="form.orderCode" label="Mã đơn *" placeholder="VD: DH1284" :rules="requiredCode" prepend-inner-icon="mdi-barcode" />
                <v-text-field v-model="form.createdDate" type="date" label="Ngày lên đơn *" />
                <v-text-field v-model.number="form.quantity" type="number" min="1" label="Số lượng" prepend-inner-icon="mdi-counter" />
                <v-text-field v-model.number="form.totalAmount" type="number" min="0" label="Tổng tiền *" suffix="đ" @focus="$event.target?.select()" />
                <v-text-field v-model.number="form.deposit" type="number" min="0" label="Đặt cọc" suffix="đ" @focus="$event.target?.select()" />
                <v-select v-model="form.paymentStatus" :items="paymentStatuses" item-title="label" item-value="value" label="Trạng thái thanh toán" />
                <v-select v-model="form.deliveryMethod" :items="deliveryMethods" item-title="label" item-value="value" label="Hình thức giao *" />
              </div>

              <v-textarea v-model="form.notes" label="Ghi chú đơn hàng" placeholder="Thông tin cần lưu ý cho đơn hàng..." rows="4" no-resize />

              <div class="payment-summary">
                <div><span>Tổng đơn</span><strong>{{ money(form.totalAmount) }}</strong></div>
                <div><span>Đã nhận</span><strong>{{ money(form.deposit) }}</strong></div>
                <div class="remaining"><span>Còn phải thu</span><strong>{{ money(remaining) }}</strong></div>
              </div>
            </section>

            <div v-if="isEditing" class="details-column">
              <section class="form-card tracking-card">
                <div class="section-heading tracking-heading">
                  <span class="section-icon green"><v-icon size="18">mdi-map-marker-path</v-icon></span>
                  <div><h3>Tracking vận chuyển</h3><p>{{ trackingSummary }}</p></div>
                  <v-btn icon="mdi-refresh" size="small" variant="text" aria-label="Tải lại tracking" :loading="trackingLoading" @click="refreshTracking(false)" />
                </div>
                <div v-if="tracking" class="tracking-content">
                  <div class="tracking-overview">
                    <strong>{{ tracking.carrier || 'Pancake' }}</strong>
                    <span v-if="tracking.trackingCode" class="tracking-code">{{ tracking.trackingCode }}</span>
                    <span v-if="tracking.statusText" class="tracking-status">{{ tracking.statusText }}</span>
                    <a v-if="tracking.trackingLink" :href="tracking.trackingLink" target="_blank" rel="noopener">Xem tracking</a>
                  </div>
                  <div class="tracking-meta">
                    <span v-if="tracking.serviceName"><b>Dịch vụ:</b> {{ tracking.serviceName }}</span>
                    <span v-if="tracking.pickedUpAt"><b>Lấy hàng:</b> {{ formatDateTime(tracking.pickedUpAt) }}</span>
                    <span v-if="tracking.expectedDeliveryAt"><b>Dự kiến:</b> {{ formatDateTime(tracking.expectedDeliveryAt) }}</span>
                    <span v-if="tracking.fee"><b>Phí ship:</b> {{ money(tracking.fee) }}</span>
                    <span v-if="tracking.deliveryName"><b>Nhân viên giao:</b> {{ tracking.deliveryName }}<template v-if="tracking.deliveryPhone"> · {{ tracking.deliveryPhone }}</template></span>
                    <span v-if="tracking.note"><b>Ghi chú shipper:</b> {{ tracking.note }}</span>
                  </div>
                  <div v-if="tracking.history?.length" class="tracking-list">
                    <div v-for="(event, index) in tracking.history" :key="`${event.status}-${event.updatedAt}-${index}`" class="tracking-event">
                      <span class="tracking-dot"></span>
                      <div>
                        <strong>{{ event.status || 'Cập nhật vận chuyển' }}</strong>
                        <small>{{ [formatDateTime(event.updatedAt), event.location].filter(Boolean).join(' · ') }}</small>
                        <small v-if="event.note">{{ event.note }}</small>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-else-if="trackingLoading" class="tracking-empty"><v-progress-circular indeterminate size="22"/><span>Đang tải tracking từ Pancake...</span></div>
                <div v-else class="tracking-empty"><v-icon size="24">mdi-package-variant</v-icon><span>Chưa có dữ liệu vận chuyển trên Pancake</span></div>
              </section>
            </div>
          </div>
        </v-form>
      </v-card-text>

      <footer class="modal-footer">
        <div class="footer-balance">
          <span>Còn phải thu</span>
          <strong>{{ money(remaining) }}</strong>
        </div>
        <div class="footer-actions">
          <v-btn variant="outlined" class="cancel-button" @click="open = false">Hủy</v-btn>
          <v-btn color="#1A6FD4" prepend-icon="mdi-content-save-outline" :loading="saving" :disabled="!valid" @click="save">
            {{ isEditing ? 'Lưu thay đổi' : 'Tạo đơn' }}
          </v-btn>
        </div>
      </footer>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useDisplay } from 'vuetify';
import { api } from '@/api';
import { useToast } from '@/composables/use-toast';
import { paymentStatuses, deliveryMethods } from '@/constants/delivery';

const props = withDefaults(defineProps<{
  modelValue?: boolean;
  model?: any;
}>(), {
  modelValue: false
});

const emit = defineEmits(['update:modelValue', 'saved', 'refresh-tracking']);
const toast = useToast();
const { mobile } = useDisplay();
const saving = ref(false);
const trackingLoading = ref(false);
const tracking = ref<any>(null);
const codTouched = ref(false);
const valid = ref(false);
const formRef = ref<any>();

const open = computed({
  get: () => Boolean(props.modelValue),
  set: (val: boolean) => emit('update:modelValue', val)
});

const productTypes = [
  { value: 'invitation', label: 'Thiệp', icon: 'mdi-email-heart-outline' },
  { value: 'ao', label: 'Áo', icon: 'mdi-tshirt-crew-outline' },
  { value: 'anh', label: 'Ảnh', icon: 'mdi-image-outline' },
];
const requiredCode = [(value: string) => !!value?.trim() || 'Vui lòng nhập mã đơn'];
const today = () => new Date().toISOString().slice(0, 10);
const blank = () => ({
  orderCode: '', productType: 'invitation', quantity: 1, createdDate: today(), totalAmount: 0, deposit: 0,
  paymentStatus: 'unpaid', deliveryMethod: 'viettelpost', deliveryStatus: 'pending', warehouseName: '',
  recipientName: '', recipientPhone: '', addressLine: '',
  carrierName: '', trackingCode: '', trackingLink: '', codAmount: 0, shippingFee: 0, notes: '',
});
const form = reactive(blank());
const isEditing = computed(() => Boolean(props.model?.id || props.model?.orderCode));
const remaining = computed(() => form.paymentStatus === 'paid' ? 0 : Math.max(0, Number(form.totalAmount || 0) - Number(form.deposit || 0)));
const trackingSummary = computed(() => tracking.value?.trackingCode ? `Mã vận đơn ${tracking.value.trackingCode}` : 'Đồng bộ trực tiếp từ Pancake');

watch(() => [open.value, props.model], () => {
  if (!open.value) return;
  Object.assign(form, blank(), props.model || {});
  form.createdDate = toDateInput(props.model?.createdDate) || today();
  tracking.value = null;
  codTouched.value = Number(props.model?.codAmount || 0) > 0;
  if (!codTouched.value) form.codAmount = remaining.value;
  if (props.model?.id) void refreshTracking(true);
}, { immediate: true });

watch(remaining, (value) => {
  if (!codTouched.value) form.codAmount = value;
});

async function refreshTracking(silent = false) {
  if (!props.model?.id || trackingLoading.value) return;
  const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(props.model.id);
  if (!isValidUuid) return;
  trackingLoading.value = true;
  try {
    const { data } = await api.post(`/delivery/orders/${props.model.id}/refresh-tracking`);
    tracking.value = data.tracking || null;
    if (data.deliveryOrder) Object.assign(form, data.deliveryOrder, { createdDate: toDateInput(data.deliveryOrder.createdDate) });
    if (!silent) toast.success(data.tracking ? 'Đã cập nhật tracking từ Pancake' : 'Đơn Pancake chưa có thông tin vận chuyển');
  } catch (error: any) {
    if (!silent) toast.error(error.response?.data?.error || 'Không tải được tracking từ Pancake');
  } finally {
    trackingLoading.value = false;
  }
}

function toDateInput(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toISOString().slice(0, 10);
}
function money(value: unknown) {
  return `${new Intl.NumberFormat('vi-VN').format(Number(value) || 0)} Đ`;
}
function formatDateTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}
async function save() {
  if (saving.value) return;
  const result = await formRef.value?.validate();
  if (result && !result.valid) return;
  saving.value = true;
  try {
    const payload = { ...form, createdDate: form.createdDate || undefined };
    if (props.model?.id) await api.put(`/delivery/orders/${props.model.id}`, payload);
    else await api.post('/delivery/orders', payload);
    toast.success(props.model?.id ? 'Đã cập nhật đơn giao vận' : 'Đã tạo đơn giao vận');
    open.value = false;
    emit('saved');
  } catch (error: any) {
    toast.error(error.response?.data?.error || 'Không lưu được đơn giao vận');
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.order-modal{height:min(860px,calc(100vh - 32px));overflow:hidden;background:var(--surface-2,#F7F8FC);color:#172033;border:1px solid rgba(255,255,255,.18);box-shadow:0 28px 80px rgba(15,23,42,.3)!important}.modal-header{height:76px;flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:0 22px;background:#1A6FD4;color:#fff}.header-mark{width:40px;height:40px;border-radius:18px;display:grid;place-items:center;background:rgba(255,255,255,.16);color:#fff;border:1px solid rgba(255,255,255,.2)}.header-copy{min-width:0}.header-copy h2{margin:0;font-size:18px;line-height:1.3;font-weight:800}.header-copy p{margin:3px 0 0;color:rgba(255,255,255,.78);font-size:12px}.close-button{margin-left:auto!important;color:#fff!important;background:rgba(255,255,255,.1)}.modal-body{padding:18px!important;overflow:auto}.form-layout{display:grid;grid-template-columns:minmax(330px,.78fr) minmax(500px,1.22fr);gap:16px;align-items:start}.order-column{background:#fff;border:1px solid #dfe5ed;border-radius:18px;padding:16px;box-shadow:0 5px 20px rgba(31,41,55,.04)}.details-column{display:grid;gap:14px}.form-card{background:#fff;border:1px solid #dfe5ed;border-radius:18px;overflow:hidden;box-shadow:0 5px 20px rgba(31,41,55,.04)}.section-heading{display:flex;align-items:center;gap:10px;padding:13px 14px;border-bottom:1px solid #edf0f5}.section-heading.standalone{padding:0 0 13px;border-bottom:0}.section-heading h3{font-size:13px;line-height:1.35;margin:0;text-transform:uppercase;letter-spacing:.025em;font-weight:800;color:#253248}.section-heading p{font-size:11px;color:#7d899b;margin:2px 0 0}.section-icon{width:32px;height:32px;display:grid;place-items:center;border-radius:10px;flex:0 0 auto}.section-icon.amber{background:var(--brand-soft,#EBF3FF);color:var(--brand,#2F80ED)}.section-icon.blue{background:var(--brand-soft,#EBF3FF);color:var(--brand,#2F80ED)}.section-icon.green{background:#e6f8ee;color:#158a4e}.card-content{padding:14px 14px 2px}.product-picker{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px}.product-picker button{height:48px;border:1px solid #dbe2eb;border-radius:10px;background:#fff;color:#657187;display:flex;align-items:center;justify-content:center;gap:7px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;transition:.18s ease}.product-picker button:hover{border-color:#88afe6;background:#f7faff}.product-picker button.active{color:var(--brand-700,#1565c0);border-color:var(--brand,#2F80ED);background:var(--brand-soft,#EBF3FF);box-shadow:0 0 0 2px rgba(47,128,237,.1)}.field-grid{display:grid;gap:0 10px}.field-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}.field-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.payment-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;border-top:1px solid #edf0f5;padding-top:14px}.payment-summary div{padding:10px;border-radius:10px;background:#f7f9fc}.payment-summary span,.footer-balance span{display:block;color:#7b8798;font-size:10px;text-transform:uppercase;letter-spacing:.05em}.payment-summary strong{display:block;font-size:13px;margin-top:4px;color:#253248}.payment-summary .remaining{background:#edf8f3}.payment-summary .remaining strong{color:#0b9a58}.tracking-heading>.v-btn{margin-left:auto}.tracking-content{padding:12px 16px}.tracking-overview{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.tracking-code{padding:3px 8px;border:1px solid #dce3ec;border-radius:7px;background:#f7f9fc;font-size:11px;font-weight:700}.tracking-status{padding:3px 8px;border-radius:999px;background:#EBF3FF;color:#1A6FD4;font-size:11px;font-weight:700}.tracking-overview a{font-size:11px;color:#1A6FD4}.tracking-meta{display:flex;flex-wrap:wrap;gap:6px 18px;padding:10px 0;border-bottom:1px solid #edf0f5;color:#536075;font-size:11px}.tracking-meta b{color:#253248}.tracking-list{padding:8px 16px 12px}.tracking-event{position:relative;display:flex;gap:10px;padding:7px 0 7px 2px}.tracking-event:not(:last-child):before{content:"";position:absolute;left:6px;top:19px;bottom:-8px;width:1px;background:#dbe5de}.tracking-dot{width:9px;height:9px;border-radius:50%;background:#28a765;margin-top:4px;box-shadow:0 0 0 3px #e5f7ed;z-index:1}.tracking-event strong,.tracking-event small{display:block}.tracking-event strong{font-size:12px}.tracking-event small{font-size:11px;color:#7b8798;margin-top:2px}.tracking-empty{display:flex;align-items:center;justify-content:center;gap:8px;padding:18px;color:#93a0b2;font-size:12px}.modal-footer{min-height:68px;flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:11px 22px;background:#fff;border-top:1px solid #dfe5ed}.footer-balance strong{display:block;color:#08a85d;font-size:18px;margin-top:2px}.footer-actions{display:flex;gap:9px}.cancel-button{border-color:#d8dfe8}.order-modal :deep(.v-field){border-radius:10px;background:#fff}.order-modal :deep(.v-field__input){font-size:13px}.order-modal :deep(.v-label){font-size:12px}.order-modal :deep(.v-input__details){min-height:14px;padding-top:2px}.order-modal :deep(.v-textarea .v-field__input){line-height:1.45}.order-modal :deep(.v-btn){font-weight:700}
@media(max-width:900px){.order-modal{height:100%;border-radius:0!important}.modal-header{height:68px;padding:0 14px}.modal-body{padding:12px!important}.form-layout{grid-template-columns:1fr}.order-column{padding:14px}.modal-footer{padding:10px 14px}}
@media(max-width:600px){.header-mark{display:none}.header-copy h2{font-size:16px}.field-grid.two,.field-grid.three{grid-template-columns:1fr}.product-picker button{height:44px}.payment-summary{grid-template-columns:1fr 1fr}.payment-summary .remaining{grid-column:1/-1}.modal-footer{position:sticky;bottom:0}.footer-balance strong{font-size:15px}.footer-actions .v-btn{min-width:0;padding-inline:12px}}

/* Popup giao vận: chữ lớn, đậm, dễ đọc. */
.order-modal:not(.is-editing){height:auto;max-height:calc(100vh - 32px)}
.form-layout:not(.is-editing){display:block;max-width:100%}
.form-layout:not(.is-editing) .order-column{width:100%}
.order-modal,.order-modal :deep(.v-field__input),.order-modal :deep(.v-label),.order-modal :deep(.v-select__selection-text),.order-modal :deep(.v-btn),.order-modal textarea{font-weight:700!important}
.header-copy h2{font-size:21px}
.header-copy p{font-size:14px;font-weight:700}
.section-heading h3{font-size:15px}
.section-heading p{font-size:13px;font-weight:700}
.product-picker button{font-size:15px;font-weight:800}
.order-modal :deep(.v-field__input){font-size:15px}
.order-modal :deep(.v-label){font-size:14px}
.payment-summary span,.footer-balance span{font-size:12px;font-weight:800}
.payment-summary strong{font-size:15px;font-weight:800}
.tracking-overview,.tracking-code,.tracking-status,.tracking-overview a,.tracking-meta,.tracking-event strong,.tracking-event small,.tracking-empty{font-size:14px;font-weight:700}
.tracking-overview>strong{font-size:16px;font-weight:800}
.footer-balance strong{font-size:20px;font-weight:800}
.order-modal :deep(.v-btn){font-size:15px}
</style>
