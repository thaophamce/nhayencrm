<!--
  TimeAmountInput — ô nhập thời gian: [số] + [dropdown đơn vị Giây/Phút/Giờ/Ngày]
  (Anh chốt 2026-06-04). Dùng chung cho wizard Trigger + Sequence builder.

  - v-model = giá trị theo ĐƠN VỊ GỐC mà backend cần (prop `baseUnit`), KHÔNG đổi schema BE.
  - Hiển thị: tự quy đổi sang đơn vị "đẹp" nhất khi load (auto): <60 phút → phút,
    <24 giờ → giờ, ≥24 giờ → ngày, <60 giây → giây. Anh đổi đơn vị tùy ý.
  - Emit: luôn quy về baseUnit (giây/phút/ngày) để parent gửi thẳng cho BE.

  Thuần HTML (không phụ thuộc Vuetify) để cắm được cả 2 hệ UI.
-->
<template>
  <div class="time-amount">
    <input
      class="ta-num"
      type="number"
      :min="0"
      :value="displayValue"
      @input="onNumInput"
    />
    <select class="ta-unit" :value="displayUnit" @change="onUnitChange">
      <option v-for="u in allowedUnits" :key="u" :value="u">{{ UNIT_LABEL[u] }}</option>
    </select>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

type Unit = 'second' | 'minute' | 'hour' | 'day';

const UNIT_LABEL: Record<Unit, string> = {
  second: 'Giây',
  minute: 'Phút',
  hour: 'Giờ',
  day: 'Ngày',
};
// Hệ số quy về GIÂY (gốc chung để quy đổi giữa các đơn vị).
const UNIT_SEC: Record<Unit, number> = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
};

const props = withDefaults(
  defineProps<{
    modelValue: number;        // giá trị theo baseUnit (BE cần)
    baseUnit: Unit;            // đơn vị backend lưu: 'second' | 'minute' | 'day'...
    units?: Unit[];            // các đơn vị cho phép chọn (mặc định đủ 4)
  }>(),
  { units: () => ['second', 'minute', 'hour', 'day'] },
);
const emit = defineEmits<{ (e: 'update:modelValue', v: number): void }>();

const allowedUnits = props.units;
const displayUnit = ref<Unit>(props.baseUnit);
const displayValue = ref<number>(0);

// Quy giá trị baseUnit → giây.
function toSeconds(valBase: number): number {
  return valBase * UNIT_SEC[props.baseUnit];
}
// Quy giây → baseUnit (để emit cho BE).
function fromSecondsToBase(sec: number): number {
  // Làm tròn về baseUnit. delay phút → số nguyên phút; recency ngày → số nguyên ngày.
  return Math.round(sec / UNIT_SEC[props.baseUnit]);
}

// Auto chọn đơn vị "đẹp nhất" cho 1 lượng giây (Anh chốt: <60ph→phút, <24h→giờ...).
function autoUnit(sec: number): Unit {
  if (sec <= 0) return props.baseUnit;
  if (allowedUnits.includes('day') && sec % 86400 === 0 && sec >= 86400) return 'day';
  if (allowedUnits.includes('hour') && sec % 3600 === 0 && sec >= 3600) return 'hour';
  if (allowedUnits.includes('day') && sec >= 86400) return 'day';
  if (allowedUnits.includes('hour') && sec >= 3600) return 'hour';
  if (allowedUnits.includes('minute') && sec >= 60) return 'minute';
  if (allowedUnits.includes('second')) return 'second';
  return props.baseUnit;
}

// Khởi tạo + đồng bộ khi modelValue đổi từ ngoài.
function syncFromModel(): void {
  const sec = toSeconds(props.modelValue ?? 0);
  const u = autoUnit(sec);
  displayUnit.value = u;
  displayValue.value = Math.round((sec / UNIT_SEC[u]) * 100) / 100; // 1.5 giờ giữ 1 chữ số thập phân
}
syncFromModel();
watch(() => props.modelValue, syncFromModel);

function emitBase(): void {
  const sec = displayValue.value * UNIT_SEC[displayUnit.value];
  emit('update:modelValue', fromSecondsToBase(sec));
}

function onNumInput(e: Event): void {
  const raw = Number((e.target as HTMLInputElement).value);
  displayValue.value = Number.isFinite(raw) && raw >= 0 ? raw : 0;
  emitBase();
}

function onUnitChange(e: Event): void {
  // Đổi đơn vị: giữ NGUYÊN lượng thời gian thực, chỉ đổi cách hiển thị.
  const prevSec = displayValue.value * UNIT_SEC[displayUnit.value];
  displayUnit.value = (e.target as HTMLSelectElement).value as Unit;
  displayValue.value = Math.round((prevSec / UNIT_SEC[displayUnit.value]) * 100) / 100;
  emitBase();
}
</script>

<style scoped>
.time-amount { display: inline-flex; align-items: center; gap: 6px; }
.ta-num {
  width: 80px; padding: 6px 8px; border: 1px solid var(--border, #d7dce3);
  border-radius: 6px; font-size: 13px; text-align: right;
}
.ta-unit {
  padding: 6px 8px; border: 1px solid var(--border, #d7dce3);
  border-radius: 6px; font-size: 13px; background: #fff; cursor: pointer;
}
.ta-num:focus, .ta-unit:focus { outline: none; border-color: var(--primary, #2563eb); }
</style>
