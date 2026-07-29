<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  AiAssistantPanel.vue — Trợ lý CSKH trong tab AI (cột phải /chat).
  Chat tự do với AI dựa trên knowledge base "Thiệp Cưới Nhà Yến" (backend gộp
  06_SystemPrompt + knowledge/). Gọi POST /ai/kb-chat.
  Mỗi câu trả lời có nút "Chèn vào tin nhắn" → bắn event chat:insert-suggestion
  (MessageThread lắng nghe) để sale gửi cho khách. Lịch sử lưu localStorage.
-->
<template>
  <div class="ai-panel">
    <div class="ai-head">
      <div class="ai-head-title">
        <span class="ai-dot" />
        Trợ lý CSKH Thiệp Cưới
      </div>
      <button v-if="messages.length" class="ai-clear" title="Xóa hội thoại" @click="clearChat">
        Xóa
      </button>
    </div>

    <div ref="scrollEl" class="ai-body">
      <div v-if="!messages.length" class="ai-empty">
        <div class="ai-empty-icon">✨</div>
        <p class="ai-empty-title">Hỏi trợ lý về sản phẩm, giá, tiến độ...</p>
        <div class="ai-suggest">
          <button v-for="s in quickAsks" :key="s" class="ai-suggest-chip" @click="sendQuick(s)">
            {{ s }}
          </button>
        </div>
      </div>

      <template v-else>
        <div v-for="(m, i) in messages" :key="i" class="ai-msg" :class="`ai-msg--${m.role}`">
          <div class="ai-bubble">{{ m.content }}</div>
          <button
            v-if="m.role === 'assistant'"
            class="ai-insert"
            title="Chèn câu trả lời vào ô soạn tin"
            @click="insertToComposer(m.content)"
          >
            Chèn vào tin nhắn
          </button>
        </div>
      </template>

      <div v-if="loading" class="ai-msg ai-msg--assistant">
        <div class="ai-bubble ai-typing"><span /><span /><span /></div>
      </div>
    </div>

    <div class="ai-input">
      <textarea
        ref="inputEl"
        v-model="draft"
        class="ai-textarea"
        rows="1"
        placeholder="Nhập câu hỏi của khách..."
        :disabled="loading"
        @keydown.enter.exact.prevent="send"
        @input="autoGrow"
      />
      <button class="ai-send" :disabled="!canSend" @click="send">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue';
import { api } from '@/api';
import { useToast } from '@/composables/use-toast';

type ChatMsg = { role: 'user' | 'assistant'; content: string };

const STORAGE_KEY = 'ai-kb-chat-history';
const RATE_LIMIT = 10; // tin/phút
const RATE_WINDOW_MS = 60_000;

const toast = useToast();
const messages = ref<ChatMsg[]>([]);
const draft = ref('');
const loading = ref(false);
const scrollEl = ref<HTMLElement | null>(null);
const inputEl = ref<HTMLTextAreaElement | null>(null);
const sendTimestamps = ref<number[]>([]);

const quickAsks = [
  'Đặt 200 thiệp giá bao nhiêu?',
  'Bao lâu có hàng?',
  'Có mẫu tông hồng không?',
  'Có giao toàn quốc không?',
];

const canSend = computed(() => !loading.value && draft.value.trim().length > 0);

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) messages.value = JSON.parse(raw);
  } catch { /* ignore */ }
}

function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.value.slice(-40)));
  } catch { /* ignore */ }
}

function clearChat() {
  messages.value = [];
  localStorage.removeItem(STORAGE_KEY);
}

async function scrollBottom() {
  await nextTick();
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight;
}

function autoGrow() {
  const el = inputEl.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function insertToComposer(text: string) {
  window.dispatchEvent(new CustomEvent('chat:insert-suggestion', { detail: { text } }));
  toast.success('Đã chèn vào ô soạn tin');
}

function withinRateLimit(): boolean {
  const now = Date.now();
  sendTimestamps.value = sendTimestamps.value.filter((t) => now - t < RATE_WINDOW_MS);
  if (sendTimestamps.value.length >= RATE_LIMIT) return false;
  sendTimestamps.value.push(now);
  return true;
}

function sendQuick(text: string) {
  draft.value = text;
  void send();
}

async function send() {
  const text = draft.value.trim();
  if (!text || loading.value) return;
  if (!withinRateLimit()) {
    toast.error('Gửi quá nhanh, thử lại sau ít giây');
    return;
  }
  messages.value.push({ role: 'user', content: text });
  draft.value = '';
  autoGrow();
  saveHistory();
  await scrollBottom();

  loading.value = true;
  try {
    const { data } = await api.post('/ai/kb-chat', {
      messages: messages.value.map((m) => ({ role: m.role, content: m.content })),
    });
    const reply = (data?.reply || '').trim();
    if (reply) {
      messages.value.push({ role: 'assistant', content: reply });
      saveHistory();
    } else {
      toast.error('AI không trả về nội dung');
    }
  } catch (err: any) {
    const msg = err?.response?.data?.error || 'Không gọi được trợ lý AI';
    toast.error(msg);
  } finally {
    loading.value = false;
    await scrollBottom();
  }
}

onMounted(() => {
  loadHistory();
  void scrollBottom();
});
</script>

<style scoped>
.ai-panel {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  background: #fff;
}
.ai-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid #eaecef;
}
.ai-head-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 700;
  color: #1e202c;
}
.ai-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2f80ed;
  box-shadow: 0 0 0 3px rgba(47, 128, 237, 0.15);
}
.ai-clear {
  border: none;
  background: transparent;
  color: #8a8d9c;
  font-size: 12px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
}
.ai-clear:hover { color: #e5484d; background: rgba(229, 72, 77, 0.08); }

.ai-body {
  flex: 1 1 auto;
  overflow-y: auto;
  min-height: 0;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ai-empty {
  margin: auto;
  text-align: center;
  color: #8a8d9c;
}
.ai-empty-icon { font-size: 30px; }
.ai-empty-title { font-size: 13px; margin: 6px 0 12px; }
.ai-suggest {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ai-suggest-chip {
  border: 1px solid #eaecef;
  background: #fff;
  border-radius: 9px;
  padding: 8px 10px;
  font-size: 12.5px;
  color: #1e202c;
  cursor: pointer;
  transition: all 0.13s;
}
.ai-suggest-chip:hover { border-color: #2f80ed; background: rgba(47, 128, 237, 0.05); }

.ai-msg {
  display: flex;
  flex-direction: column;
  max-width: 90%;
}
.ai-msg--user { align-self: flex-end; align-items: flex-end; }
.ai-msg--assistant { align-self: flex-start; align-items: flex-start; }
.ai-bubble {
  padding: 8px 11px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.ai-msg--user .ai-bubble {
  background: #2f80ed;
  color: #fff;
  border-bottom-right-radius: 4px;
}
.ai-msg--assistant .ai-bubble {
  background: #f2f4f7;
  color: #1e202c;
  border-bottom-left-radius: 4px;
}
.ai-insert {
  margin-top: 4px;
  border: none;
  background: transparent;
  color: #2f80ed;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 6px;
}
.ai-insert:hover { background: rgba(47, 128, 237, 0.1); }

.ai-typing { display: flex; gap: 4px; align-items: center; }
.ai-typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #8a8d9c;
  animation: ai-blink 1.2s infinite ease-in-out both;
}
.ai-typing span:nth-child(2) { animation-delay: 0.2s; }
.ai-typing span:nth-child(3) { animation-delay: 0.4s; }
@keyframes ai-blink {
  0%, 80%, 100% { opacity: 0.3; }
  40% { opacity: 1; }
}

.ai-input {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid #eaecef;
}
.ai-textarea {
  flex: 1 1 auto;
  resize: none;
  border: 1px solid #eaecef;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.4;
  max-height: 120px;
  outline: none;
}
.ai-textarea:focus { border-color: #2f80ed; }
.ai-send {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: #2f80ed;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.13s;
}
.ai-send svg { width: 17px; height: 17px; }
.ai-send:hover:not(:disabled) { background: #1a6fd4; }
.ai-send:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
