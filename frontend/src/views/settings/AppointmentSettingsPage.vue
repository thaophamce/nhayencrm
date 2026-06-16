<!--
  AppointmentSettingsPage — Cài đặt "Lịch hẹn → Nhắc hẹn Zalo" (2026-06-16).
  Bật/tắt tính năng + chỉnh số phút sau giờ hẹn mới gửi link đánh dấu Hoàn thành/Huỷ.
  GET/PUT /api/v1/appointments/settings (PUT cần owner/admin).
-->
<template>
  <div class="ap-settings">
    <header class="ap-head">
      <div class="ap-ico">📅</div>
      <div>
        <h1 class="ap-h1">Lịch hẹn &amp; Nhắc hẹn Zalo</h1>
        <p class="ap-sub">
          Khi tạo lịch hẹn: gửi thông báo về nick nhận của sale <b>và</b> tạo nhắc hẹn trên Zalo.
          Sau giờ hẹn một khoảng, hệ thống gửi 1 tin kèm link để sale bấm đánh dấu Hoàn thành / Huỷ.
        </p>
      </div>
    </header>

    <div v-if="loading" class="ap-loading">Đang tải cài đặt…</div>

    <template v-else>
      <!-- Cảnh báo: chưa cấu hình nick thông báo hệ thống -->
      <div v-if="!hasSystemNotifyNick" class="ap-warn">
        <v-icon size="18" color="#b45309">mdi-alert-outline</v-icon>
        <div>
          Chưa cấu hình <b>nick thông báo hệ thống</b> — tính năng này cần nick đó để gửi tin nhắn &amp; nhắc hẹn.
          <RouterLink to="/settings/org/system-notifications" class="ap-link">Cấu hình ngay →</RouterLink>
        </div>
      </div>

      <!-- Toggle bật/tắt -->
      <section class="ap-card">
        <div class="ap-row">
          <div class="ap-row-text">
            <div class="ap-row-title">Bật nhắc hẹn qua Zalo</div>
            <div class="ap-row-desc">Tự tạo nhắc hẹn Zalo + gửi tin thông báo cho sale mỗi khi có lịch hẹn mới.</div>
          </div>
          <v-switch
            v-model="form.enabled"
            color="primary"
            hide-details
            density="comfortable"
            :disabled="!canEdit"
          />
        </div>
      </section>

      <!-- Delay phút -->
      <section class="ap-card" :class="{ 'ap-disabled': !form.enabled }">
        <div class="ap-row-text" style="margin-bottom: 12px">
          <div class="ap-row-title">Gửi link đánh dấu sau giờ hẹn</div>
          <div class="ap-row-desc">
            Bao nhiêu phút sau thời điểm hẹn thì gửi tin kèm link để sale xác nhận Hoàn thành / Huỷ.
            Đặt <b>0</b> để gửi ngay tại giờ hẹn.
          </div>
        </div>
        <div class="ap-delay">
          <v-text-field
            v-model.number="form.actionDelayMinutes"
            type="number"
            :min="0"
            :max="1440"
            suffix="phút"
            density="compact"
            variant="outlined"
            hide-details
            style="max-width: 180px"
            :disabled="!form.enabled || !canEdit"
          />
          <div class="ap-quick">
            <button
              v-for="q in QUICK_MINUTES"
              :key="q"
              type="button"
              class="ap-chip"
              :class="{ active: form.actionDelayMinutes === q }"
              :disabled="!form.enabled || !canEdit"
              @click="form.actionDelayMinutes = q"
            >{{ q === 0 ? 'Ngay' : `${q}p` }}</button>
          </div>
        </div>
        <p class="ap-hint">Khoảng cho phép: 0–1440 phút (tối đa 24 giờ).</p>
      </section>

      <div class="ap-actions">
        <span v-if="!canEdit" class="ap-noperm">Chỉ chủ tổ chức / quản trị mới chỉnh được.</span>
        <v-btn
          color="primary"
          :loading="saving"
          :disabled="!canEdit || !dirty"
          @click="save"
        >Lưu cài đặt</v-btn>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { api } from '@/api';
import { useToast } from '@/composables/use-toast';
import { useAuthStore } from '@/stores/auth';

const toast = useToast();
const auth = useAuthStore();

const QUICK_MINUTES = [0, 15, 30, 60];

const loading = ref(true);
const saving = ref(false);
const hasSystemNotifyNick = ref(true);

const form = reactive<{ enabled: boolean; actionDelayMinutes: number }>({
  enabled: false,
  actionDelayMinutes: 15,
});
const saved = reactive<{ enabled: boolean; actionDelayMinutes: number }>({
  enabled: false,
  actionDelayMinutes: 15,
});

const canEdit = computed(() => ['owner', 'admin'].includes(auth.user?.role ?? ''));
const dirty = computed(
  () => form.enabled !== saved.enabled || Number(form.actionDelayMinutes) !== saved.actionDelayMinutes,
);

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/appointments/settings');
    form.enabled = saved.enabled = !!data.enabled;
    form.actionDelayMinutes = saved.actionDelayMinutes = Number(data.actionDelayMinutes ?? 15);
    hasSystemNotifyNick.value = !!data.hasSystemNotifyNick;
  } catch {
    toast.error('Không tải được cài đặt lịch hẹn');
  } finally {
    loading.value = false;
  }
}

async function save() {
  const v = Number(form.actionDelayMinutes);
  if (!Number.isFinite(v) || v < 0 || v > 1440) {
    toast.error('Số phút phải từ 0 đến 1440');
    return;
  }
  saving.value = true;
  try {
    const { data } = await api.put('/appointments/settings', {
      enabled: form.enabled,
      actionDelayMinutes: Math.round(v),
    });
    form.enabled = saved.enabled = !!data.enabled;
    form.actionDelayMinutes = saved.actionDelayMinutes = Number(data.actionDelayMinutes);
    toast.success('Đã lưu cài đặt lịch hẹn');
  } catch {
    toast.error('Lưu cài đặt thất bại');
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.ap-settings { max-width: 720px; font-family: 'Inter', -apple-system, sans-serif; color: #1F2D3D; }
.ap-head { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 20px; }
.ap-ico { width: 44px; height: 44px; border-radius: 12px; background: #EEF0FF; display: grid; place-items: center; font-size: 22px; flex: none; }
.ap-h1 { font-size: 19px; font-weight: 700; margin: 0 0 4px; }
.ap-sub { font-size: 13px; color: #6B7785; margin: 0; line-height: 1.55; }
.ap-loading { padding: 28px; text-align: center; color: #97A0AC; }

.ap-warn { display: flex; gap: 10px; align-items: flex-start; background: #FFFBEB; border: 1px solid #FDE68A;
  color: #92400E; border-radius: 10px; padding: 12px 14px; font-size: 13px; line-height: 1.5; margin-bottom: 18px; }
.ap-link { color: #5E6AD2; font-weight: 600; text-decoration: none; white-space: nowrap; }
.ap-link:hover { text-decoration: underline; }

.ap-card { background: #fff; border: 1px solid #E4E5E9; border-radius: 12px; padding: 18px 20px; margin-bottom: 14px; }
.ap-card.ap-disabled { opacity: 0.6; }
.ap-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.ap-row-title { font-size: 14.5px; font-weight: 600; margin-bottom: 3px; }
.ap-row-desc { font-size: 12.5px; color: #6B7785; line-height: 1.5; }

.ap-delay { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.ap-quick { display: flex; gap: 6px; }
.ap-chip { border: 1px solid #D4D6DB; background: #fff; border-radius: 999px; padding: 5px 13px; font-size: 12.5px;
  font-weight: 600; color: #475066; cursor: pointer; font-family: inherit; transition: all .12s; }
.ap-chip:hover:not(:disabled) { border-color: #5E6AD2; color: #5E6AD2; }
.ap-chip.active { background: #EEF0FF; border-color: #5E6AD2; color: #5E6AD2; }
.ap-chip:disabled { opacity: .5; cursor: default; }
.ap-hint { font-size: 12px; color: #97A0AC; margin: 10px 0 0; }

.ap-actions { display: flex; align-items: center; justify-content: flex-end; gap: 14px; margin-top: 8px; }
.ap-noperm { font-size: 12.5px; color: #97A0AC; }
</style>
