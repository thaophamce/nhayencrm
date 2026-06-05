<template>
  <div class="system-notify-page airtable-scope">
    <!-- 2026-06-04 (Anh chốt) — redesign Atlas v2: topbar + 4 tab ngang. -->
    <div class="sn-topbar">
      <div class="sn-topbar-title">
        <div class="sn-ico">🔔</div>
        <div>
          <div class="sn-h1">Thông báo hệ thống</div>
          <div class="sn-sub">Nick tổ chức tự gửi thông báo nội bộ cho nhân viên · tin chào mừng khi tạo tài khoản</div>
        </div>
      </div>
      <v-btn variant="outlined" size="small" prepend-icon="mdi-refresh" :loading="loadingRecipients || loadingLogs" @click="refreshAll">
        Làm mới
      </v-btn>
    </div>

    <v-tabs v-model="activeTab" class="sn-tabs" color="primary" density="comfortable">
      <v-tab value="config">⚙️ Cấu hình gửi</v-tab>
      <v-tab value="welcome">📨 Tin chào mừng</v-tab>
      <v-tab value="people">
        👥 Nhân viên nhận
        <span class="sn-tab-cnt">{{ recipients.length }}</span>
      </v-tab>
      <v-tab value="logs">
        📜 Lịch sử gửi
        <span class="sn-tab-cnt">{{ logTotal }}</span>
      </v-tab>
    </v-tabs>

    <v-window v-model="activeTab" class="sn-window">
      <!-- ════ TAB 1: CẤU HÌNH GỬI ════ -->
      <v-window-item value="config">
    <v-card variant="outlined" class="pa-4 mb-4 notify-card">
      <div class="d-flex flex-wrap align-start ga-4">
        <v-select
          v-model="senderId"
          :items="senderOptions"
          item-title="label"
          item-value="value"
          label="Nick Zalo gửi thông báo hệ thống"
          variant="outlined"
          density="comfortable"
          clearable
          hide-details="auto"
          :loading="loadingSettings || savingSender"
          class="sender-select"
          @update:model-value="saveSender"
        />
        <v-chip v-if="selectedSender" :color="selectedSender.status === 'connected' ? 'success' : 'warning'" variant="tonal" class="mt-2">
          {{ selectedSender.status === 'connected' ? 'Đang connected' : 'Offline' }}
        </v-chip>
        <v-chip v-else color="grey" variant="tonal" class="mt-2">Chưa chọn nick gửi</v-chip>
      </div>
      <div class="text-caption text-medium-emphasis mt-3">
        Khi đổi nick gửi, bảng "Nhân viên nhận" sẽ kiểm tra mapping UID riêng cho nick mới. UID cũ của nick khác không dùng chung.
      </div>
      <v-alert v-if="senderError" type="error" density="compact" class="mt-3">{{ senderError }}</v-alert>
    </v-card>

    <!-- KPI tình trạng kênh -->
    <div class="sn-kpi-grid">
      <div class="sn-kpi green"><div class="sn-kpi-val">{{ summary.ready || 0 }}</div><div class="sn-kpi-lbl">✅ Sẵn sàng nhận</div></div>
      <div class="sn-kpi amber"><div class="sn-kpi-val">{{ (summary.uid_not_found || 0) + (summary.missing_internal_phone || 0) }}</div><div class="sn-kpi-lbl">🟡 Chưa có UID</div></div>
      <div class="sn-kpi red"><div class="sn-kpi-val">{{ (summary.missing_internal_contact || 0) + (summary.lookup_failed || 0) + (summary.sender_disconnected || 0) }}</div><div class="sn-kpi-lbl">🔴 Thiếu nick / lỗi</div></div>
      <div class="sn-kpi"><div class="sn-kpi-val">{{ recipients.length }}</div><div class="sn-kpi-lbl">Tổng nhân viên</div></div>
    </div>
      </v-window-item>

      <!-- ════ TAB 2: TIN CHÀO MỪNG ════ -->
      <v-window-item value="welcome">
    <!-- Org config: welcome template + image + admin fallback phone (Phase user-create-with-zalo 2026-05-27) -->
    <v-card variant="outlined" class="pa-4 mb-4 notify-card">
      <div class="d-flex align-center justify-space-between mb-3 flex-wrap ga-2">
        <div>
          <div class="text-subtitle-1 font-weight-bold">📨 Tin chào mừng khi tạo user mới</div>
          <div class="text-caption text-medium-emphasis">
            Khi admin tạo sale mới + check SĐT Zalo OK, hệ thống tự gửi tin login này cho sale. Anh sửa text + ảnh + SĐT admin fallback tuỳ ý.
          </div>
        </div>
        <div class="d-flex ga-2">
          <v-btn size="small" variant="tonal" @click="showPlaceholders = true">📋 Placeholders</v-btn>
          <v-btn size="small" variant="tonal" color="primary" :loading="previewLoading" @click="openPreview">👁 Preview</v-btn>
          <v-btn size="small" variant="text" @click="resetTemplate">↻ Reset mặc định</v-btn>
        </div>
      </div>

      <v-textarea
        v-model="welcomeTemplate"
        label="Template tin chào mừng (markdown: **bold**, {red}text{/red}, # h1, - bullet, > quote)"
        variant="outlined"
        density="comfortable"
        rows="14"
        auto-grow
        hide-details="auto"
        placeholder="Ô trống = dùng template mặc định em thiết kế"
        class="mb-3 template-textarea"
      />

      <div class="d-flex flex-wrap align-start ga-4 mb-2">
        <div class="welcome-image-block">
          <div class="text-caption text-medium-emphasis mb-1">Ảnh welcome (gửi kèm tin login)</div>
          <div class="welcome-image-preview">
            <img v-if="welcomeImageUrl" :src="welcomeImageUrl" alt="Welcome" />
            <div v-else class="text-caption text-disabled pa-3">Chưa upload ảnh</div>
          </div>
          <input ref="imageFileInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="d-none" @change="onImagePicked" />
          <div class="d-flex ga-2 mt-2">
            <v-btn size="small" variant="tonal" :loading="imageUploading" @click="imageFileInput?.click()">⬆ Chọn ảnh</v-btn>
            <v-btn v-if="welcomeImageUrl" size="small" variant="text" color="error" @click="clearImage">🗑 Xoá</v-btn>
          </div>
        </div>

        <v-text-field
          v-model="adminFallbackPhone"
          label="SĐT admin nhận tin lỗi (khi gửi sale fail → admin chuyển thủ công)"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
          placeholder="VD: 0908278807"
          class="admin-phone-field"
        />
      </div>

      <div class="d-flex justify-end ga-2">
        <v-btn variant="text" @click="discardOrgConfigChanges">Huỷ</v-btn>
        <v-btn
          color="primary"
          :loading="savingOrgConfig"
          :disabled="!orgConfigDirty"
          @click="saveOrgConfig"
        >
          Lưu cấu hình
        </v-btn>
      </div>
      <v-alert v-if="orgConfigError" type="error" density="compact" class="mt-2">{{ orgConfigError }}</v-alert>
      <v-alert v-if="orgConfigSuccess" type="success" density="compact" class="mt-2">{{ orgConfigSuccess }}</v-alert>
    </v-card>
      </v-window-item>

      <!-- ════ TAB 3: NHÂN VIÊN NHẬN ════ -->
      <v-window-item value="people">
    <!-- KPI -->
    <div class="sn-kpi-grid">
      <div class="sn-kpi green"><div class="sn-kpi-val">{{ summary.ready || 0 }}</div><div class="sn-kpi-lbl">✅ Đã có UID</div></div>
      <div class="sn-kpi amber"><div class="sn-kpi-val">{{ (summary.uid_not_found || 0) + (summary.missing_internal_phone || 0) }}</div><div class="sn-kpi-lbl">🟡 Chưa có UID</div></div>
      <div class="sn-kpi red"><div class="sn-kpi-val">{{ (summary.missing_internal_contact || 0) + (summary.lookup_failed || 0) + (summary.sender_disconnected || 0) }}</div><div class="sn-kpi-lbl">🔴 Lỗi / thiếu nick</div></div>
      <div class="sn-kpi"><div class="sn-kpi-val">{{ recipients.length }}</div><div class="sn-kpi-lbl">Tổng nhân viên</div></div>
    </div>

    <v-alert v-if="lookupError" type="error" density="compact" class="mb-3">{{ lookupError }}</v-alert>
    <v-alert v-if="lookupSuccess" type="success" density="compact" class="mb-3">{{ lookupSuccess }}</v-alert>

    <!-- Placeholder helper modal -->
    <v-dialog v-model="showPlaceholders" max-width="560">
      <v-card>
        <v-card-title>📋 Placeholders dùng trong template</v-card-title>
        <v-card-text>
          <v-list density="compact">
            <v-list-item v-for="p in PLACEHOLDER_HELP" :key="p.key">
              <template #title>
                <code v-text="placeholderLabel(p.key)"></code>
              </template>
              <template #subtitle>{{ p.desc }}</template>
            </v-list-item>
          </v-list>
          <v-divider class="my-2" />
          <div class="text-caption">
            Markup: <code>**bold**</code> · <code>*italic*</code> · <code>~~strike~~</code> ·
            <code>{red|orange|yellow|green}text{/tag}</code> · <code>{big}lớn{/big}</code> ·
            <code># Tiêu đề</code> · <code>- bullet</code> · <code>&gt; trích dẫn</code>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showPlaceholders = false">Đóng</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Preview modal -->
    <v-dialog v-model="showPreview" max-width="560">
      <v-card>
        <v-card-title class="d-flex align-center justify-space-between">
          <span>👁 Preview tin chào mừng</span>
          <v-btn-toggle v-model="previewVariant" mandatory density="comfortable" size="small">
            <v-btn value="friend">Đã kết bạn</v-btn>
            <v-btn value="stranger">Chưa kết bạn</v-btn>
          </v-btn-toggle>
        </v-card-title>
        <v-card-text>
          <div class="text-caption text-medium-emphasis mb-2">Render với data giả (Nguyễn Văn A, 0931...)</div>
          <pre class="preview-pane">{{ previewText }}</pre>
          <div v-if="previewStyles.length" class="text-caption mt-2">
            <strong>{{ previewStyles.length }} style ranges</strong> · Zalo render thực sẽ có bold/màu/size đúng vị trí.
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showPreview = false">Đóng</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-card variant="outlined" class="notify-card">
      <v-table density="comfortable" class="recipient-table">
        <thead>
          <tr>
            <th>Nhân viên</th>
            <th>Phòng ban</th>
            <th>Chức vụ</th>
            <th>Nick liên lạc nội bộ</th>
            <th>UID góc nhìn nick gửi</th>
            <th>Trạng thái</th>
            <th class="text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in recipients" :key="row.user.id">
            <td>
              <div class="font-weight-medium">{{ row.user.fullName }}</div>
              <div class="text-caption text-medium-emphasis">{{ row.user.email }}</div>
            </td>
            <td>{{ row.user.departmentMember?.department?.name || 'Chưa gán' }}</td>
            <td>
              <div>{{ row.user.departmentMember?.deptRole || roleLabel(row.user.role) }}</div>
              <div v-if="row.user.permissionGroup?.name" class="text-caption text-medium-emphasis">
                {{ row.user.permissionGroup.name }}
              </div>
            </td>
            <td>
              <div class="font-weight-medium">{{ row.internalContactNick?.displayName || 'Chưa chọn' }}</div>
              <div class="text-caption text-medium-emphasis">
                {{ row.internalContactNick?.phone || 'Chưa có SĐT' }}
              </div>
            </td>
            <td>
              <span v-if="row.recipient.threadIdInSenderView" class="uid-text">{{ row.recipient.threadIdInSenderView }}</span>
              <span v-else class="text-medium-emphasis">Chưa có</span>
            </td>
            <td>
              <v-chip size="small" :color="statusColor(row.recipient.status)" variant="tonal">
                {{ statusLabel(row.recipient.status) }}
              </v-chip>
              <div v-if="row.recipient.error" class="text-caption text-medium-emphasis mt-1">
                {{ row.recipient.error }}
              </div>
            </td>
            <td class="text-right">
              <v-btn
                size="small"
                variant="tonal"
                :loading="lookupUserId === row.user.id"
                :disabled="!canLookup(row)"
                @click="lookupUid(row)"
              >
                Tìm UID
              </v-btn>
            </td>
          </tr>
          <tr v-if="!loadingRecipients && recipients.length === 0">
            <td colspan="7" class="text-center text-medium-emphasis py-6">Chưa có nhân viên để kiểm tra.</td>
          </tr>
          <tr v-if="loadingRecipients">
            <td colspan="7" class="text-center text-medium-emphasis py-6">Đang tải danh sách...</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>
      </v-window-item>

      <!-- ════ TAB 4: LỊCH SỬ GỬI (2026-06-04 Anh chốt) ════
           Log: gửi gì, cho ai, thành công/thất bại, đã nhận/đã xem, lọc theo loại. -->
      <v-window-item value="logs">
    <!-- Thống kê đếm — KPI tile -->
    <div class="sn-kpi-grid">
      <div class="sn-kpi green"><div class="sn-kpi-val">{{ logStatusCounts.sent || 0 }}</div><div class="sn-kpi-lbl">✅ Đã gửi</div></div>
      <div class="sn-kpi red"><div class="sn-kpi-val">{{ logStatusCounts.failed || 0 }}</div><div class="sn-kpi-lbl">❌ Thất bại</div></div>
      <div class="sn-kpi amber"><div class="sn-kpi-val">{{ logStatusCounts.pending || 0 }}</div><div class="sn-kpi-lbl">⏳ Đang chờ</div></div>
      <div class="sn-kpi"><div class="sn-kpi-val">{{ logTotal }}</div><div class="sn-kpi-lbl">Tổng tin</div></div>
    </div>

    <!-- Bộ lọc -->
    <v-card variant="outlined" class="pa-3 mb-3 notify-card">
      <div class="d-flex flex-wrap ga-3 align-center">
        <v-select
          v-model="logFilterType"
          :items="typeFilterOptions"
          item-title="label"
          item-value="value"
          label="Loại tin"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          style="max-width: 220px"
          @update:model-value="onLogFilterChange"
        />
        <v-select
          v-model="logFilterStatus"
          :items="statusFilterOptions"
          item-title="label"
          item-value="value"
          label="Trạng thái"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          style="max-width: 180px"
          @update:model-value="onLogFilterChange"
        />
        <v-select
          v-model="logFilterChannel"
          :items="channelFilterOptions"
          item-title="label"
          item-value="value"
          label="Kênh"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          style="max-width: 160px"
          @update:model-value="onLogFilterChange"
        />
        <v-text-field
          v-model="logFilterFrom"
          type="date"
          label="Từ ngày"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width: 170px"
          @update:model-value="onLogFilterChange"
        />
        <v-text-field
          v-model="logFilterTo"
          type="date"
          label="Đến ngày"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width: 170px"
          @update:model-value="onLogFilterChange"
        />
        <v-btn v-if="hasLogFilter" size="small" variant="text" @click="clearLogFilter">Xoá lọc</v-btn>
      </div>
    </v-card>

    <v-card variant="outlined" class="notify-card">
      <v-table density="comfortable" class="recipient-table log-table">
        <thead>
          <tr>
            <th style="width: 150px">Thời gian</th>
            <th style="width: 160px">Loại tin</th>
            <th>Người nhận</th>
            <th>Nội dung</th>
            <th style="width: 120px">Kênh</th>
            <th style="width: 150px">Trạng thái</th>
            <th style="width: 130px">Đã nhận/xem</th>
            <th class="text-right" style="width: 90px">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="log in logs"
            :key="log.id"
            class="log-row"
            style="cursor: pointer"
            @click="openLogDetail(log)"
          >
            <td>
              <div class="text-body-2">{{ fmtDateTime(log.createdAt) }}</div>
            </td>
            <td>
              <v-chip size="x-small" :color="typeColor(log.type)" variant="tonal">
                {{ typeIcon(log.type) }} {{ typeLabel(log.type) }}
              </v-chip>
            </td>
            <td>
              <div class="font-weight-medium">{{ log.targetUser?.fullName || '—' }}</div>
              <div class="text-caption text-medium-emphasis">{{ log.targetUser?.email || '' }}</div>
            </td>
            <td>
              <div class="text-body-2 log-content-preview">{{ logTitleLine(log) }}</div>
            </td>
            <td>
              <v-chip size="x-small" :color="log.channel === 'zalo' ? 'primary' : 'grey'" variant="tonal">
                {{ log.channel === 'zalo' ? 'Zalo' : 'CRM' }}
              </v-chip>
            </td>
            <td>
              <v-chip size="small" :color="logStatusColor(log.status)" variant="tonal">
                {{ logStatusLabel(log.status) }}
              </v-chip>
            </td>
            <td>
              <span :title="readReceiptTitle(log)">{{ readReceiptLabel(log) }}</span>
            </td>
            <td class="text-right" @click.stop>
              <v-btn
                v-if="log.status === 'failed'"
                size="x-small"
                variant="tonal"
                color="primary"
                :loading="retryingId === log.id"
                @click="retryLog(log)"
              >
                Gửi lại
              </v-btn>
              <span v-else class="text-medium-emphasis text-caption">—</span>
            </td>
          </tr>
          <tr v-if="!loadingLogs && logs.length === 0">
            <td colspan="8" class="text-center text-medium-emphasis py-6">Chưa có thông báo nào khớp bộ lọc.</td>
          </tr>
          <tr v-if="loadingLogs">
            <td colspan="8" class="text-center text-medium-emphasis py-6">Đang tải lịch sử...</td>
          </tr>
        </tbody>
      </v-table>
      <div v-if="logTotal > logs.length" class="text-center py-3">
        <v-btn variant="text" :loading="loadingLogs" @click="loadMoreLogs">Tải thêm ({{ logs.length }}/{{ logTotal }})</v-btn>
      </div>
    </v-card>
      </v-window-item>
    </v-window>

    <!-- Panel chi tiết tin -->
    <v-dialog v-model="showLogDetail" max-width="560">
      <v-card v-if="detailLog" class="pa-1">
        <v-card-title class="d-flex align-center ga-2">
          <v-chip size="small" :color="typeColor(detailLog.type)" variant="tonal">
            {{ typeIcon(detailLog.type) }} {{ typeLabel(detailLog.type) }}
          </v-chip>
          <v-chip size="small" :color="logStatusColor(detailLog.status)" variant="tonal">
            {{ logStatusLabel(detailLog.status) }}
          </v-chip>
        </v-card-title>
        <v-card-text>
          <div class="detail-row"><span class="detail-k">Người nhận</span><span>{{ detailLog.targetUser?.fullName }} ({{ detailLog.targetUser?.email }})</span></div>
          <div class="detail-row"><span class="detail-k">Nick gửi</span><span>{{ detailLog.senderNick?.displayName || 'CRM (không gửi Zalo)' }}</span></div>
          <div class="detail-row"><span class="detail-k">Kênh</span><span>{{ detailLog.channel === 'zalo' ? 'Zalo' : 'CRM panel' }}</span></div>
          <div class="detail-row"><span class="detail-k">Tạo lúc</span><span>{{ fmtDateTime(detailLog.createdAt) }}</span></div>
          <div class="detail-row"><span class="detail-k">Gửi lúc</span><span>{{ detailLog.sentAt ? fmtDateTime(detailLog.sentAt) : '—' }}</span></div>
          <div class="detail-row"><span class="detail-k">Đã nhận/xem</span><span>{{ readReceiptLabel(detailLog) }} <span class="text-caption text-medium-emphasis">{{ readReceiptTitle(detailLog) }}</span></span></div>
          <div v-if="detailLog.error" class="detail-row"><span class="detail-k">Lỗi</span><span class="text-error">{{ detailLog.error }}</span></div>
          <v-divider class="my-3" />
          <div class="text-caption text-medium-emphasis mb-1">Nội dung tin</div>
          <pre class="detail-content">{{ detailLog.content }}</pre>
        </v-card-text>
        <v-card-actions>
          <v-btn
            v-if="detailLog.conversationId"
            variant="text"
            prepend-icon="mdi-chat"
            @click="goToConversation(detailLog)"
          >
            Mở hội thoại
          </v-btn>
          <v-spacer />
          <v-btn
            v-if="detailLog.status === 'failed'"
            color="primary"
            variant="tonal"
            :loading="retryingId === detailLog.id"
            @click="retryLog(detailLog)"
          >
            Gửi lại
          </v-btn>
          <v-btn variant="text" @click="showLogDetail = false">Đóng</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '@/api/index';

interface SenderNick {
  id: string;
  displayName: string | null;
  avatarUrl?: string | null;
  zaloUid?: string | null;
  phone?: string | null;
  status: string;
}

interface RecipientRow {
  user: {
    id: string;
    fullName: string;
    email: string;
    role: string;
    departmentMember: { deptRole: string | null; department: { id: string; name: string; path: string } | null } | null;
    permissionGroup: { id: string; name: string; isSystem: boolean } | null;
  };
  internalContactNick: { id: string; displayName: string | null; avatarUrl?: string | null; phone?: string | null; status: string } | null;
  recipient: {
    id: string;
    status: string;
    error: string | null;
    conversationId: string | null;
    threadIdInSenderView: string | null;
    lastVerifiedAt: string;
  };
}

// 2026-06-04 — Atlas v2 redesign: tab ngang.
const activeTab = ref<'config' | 'welcome' | 'people' | 'logs'>('config');

const loadingSettings = ref(false);
const loadingRecipients = ref(false);
const savingSender = ref(false);
const senderError = ref('');
const lookupError = ref('');
const lookupSuccess = ref('');
const senderId = ref<string | null>(null);
const nicks = ref<SenderNick[]>([]);
const recipients = ref<RecipientRow[]>([]);
const summary = ref<Record<string, number>>({});
const lookupUserId = ref<string | null>(null);

// ── Org config: welcome template + image + admin fallback phone ──
const welcomeTemplate = ref<string>('');
const welcomeImageUrl = ref<string | null>(null);
const adminFallbackPhone = ref<string>('');
const defaultTemplate = ref<string>('');
const savedSnapshot = ref<{ template: string; image: string | null; phone: string }>({ template: '', image: null, phone: '' });
const savingOrgConfig = ref(false);
const orgConfigError = ref('');
const orgConfigSuccess = ref('');
const imageUploading = ref(false);
const imageFileInput = ref<HTMLInputElement | null>(null);

const showPlaceholders = ref(false);
const showPreview = ref(false);
const previewLoading = ref(false);
const previewVariant = ref<'friend' | 'stranger'>('stranger');
const previewText = ref('');
const previewStyles = ref<Array<{ offset: number; length: number; style: string; color?: string }>>([]);

function placeholderLabel(key: string): string {
  return '{{' + key + '}}';
}

const PLACEHOLDER_HELP = [
  { key: 'fullName', desc: 'Họ tên sale' },
  { key: 'email', desc: 'Email (nếu có)' },
  { key: 'phone', desc: 'SĐT đăng nhập' },
  { key: 'password', desc: 'Mật khẩu tạm tự sinh' },
  { key: 'loginUrl', desc: 'Link CRM (ENV CRM_LOGIN_URL)' },
  { key: 'orgName', desc: 'Tên tổ chức' },
  { key: 'departmentName', desc: 'Phòng ban (rỗng → dòng biến mất)' },
  { key: 'roleName', desc: 'Chức vụ' },
  { key: 'adminPhone', desc: 'SĐT admin fallback (ô bên cạnh)' },
  { key: 'strangerNotice', desc: 'Auto-fill nhắc kết bạn nếu sale chưa friend' },
];

const orgConfigDirty = computed(() =>
  welcomeTemplate.value !== savedSnapshot.value.template ||
  welcomeImageUrl.value !== savedSnapshot.value.image ||
  adminFallbackPhone.value !== savedSnapshot.value.phone,
);

const senderOptions = computed(() => nicks.value.map((nick) => ({
  value: nick.id,
  label: `${nick.displayName || 'Nick chưa đặt tên'}${nick.status === 'connected' ? '' : ' (offline)'}`,
})));

const selectedSender = computed(() => nicks.value.find((nick) => nick.id === senderId.value) || null);

async function fetchSettings() {
  loadingSettings.value = true;
  senderError.value = '';
  try {
    const { data } = await api.get('/system-notifications/settings');
    senderId.value = data.systemNotifyZaloAccountId ?? null;
    nicks.value = data.nicks || [];
  } catch (err: any) {
    senderError.value = err?.response?.data?.error || 'Lỗi tải cấu hình thông báo hệ thống';
  } finally {
    loadingSettings.value = false;
  }
}

async function fetchRecipients() {
  loadingRecipients.value = true;
  try {
    const { data } = await api.get('/system-notifications/recipients');
    recipients.value = data.recipients || [];
    summary.value = data.summary || {};
  } finally {
    loadingRecipients.value = false;
  }
}

async function saveSender(value: unknown) {
  savingSender.value = true;
  senderError.value = '';
  lookupError.value = '';
  lookupSuccess.value = '';
  try {
    await api.patch('/system-notifications/settings/sender', { zaloAccountId: value || null });
    await fetchRecipients();
  } catch (err: any) {
    senderError.value = err?.response?.data?.error || 'Lỗi lưu nick gửi thông báo hệ thống';
  } finally {
    savingSender.value = false;
  }
}

function canLookup(row: RecipientRow) {
  return Boolean(senderId.value && row.internalContactNick?.id && row.internalContactNick?.phone && lookupUserId.value !== row.user.id);
}

async function lookupUid(row: RecipientRow) {
  lookupUserId.value = row.user.id;
  lookupError.value = '';
  lookupSuccess.value = '';
  try {
    const { data } = await api.post(`/system-notifications/recipients/${row.user.id}/lookup-uid`);
    const recipient = data.recipient;
    if (recipient) {
      row.recipient = {
        id: recipient.id,
        status: recipient.status,
        error: recipient.error,
        conversationId: recipient.conversationId,
        threadIdInSenderView: recipient.threadIdInSenderView,
        lastVerifiedAt: recipient.lastVerifiedAt,
      };
    }
    lookupSuccess.value = data.found ? `Đã lưu UID cho ${row.user.fullName}` : `Chưa tìm thấy UID cho ${row.user.fullName}`;
    await fetchRecipients();
  } catch (err: any) {
    lookupError.value = err?.response?.data?.error || 'Lỗi tìm UID';
    await fetchRecipients();
  } finally {
    lookupUserId.value = null;
  }
}

function statusColor(status: string) {
  if (status === 'ready') return 'success';
  if (status === 'uid_not_found' || status === 'missing_internal_phone' || status === 'missing_internal_contact') return 'warning';
  if (status === 'sender_disconnected' || status === 'missing_system_sender' || status === 'lookup_failed') return 'error';
  return 'grey';
}

function statusLabel(status: string) {
  return ({
    ready: 'Đã có UID',
    missing_system_sender: 'Chưa chọn nick gửi',
    missing_internal_contact: 'Chưa chọn nick nội bộ',
    missing_internal_phone: 'Nick nội bộ thiếu SĐT',
    sender_disconnected: 'Nick gửi offline',
    uid_not_found: 'Chưa có UID',
    lookup_failed: 'Lỗi tìm UID',
    invalid: 'Invalid',
  } as Record<string, string>)[status] || status;
}

function roleLabel(role: string) {
  return ({ owner: 'Chủ tổ chức', admin: 'Admin', member: 'Nhân viên' } as Record<string, string>)[role] || role;
}

async function fetchOrgConfig() {
  try {
    const { data } = await api.get('/system-notifications/org-config');
    welcomeTemplate.value = data.welcomeMessageTemplate ?? '';
    welcomeImageUrl.value = data.welcomeImageUrl ?? null;
    adminFallbackPhone.value = data.adminFallbackPhone ?? '';
    defaultTemplate.value = data.defaultTemplate ?? '';
    savedSnapshot.value = {
      template: welcomeTemplate.value,
      image: welcomeImageUrl.value,
      phone: adminFallbackPhone.value,
    };
  } catch (err: any) {
    orgConfigError.value = err?.response?.data?.error || 'Lỗi tải cấu hình tin chào mừng';
  }
}

async function saveOrgConfig() {
  savingOrgConfig.value = true;
  orgConfigError.value = '';
  orgConfigSuccess.value = '';
  try {
    await api.patch('/system-notifications/org-config', {
      welcomeMessageTemplate: welcomeTemplate.value.trim() || null,
      welcomeImageUrl: welcomeImageUrl.value,
      adminFallbackPhone: adminFallbackPhone.value.trim() || null,
    });
    savedSnapshot.value = {
      template: welcomeTemplate.value,
      image: welcomeImageUrl.value,
      phone: adminFallbackPhone.value,
    };
    orgConfigSuccess.value = 'Lưu thành công';
    setTimeout(() => { orgConfigSuccess.value = ''; }, 3000);
  } catch (err: any) {
    orgConfigError.value = err?.response?.data?.error || 'Lỗi lưu cấu hình';
  } finally {
    savingOrgConfig.value = false;
  }
}

function discardOrgConfigChanges() {
  welcomeTemplate.value = savedSnapshot.value.template;
  welcomeImageUrl.value = savedSnapshot.value.image;
  adminFallbackPhone.value = savedSnapshot.value.phone;
  orgConfigError.value = '';
  orgConfigSuccess.value = '';
}

function resetTemplate() {
  welcomeTemplate.value = defaultTemplate.value;
}

async function onImagePicked(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  imageUploading.value = true;
  orgConfigError.value = '';
  try {
    const fd = new FormData();
    fd.append('image', file);
    const { data } = await api.post('/system-notifications/welcome-image', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    welcomeImageUrl.value = data.url;
    savedSnapshot.value.image = data.url; // server-side đã commit, sync snapshot
  } catch (err: any) {
    orgConfigError.value = err?.response?.data?.error || 'Upload ảnh thất bại';
  } finally {
    imageUploading.value = false;
    if (target) target.value = '';
  }
}

async function clearImage() {
  welcomeImageUrl.value = null;
  // Force save ngay vì image upload đã save vào DB lúc upload — clear local-only sẽ misalign.
  // Đơn giản: gọi PATCH để xoá luôn.
  try {
    await api.patch('/system-notifications/org-config', { welcomeImageUrl: null });
    savedSnapshot.value.image = null;
  } catch (err: any) {
    orgConfigError.value = err?.response?.data?.error || 'Xoá ảnh thất bại';
  }
}

async function openPreview() {
  previewLoading.value = true;
  showPreview.value = true;
  try {
    const { data } = await api.post('/system-notifications/preview-welcome', {
      templateOverride: welcomeTemplate.value.trim() || undefined,
      variant: previewVariant.value,
    });
    previewText.value = data.text;
    previewStyles.value = data.styles ?? [];
  } catch (err: any) {
    previewText.value = `Lỗi preview: ${err?.response?.data?.error || err?.message}`;
    previewStyles.value = [];
  } finally {
    previewLoading.value = false;
  }
}

// Re-fetch preview khi đổi variant trong dialog
watch(previewVariant, () => {
  if (showPreview.value) openPreview();
});

// ════════════════════════════════════════════════════════════════════════
// 2026-06-04 (Anh chốt) — LỊCH SỬ GỬI THÔNG BÁO HỆ THỐNG
// ════════════════════════════════════════════════════════════════════════
interface LogItem {
  id: string;
  type: string;
  title: string;
  content: string;
  priority: string;
  channel: string;
  status: string;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
  conversationId: string | null;
  targetUser: { id: string; fullName: string; email: string } | null;
  senderNick: { id: string; displayName: string | null } | null;
  deliveredAt: string | null;
  seenAt: string | null;
}

const logs = ref<LogItem[]>([]);
const logTotal = ref(0);
const loadingLogs = ref(false);
const logStatusCounts = ref<Record<string, number>>({});
const logFilterType = ref<string | null>(null);
const logFilterStatus = ref<string | null>(null);
const logFilterChannel = ref<string | null>(null);
const logFilterFrom = ref<string>('');
const logFilterTo = ref<string>('');
const logOffset = ref(0);
const LOG_PAGE = 50;

const retryingId = ref<string | null>(null);
const showLogDetail = ref(false);
const detailLog = ref<LogItem | null>(null);

// 9 loại tin nội bộ + test → nhãn tiếng Việt + màu + icon (Anh: dễ hiểu, không jargon).
const TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  'customer-reply':     { label: 'KH trả lời',      color: 'error',   icon: '🔥' },
  'reaction-negative':  { label: 'Cảm xúc xấu',     color: 'error',   icon: '😡' },
  'customer-block':     { label: 'KH chặn nick',    color: 'error',   icon: '🚫' },
  'friend-accept':      { label: 'Đồng ý kết bạn',  color: 'success', icon: '🤝' },
  'friend-accept-late': { label: 'Đồng ý (trễ)',    color: 'success', icon: '🕐' },
  'reaction-positive':  { label: 'Cảm xúc tốt',     color: 'warning', icon: '❤️' },
  'friend-reject':      { label: 'Từ chối kết bạn', color: 'grey',    icon: '❌' },
  'no-zalo':            { label: 'Không có Zalo',    color: 'grey',    icon: '📵' },
  'send-error':         { label: 'Lỗi gửi kết bạn', color: 'warning', icon: '⚠️' },
  'test':               { label: 'Tin test',        color: 'info',    icon: '🧪' },
};
function typeLabel(t: string): string { return TYPE_META[t]?.label ?? t; }
function typeColor(t: string): string { return TYPE_META[t]?.color ?? 'grey'; }
function typeIcon(t: string): string { return TYPE_META[t]?.icon ?? '📨'; }

const typeFilterOptions = computed(() =>
  Object.entries(TYPE_META).map(([value, m]) => ({ value, label: `${m.icon} ${m.label}` })),
);
const statusFilterOptions = [
  { value: 'sent', label: '✅ Đã gửi' },
  { value: 'failed', label: '❌ Thất bại' },
  { value: 'pending', label: '⏳ Đang chờ' },
];
const channelFilterOptions = [
  { value: 'zalo', label: 'Zalo' },
  { value: 'crm_panel', label: 'CRM panel' },
];

function logStatusLabel(s: string): string {
  if (s === 'sent') return '✅ Đã gửi';
  if (s === 'failed') return '❌ Thất bại';
  if (s === 'pending') return '⏳ Đang chờ';
  return s;
}
function logStatusColor(s: string): string {
  if (s === 'sent') return 'success';
  if (s === 'failed') return 'error';
  if (s === 'pending') return 'warning';
  return 'grey';
}

// Đã nhận/đã xem — chỉ tin gửi qua Zalo thành công mới có (delivered/seen từ Message).
function readReceiptLabel(log: LogItem): string {
  if (log.channel !== 'zalo' || log.status !== 'sent') return '—';
  if (log.seenAt) return '👀 Đã xem';
  if (log.deliveredAt) return '✓✓ Đã nhận';
  return '✓ Đã gửi';
}
function readReceiptTitle(log: LogItem): string {
  if (log.channel !== 'zalo' || log.status !== 'sent') return 'Không gửi qua Zalo';
  if (log.seenAt) return `KH xem lúc ${fmtDateTime(log.seenAt)}`;
  if (log.deliveredAt) return `KH nhận lúc ${fmtDateTime(log.deliveredAt)}`;
  return 'Đã gửi, chưa nhận xác nhận';
}

function logTitleLine(log: LogItem): string {
  // Tin styled (mới): dòng đầu content = tiêu đề. Tin cũ: dùng title.
  const firstLine = (log.content ?? '').split('\n')[0]?.trim();
  return firstLine || log.title || '(không nội dung)';
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const hasLogFilter = computed(
  () => !!(logFilterType.value || logFilterStatus.value || logFilterChannel.value || logFilterFrom.value || logFilterTo.value),
);

async function fetchLogs(reset = true) {
  loadingLogs.value = true;
  try {
    if (reset) logOffset.value = 0;
    const params: Record<string, string> = {
      limit: String(LOG_PAGE),
      offset: String(logOffset.value),
    };
    if (logFilterType.value) params.type = logFilterType.value;
    if (logFilterStatus.value) params.status = logFilterStatus.value;
    if (logFilterChannel.value) params.channel = logFilterChannel.value;
    if (logFilterFrom.value) params.from = `${logFilterFrom.value}T00:00:00`;
    if (logFilterTo.value) params.to = `${logFilterTo.value}T23:59:59`;
    const { data } = await api.get('/system-notifications/logs', { params });
    if (reset) logs.value = data.items ?? [];
    else logs.value = [...logs.value, ...(data.items ?? [])];
    logTotal.value = data.total ?? 0;
    logStatusCounts.value = data.statusCounts ?? {};
  } catch (err) {
    logs.value = [];
    logTotal.value = 0;
  } finally {
    loadingLogs.value = false;
  }
}

function onLogFilterChange() { fetchLogs(true); }
function clearLogFilter() {
  logFilterType.value = null;
  logFilterStatus.value = null;
  logFilterChannel.value = null;
  logFilterFrom.value = '';
  logFilterTo.value = '';
  fetchLogs(true);
}
function loadMoreLogs() {
  logOffset.value += LOG_PAGE;
  fetchLogs(false);
}

function openLogDetail(log: LogItem) {
  detailLog.value = log;
  showLogDetail.value = true;
}

async function retryLog(log: LogItem) {
  retryingId.value = log.id;
  try {
    await api.post(`/system-notifications/logs/${log.id}/retry`);
    showLogDetail.value = false;
    await fetchLogs(true);
  } catch (err) {
    /* lỗi retry — giữ nguyên, fetch lại để thấy bản ghi mới nếu có */
    await fetchLogs(true);
  } finally {
    retryingId.value = null;
  }
}

function goToConversation(log: LogItem) {
  if (!log.conversationId) return;
  window.open(`/chat?conversationId=${log.conversationId}`, '_blank');
}

// Làm mới toàn trang (nút topbar) — refresh dữ liệu tab đang xem + recipients.
async function refreshAll() {
  await Promise.all([fetchRecipients(), fetchLogs(true)]);
}

onMounted(async () => {
  await fetchSettings();
  await fetchRecipients();
  await fetchOrgConfig();
  await fetchLogs();
});
</script>

<style scoped>
.system-notify-page {
  max-width: 1180px;
}

/* ══════ Atlas v2 redesign (2026-06-04, Anh chốt) ══════
   Khớp design system marketing-unified + airtable.css.
   primary #0068ff, topbar + tab ngang + KPI tile accent. */
:root, .system-notify-page {
  --at-primary: #0068ff; --at-primary-soft: #e7f0ff;
  --at-ink: #181d26; --at-muted: #6b778c; --at-hairline: #e6e8eb;
  --at-success: #36b37e; --at-danger: #de350b; --at-warning: #ff8b00;
}

/* Topbar */
.sn-topbar {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin-bottom: 16px; flex-wrap: wrap;
}
.sn-topbar-title { display: flex; align-items: center; gap: 12px; }
.sn-ico {
  width: 40px; height: 40px; border-radius: 8px; flex-shrink: 0;
  background: var(--at-primary-soft); color: var(--at-primary);
  display: flex; align-items: center; justify-content: center; font-size: 20px;
}
.sn-h1 { font-size: 19px; font-weight: 700; color: var(--at-ink); line-height: 1.2; }
.sn-sub { font-size: 12.5px; color: var(--at-muted); margin-top: 2px; }

/* Tabs — Vuetify v-tabs nhưng tinh chỉnh sang Atlas */
.sn-tabs { border-bottom: 1px solid var(--at-hairline); margin-bottom: 20px; }
.sn-tabs :deep(.v-tab) { text-transform: none; font-weight: 500; letter-spacing: 0; font-size: 13.5px; }
.sn-tab-cnt {
  font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 9999px;
  background: rgba(0,0,0,.06); color: var(--at-muted); margin-left: 6px;
}
.sn-window { overflow: visible; }
.sn-window :deep(.v-window__container) { overflow: visible; }

/* KPI tiles (accent border-left) */
.sn-kpi-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px; margin-bottom: 16px;
}
.sn-kpi {
  background: #fff; border: 1px solid var(--at-hairline); border-radius: 12px;
  padding: 14px 16px; border-left: 4px solid var(--at-hairline);
}
.sn-kpi.green { border-left-color: var(--at-success); }
.sn-kpi.red   { border-left-color: var(--at-danger); }
.sn-kpi.amber { border-left-color: var(--at-warning); }
.sn-kpi-val { font-size: 24px; font-weight: 700; color: var(--at-ink); line-height: 1; }
.sn-kpi.green .sn-kpi-val { color: #1b6b46; }
.sn-kpi.red .sn-kpi-val   { color: var(--at-danger); }
.sn-kpi.amber .sn-kpi-val { color: #92400e; }
.sn-kpi-lbl {
  font-size: 11px; font-weight: 600; color: var(--at-muted);
  text-transform: uppercase; letter-spacing: .4px; margin-top: 6px;
  display: flex; align-items: center; gap: 4px;
}

.notify-card {
  border-color: rgba(var(--v-theme-outline), 0.18);
}

.sender-select {
  min-width: 320px;
  max-width: 520px;
}

.recipient-table :deep(td),
.recipient-table :deep(th) {
  white-space: nowrap;
}
/* 2026-06-04 — bảng dài hơn vùng main (sidebar CRM 256px) → cho cuộn ngang
   để cột cuối (Thao tác / Đã nhận-xem) không bị cắt mép phải. */
.recipient-table :deep(.v-table__wrapper) {
  overflow-x: auto;
}
.system-notify-page { max-width: 1080px; }

.uid-text {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.template-textarea :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  line-height: 1.55;
}

.welcome-image-block {
  flex: 0 0 auto;
}

.welcome-image-preview {
  width: 180px;
  height: 120px;
  border: 1px dashed rgba(var(--v-theme-outline), 0.4);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: rgba(var(--v-theme-surface-variant), 0.3);
}

.welcome-image-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.admin-phone-field {
  flex: 1 1 280px;
  min-width: 240px;
  max-width: 360px;
}

.preview-pane {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  white-space: pre-wrap;
  line-height: 1.55;
  background: rgba(var(--v-theme-surface-variant), 0.3);
  padding: 12px;
  border-radius: 8px;
  max-height: 60vh;
  overflow: auto;
}

/* ── Log thông báo hệ thống (2026-06-04) ── */
.log-table :deep(tr.log-row:hover) {
  background: rgba(var(--v-theme-primary), 0.04);
}
.log-content-preview {
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.detail-row {
  display: flex;
  gap: 10px;
  padding: 4px 0;
  font-size: 13px;
}
.detail-k {
  flex: 0 0 110px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-weight: 500;
}
.detail-content {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12.5px;
  white-space: pre-wrap;
  line-height: 1.5;
  background: rgba(var(--v-theme-surface-variant), 0.3);
  padding: 10px;
  border-radius: 8px;
  margin: 0;
  max-height: 40vh;
  overflow: auto;
}
</style>
