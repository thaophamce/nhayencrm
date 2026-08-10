<template>
  <main class="preview-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">CHỈ CHẠY LOCAL</p>
        <h1>Thử kết nối Pancake Chat</h1>
        <p class="subtitle">Token được mã hóa ở backend; trình duyệt chỉ nhận mã kết nối.</p>
      </div>
      <span class="local-badge"><span aria-hidden="true"></span> Chỉ chạy local</span>
    </header>

    <section class="connect-panel" aria-labelledby="connect-title">
      <div class="panel-copy">
        <h2 id="connect-title">Token kênh Pancake</h2>
        <p>Token được kiểm tra một lần rồi mã hóa AES-256-GCM trên backend local.</p>
      </div>
      <form class="token-form" @submit.prevent="connect">
        <label for="pancake-token">Page access token</label>
        <div class="token-row">
          <input
            id="pancake-token"
            v-model="token"
            :type="showToken ? 'text' : 'password'"
            autocomplete="off"
            spellcheck="false"
            placeholder="Dán token Pancake vào đây"
            :disabled="loading"
          />
          <button class="icon-button" type="button" :aria-label="showToken ? 'Ẩn token' : 'Hiện token'" @click="showToken = !showToken">
            <v-icon size="20">{{ showToken ? 'mdi-eye-off-outline' : 'mdi-eye-outline' }}</v-icon>
          </button>
          <button class="primary-button" type="submit" :disabled="loading || token.trim().length < 40">
            <v-progress-circular v-if="loading" indeterminate size="18" width="2" />
            <v-icon v-else size="19">mdi-link-variant</v-icon>
            {{ loading ? 'Đang kết nối' : 'Kết nối' }}
          </button>
        </div>
      </form>
      <p v-if="error" class="error-message" role="alert">
        <v-icon size="18">mdi-alert-circle-outline</v-icon>{{ error }}
      </p>
    </section>

    <template v-if="preview">
      <section class="account-card" aria-label="Tài khoản Pancake đã kết nối">
        <div class="account-avatar"><v-icon size="27">mdi-message-text-outline</v-icon></div>
        <div class="account-info">
          <strong>{{ preview.connection.displayName }}</strong>
          <span>Mã kênh ···{{ preview.connection.pageId.slice(-8) }}</span>
        </div>
        <span class="connected-badge"><span aria-hidden="true"></span> Đang kết nối</span>
        <button class="disconnect-button" type="button" @click="disconnect">Ẩn khỏi phiên này</button>
        <button class="primary-button open-chat-button" type="button" @click="openChat">
          <v-icon size="19">mdi-message-text-outline</v-icon>
          Mở trong Tin nhắn
        </button>
      </section>

      <section class="conversation-panel">
        <div class="list-heading">
          <div>
            <h2>Hội thoại từ Pancake</h2>
            <p>Tin nhắn được đọc trực tiếp từ Pancake và không nhập vào database CRM.</p>
          </div>
          <label class="search-box">
            <v-icon size="19">mdi-magnify</v-icon>
            <span class="sr-only">Tìm hội thoại</span>
            <input v-model="search" type="search" placeholder="Tìm hội thoại..." />
          </label>
        </div>

        <ul v-if="filteredConversations.length" class="conversation-list">
          <li v-for="conversation in filteredConversations" :key="conversation.id">
            <div class="conversation-avatar">
              <img v-if="conversation.avatarUrl" :src="conversation.avatarUrl" alt="" />
              <v-icon v-else size="22">{{ conversation.isGroup ? 'mdi-account-group-outline' : 'mdi-account-outline' }}</v-icon>
            </div>
            <div class="conversation-main">
              <strong>{{ conversation.name }}</strong>
              <span>{{ conversation.snippet || (conversation.isGroup ? 'Nhóm Zalo' : 'Khách Zalo') }}</span>
            </div>
            <div class="conversation-meta">
              <span>{{ formatDate(conversation.updatedAt) }}</span>
              <b>{{ conversation.messageCount }} tin</b>
            </div>
          </li>
        </ul>
        <p v-else class="empty-state">Không tìm thấy hội thoại phù hợp.</p>
      </section>
    </template>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api';
import { usePancakeChatSession, type PancakePreview } from '@/composables/use-pancake-chat-session';

const token = ref('');
const showToken = ref(false);
const loading = ref(false);
const error = ref('');
const preview = ref<PancakePreview | null>(null);
const search = ref('');
const router = useRouter();
const pancakeSession = usePancakeChatSession();

const filteredConversations = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('vi');
  if (!query || !preview.value) return preview.value?.conversations ?? [];
  return preview.value.conversations.filter((item) =>
    item.name.toLocaleLowerCase('vi').includes(query)
    || (item.snippet ?? '').toLocaleLowerCase('vi').includes(query),
  );
});

async function connect() {
  error.value = '';
  loading.value = true;
  try {
    const cleanToken = token.value.trim();
    const { data } = await api.post<PancakePreview>('/dev/pancake-chat/connections', { token: cleanToken });
    preview.value = data;
    pancakeSession.connect(data);
    token.value = '';
    showToken.value = false;
  } catch (cause: any) {
    preview.value = null;
    error.value = cause?.response?.data?.error || 'Không thể kiểm tra token Pancake.';
  } finally {
    loading.value = false;
  }
}

function disconnect() {
  pancakeSession.disconnect();
  preview.value = null;
  token.value = '';
  search.value = '';
}

function openChat() {
  if (pancakeSession.preview.value?.connection.id) {
    router.push({ path: '/chat', query: { source: 'pancake' } });
  }
}

onMounted(async () => {
  if (pancakeSession.preview.value) {
    preview.value = pancakeSession.preview.value;
    return;
  }
  try {
    const { data } = await api.get<{ connections: PancakePreview['connection'][] }>('/dev/pancake-chat/connections');
    const connection = data.connections?.[0];
    if (!connection) return;
    const response = await api.get<PancakePreview>(
      `/dev/pancake-chat/connections/${encodeURIComponent(connection.id)}/conversations`,
    );
    preview.value = response.data;
    pancakeSession.connect(response.data);
  } catch {
    // Kết nối chưa tồn tại hoặc phiên đăng nhập chưa sẵn sàng.
  }
});

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value.endsWith('Z') || /[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}
</script>

<style scoped>
.preview-page { max-width: 1120px; margin: 0 auto; padding: 32px 24px 64px; color: #172033; }
.page-header, .account-card, .list-heading, .token-row { display: flex; align-items: center; }
.page-header { justify-content: space-between; gap: 24px; margin-bottom: 24px; }
.eyebrow { margin: 0 0 6px; color: #1677ff; font-size: 12px; font-weight: 800; letter-spacing: .12em; }
h1 { margin: 0; font-size: 28px; line-height: 1.25; }
h2 { margin: 0; font-size: 17px; }
.subtitle, .panel-copy p, .list-heading p { margin: 6px 0 0; color: #667085; }
.local-badge, .connected-badge { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; border-radius: 999px; font-size: 13px; font-weight: 700; }
.local-badge { padding: 8px 12px; background: #fff7e6; color: #9a6700; }
.local-badge span, .connected-badge span { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
.connect-panel, .conversation-panel { border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; }
.connect-panel { padding: 20px; }
.panel-copy { margin-bottom: 16px; }
.token-form label { display: block; margin-bottom: 7px; font-size: 13px; font-weight: 700; }
.token-row { gap: 8px; }
.token-row input, .search-box input { min-width: 0; border: 0; outline: 0; background: transparent; }
.token-row > input { flex: 1; height: 44px; padding: 0 13px; border: 1px solid #cfd7e3; border-radius: 8px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.token-row > input:focus { border-color: #1677ff; box-shadow: 0 0 0 3px #1677ff1f; }
button { font: inherit; cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: .55; }
.icon-button, .primary-button, .disconnect-button { height: 44px; border-radius: 8px; }
.icon-button { width: 44px; border: 1px solid #cfd7e3; background: #fff; color: #475467; }
.primary-button { display: inline-flex; align-items: center; gap: 8px; padding: 0 18px; border: 1px solid #1677ff; background: #1677ff; color: #fff; font-weight: 750; }
.error-message { display: flex; align-items: center; gap: 7px; margin: 14px 0 0; color: #c62828; font-size: 14px; }
.account-card { gap: 14px; margin-top: 20px; padding: 16px 18px; border: 1px solid #b9d7ff; border-left: 4px solid #1677ff; border-radius: 10px; background: #fff; }
.account-avatar { display: grid; place-items: center; width: 46px; height: 46px; border-radius: 50%; background: #eaf3ff; color: #1677ff; }
.account-info { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 3px; }
.account-info span { color: #7a8699; font-size: 13px; }
.connected-badge { padding: 7px 11px; background: #e7f8f3; color: #099268; }
.disconnect-button { padding: 0 12px; border: 1px solid #d8dee8; background: #fff; color: #475467; font-weight: 650; }
.open-chat-button { margin-left: -4px; }
.summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0; }
.summary-grid article { padding: 16px; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; }
.summary-grid strong, .summary-grid span { display: block; }
.summary-grid strong { color: #1677ff; font-size: 24px; }
.summary-grid span { margin-top: 4px; color: #667085; font-size: 13px; }
.conversation-panel { overflow: hidden; }
.list-heading { justify-content: space-between; gap: 20px; padding: 18px 20px; border-bottom: 1px solid #e8edf3; }
.search-box { display: flex; align-items: center; gap: 8px; width: 260px; padding: 9px 12px; border: 1px solid #d8dee8; border-radius: 8px; color: #667085; }
.search-box input { width: 100%; }
.conversation-list { max-height: 520px; margin: 0; padding: 0; overflow-y: auto; list-style: none; }
.conversation-list li { display: flex; align-items: center; gap: 12px; padding: 13px 20px; border-bottom: 1px solid #eef1f5; }
.conversation-list li:last-child { border-bottom: 0; }
.conversation-avatar { display: grid; flex: 0 0 42px; place-items: center; width: 42px; height: 42px; overflow: hidden; border-radius: 50%; background: #edf3fa; color: #52677f; }
.conversation-avatar img { width: 100%; height: 100%; object-fit: cover; }
.conversation-main { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 3px; }
.conversation-main strong, .conversation-main span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conversation-main span { color: #7a8699; font-size: 13px; }
.conversation-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; color: #7a8699; font-size: 12px; }
.conversation-meta b { padding: 3px 7px; border-radius: 999px; background: #eef5ff; color: #1677ff; }
.empty-state { margin: 0; padding: 44px 20px; color: #7a8699; text-align: center; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
@media (max-width: 760px) {
  .preview-page { padding: 20px 14px 48px; }
  .page-header, .list-heading { align-items: stretch; flex-direction: column; }
  .local-badge { align-self: flex-start; }
  .token-row { align-items: stretch; flex-wrap: wrap; }
  .token-row > input { flex-basis: calc(100% - 52px); }
  .primary-button { flex: 1 0 100%; justify-content: center; }
  .account-card { align-items: flex-start; flex-wrap: wrap; }
  .connected-badge { margin-left: auto; }
  .disconnect-button { width: 100%; }
  .open-chat-button { width: 100%; margin-left: 0; }
  .summary-grid { grid-template-columns: repeat(2, 1fr); }
  .search-box { width: auto; }
  .conversation-list li { padding-inline: 14px; }
  .conversation-meta span { display: none; }
}
</style>
