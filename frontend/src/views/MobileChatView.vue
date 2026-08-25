<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <div class="mobile-chat" :class="{ 'mobile-chat--thread-open': !!selectedConvId }">
    <!-- Conversation list (shown when no conversation selected) -->
    <div v-if="!selectedConvId" class="mobile-chat__list">
      <ConversationList
        :conversations="conversations"
        :selected-id="selectedConvId"
        :loading="loadingConvs"
        :active-tab-key="inboxFilters.state.activeTab"
        :advanced-filters-active="advancedFiltersActive"
        v-model:search="searchQuery"
        @select="selectConversation"
        @filter-account="onFilterAccount"
        @update:filters="onFiltersUpdate"
      >
        <template #filters="{ expanded }">
          <ConversationFilterBar
            :filters="inboxFilters"
            :expanded="expanded"
            :total-count="conversations.length"
            :counts="conversationCounts"
            :priority-has-unread="false"
            @reselect-tab="onReselectActiveTab"
          />
        </template>
      </ConversationList>
    </div>

    <!-- Message thread (shown when conversation selected) -->
    <div v-else class="mobile-chat__thread">
      <!-- Back button bar / Slim Messenger-style header -->
      <div class="d-flex align-center pa-2 cl-chat-header">
        <v-btn icon variant="text" size="small" @click="goBack" class="mr-1">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>

        <!-- Contact info triggers Profile Bottom Sheet -->
        <div class="d-flex align-center cursor-pointer flex-1 cl-chat-contact" @click="openProfileSheet">
          <v-avatar size="34" class="mr-2">
            <v-img v-if="selectedConv && (selectedConv.contact as any)?.avatar" :src="(selectedConv.contact as any).avatar" alt="Avatar" />
            <v-icon v-else size="28" color="grey-darken-1">mdi-account-circle</v-icon>
          </v-avatar>
          <div class="d-flex flex-column text-left mr-2 cl-chat-contact__copy">
            <span class="text-body-2 font-weight-bold text-slate-900 text-truncate">
              {{ selectedConv?.contact?.fullName || 'Chat' }}
            </span>
            <span class="cl-online-indicator">
              <span class="cl-dot"></span>
              Online
            </span>
          </div>
        </div>

        <!-- Open conversation info bottom sheet from right edge. -->
        <v-btn icon variant="text" size="small" class="cl-profile-sheet-trigger" title="M&#7903; th&#244;ng tin h&#7897;i tho&#7841;i" aria-label="M&#7903; th&#244;ng tin h&#7897;i tho&#7841;i" @click="openProfileSheet">
          <v-icon size="22">mdi-chevron-down</v-icon>
        </v-btn>
      </div>

      <MessageThread
        :conversation="selectedConv"
        :messages="allMessages"
        :loading="loadingMsgs"
        :sending="sendingMsg"
        :rate-limit-seconds="rateLimitSeconds"
        :rate-limit-total-seconds="rateLimitTotalSeconds"
        :show-contact-panel="false"
        :all-conversations="conversations"
        :ai-suggestion="(null as any)"
        :ai-suggestion-loading="false"
        :ai-suggestion-error="(null as any)"
        @send="handleSend"
        @refresh-thread="selectedConvId && fetchMessages(selectedConvId)"
        class="mobile-chat__messages"
      />
    </div>

    <!-- Mobile profile bottom sheet. Custom fixed overlay avoids Vuetify overlay cleanup
         removing dialog when chat header/list rerenders. -->
    <Teleport to="body">
      <div v-if="showProfileSheet" class="cl-mobile-sheet-overlay" role="dialog" aria-modal="true" aria-label="Thông tin hội thoại" @click.self="closeProfileSheet">
        <section class="cl-mobile-sheet">
          <div class="cl-mobile-sheet-header">
            <span>Thông tin hội thoại</span>
            <button type="button" class="cl-mobile-sheet-close" aria-label="Đóng" @click="closeProfileSheet"><v-icon size="22">mdi-close</v-icon></button>
          </div>
          <div class="cl-mobile-sheet-body">
            <ChatContactPanel
              v-if="selectedConv && (selectedConv.contact || selectedConv.threadType === 'group')"
              class="cl-mobile-contact-panel"
              :contact-id="selectedConv.contact?.id ?? null"
              :contact="selectedConv.contact ?? null"
              :friendship="selectedConv.friendship ?? null"
              :active-zalo-account-id="selectedConv.zaloAccount?.id ?? null"
              :friend-id="selectedConv.friendship?.id ?? null"
              :conversation-id="selectedConv.id ?? null"
              :external-thread-id="selectedConv.externalThreadId ?? null"
              :is-pinned="selectedConv.isPinned ?? false"
              :active-zalo-account-name="selectedConv.zaloAccount?.displayName ?? null"
              :thread-type="selectedConv.threadType ?? null"
              :group-name="(selectedConv as any).groupName ?? null"
              :group-avatar-url="(selectedConv as any).groupAvatarUrl ?? null"
              :ai-summary="(null as any)"
              :ai-summary-loading="false"
              :ai-sentiment="(null as any)"
              :ai-sentiment-loading="false"
              @close="closeProfileSheet"
              @saved="fetchConversations()"
            />
            <div v-else class="cl-mobile-sheet-empty">Không có thông tin hội thoại</div>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import ConversationList from '@/components/chat/ConversationList.vue';
import ConversationFilterBar from '@/components/chat/ConversationFilterBar.vue';
import MessageThread from '@/components/chat/MessageThread.vue';
import ChatContactPanel from '@/components/chat/ChatContactPanel.vue';
import { useChat } from '@/composables/use-chat';
import { useOfflineQueue } from '@/composables/use-offline-queue';
import { useInboxFilters } from '@/composables/use-inbox-filters';
import { useMobileChatLayout } from '@/composables/use-mobile-chat-layout';

const showProfileSheet = ref(false);
function openProfileSheet() {
  if (!selectedConv.value) return;
  showProfileSheet.value = true;
}
function closeProfileSheet() { showProfileSheet.value = false; }
function onProfileSheetKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && showProfileSheet.value) closeProfileSheet();
}

const {
  conversations, selectedConvId, selectedConv, messages,
  loadingConvs, loadingMsgs, sendingMsg, rateLimitSeconds, rateLimitTotalSeconds, searchQuery, accountFilter, extraFilters,
  fetchConversations, fetchMessages, selectConversation, sendMessage, sendMessageTo,
  initSocket, destroySocket,
} = useChat();

const { pendingMessages, enqueue, flush } = useOfflineQueue();
const inboxFilters = useInboxFilters();
const { threadOpen } = useMobileChatLayout();
const advancedFiltersActive = computed(() =>
  inboxFilters.state.quickPills.size > 0
  || inboxFilters.state.silenceLabels.size > 0
  || inboxFilters.state.activeTab !== 'all',
);
const conversationCounts = computed(() => {
  let unread = 0, unanswered = 0, stuck = 0, ready = 0, individual = 0, group = 0;
  for (const conversation of conversations.value) {
    if ((conversation.unreadCount || 0) > 0) unread++;
    if (conversation.isReplied === false) unanswered++;
    if ((conversation.friendship as { stuckSince?: string | null } | null | undefined)?.stuckSince != null) stuck++;
    if ((conversation.contact?.leadScore || 0) >= 80) ready++;
    if (conversation.threadType === 'user') individual++;
    else if (conversation.threadType === 'group') group++;
  }
  return { unread, unanswered, stuck, ready, individual, group };
});

function applyInboxFilters() {
  extraFilters.value = inboxFilters.buildQueryParams();
  fetchConversations();
}

function onFiltersUpdate(params: Record<string, string>) {
  extraFilters.value = { ...extraFilters.value, ...params };
  fetchConversations();
}

function onReselectActiveTab() {
  if (searchQuery.value) searchQuery.value = '';
}

function onFilterAccount(id: string | null) {
  accountFilter.value = id;
  fetchConversations();
}

function goBack() {
  selectedConvId.value = null;
}

// Merge real messages with pending offline messages
const allMessages = computed(() => {
  const pending = pendingMessages.value
    .filter(p => p.conversationId === selectedConvId.value)
    .map(p => ({
      id: p.id,
      content: p.content,
      contentType: 'text',
      senderType: 'self',
      senderName: null,
      sentAt: p.createdAt,
      isDeleted: false,
      zaloMsgId: null,
      albumKey: null,
      albumIndex: null,
      albumTotal: null,
      _pending: true,
    }));
  return [...messages.value, ...pending];
});

async function handleSend(
  content: string,
  replyMessageId?: string | null,
  styles?: Array<{ st: string; start: number; len: number }>,
  mentions?: Array<{ uid: string; pos: number; len: number }>,
) {
  if (!selectedConvId.value) return;
  if (!navigator.onLine) {
    enqueue(selectedConvId.value, content);
    return;
  }
  await sendMessage(content, replyMessageId, styles, mentions);
}

// Flush queue when coming back online
function onOnline() {
  flush(sendMessageTo);
}

onMounted(() => {
  extraFilters.value = inboxFilters.buildQueryParams();
  fetchConversations();
  initSocket();
  window.addEventListener('online', onOnline);
  window.addEventListener('keydown', onProfileSheetKeydown);
});

watch(selectedConvId, (id) => {
  threadOpen.value = !!id;
  if (!id) closeProfileSheet();
}, { immediate: true });

watch(showProfileSheet, (newVal) => {
  if (newVal) {
    document.body.classList.add('cl-profile-open');
  } else {
    document.body.classList.remove('cl-profile-open');
  }
});

onUnmounted(() => {
  destroySocket();
  window.removeEventListener('online', onOnline);
  window.removeEventListener('keydown', onProfileSheetKeydown);
  clearTimeout(searchTimeout);
  clearTimeout(filterApplyTimer);
  document.body.classList.remove('cl-profile-open');
  threadOpen.value = false;
});

let searchTimeout: ReturnType<typeof setTimeout>;
watch(searchQuery, () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => fetchConversations(), 300);
});

watch(() => inboxFilters.state.activeTab, () => {
  if (searchQuery.value) searchQuery.value = '';
  applyInboxFilters();
});

let filterApplyTimer: ReturnType<typeof setTimeout>;
watch(
  () => [
    inboxFilters.state.folderId,
    inboxFilters.state.saleAssigneeId,
    Array.from(inboxFilters.state.quickPills).join(','),
    Array.from(inboxFilters.state.silenceLabels).join(','),
    inboxFilters.state.tagsZalo.join(','),
    inboxFilters.state.tagsCrm.join(','),
    inboxFilters.state.sortMode,
    inboxFilters.state.timeOrder,
    inboxFilters.state.timeAxis,
    inboxFilters.state.timeRangePreset,
    inboxFilters.state.timeFrom,
    inboxFilters.state.timeTo,
    inboxFilters.state.autoTags.join(','),
    inboxFilters.state.scoreMin,
    inboxFilters.state.scoreMax,
    inboxFilters.state.scoreTier,
    inboxFilters.state.stages.join(','),
    inboxFilters.state.stuckDuration,
    inboxFilters.state.lastMessageWithin,
    inboxFilters.state.customerWaitingReply,
    inboxFilters.state.saleWaitingReply,
    inboxFilters.state.birthdayWithin7d,
    inboxFilters.state.appointmentWithin24h,
    inboxFilters.state.appointmentOverdue,
    inboxFilters.state.messageReplyState,
  ],
  () => {
    clearTimeout(filterApplyTimer);
    filterApplyTimer = setTimeout(applyInboxFilters, 150);
  },
  { deep: true },
);
</script>

<style scoped>
.cl-chat-header {
  flex-shrink: 0;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}
.cl-online-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--success);
  font-weight: 500;
}
.cl-dot {
  width: 6px;
  height: 6px;
  background: var(--success);
  border-radius: 50%;
  display: inline-block;
}
.cursor-pointer {
  cursor: pointer;
}
.cl-profile-sheet-trigger {
  flex: 0 0 auto;
  margin-left: auto;
  color: var(--ink-3) !important;
}
.mobile-chat {
  height: calc(100dvh - 120px);
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  background: var(--surface-2);
  font-family: var(--font);
}
.mobile-chat__list { width: 100%; height: 100%; min-width: 0; overflow: hidden; }
.mobile-chat__thread { display: flex; height: 100%; min-width: 0; flex-direction: column; }
.mobile-chat__messages { min-height: 0; flex: 1; }
.cl-chat-contact, .cl-chat-contact__copy { min-width: 0; }
.mobile-chat--thread-open {
  position: fixed;
  inset: 0 0 56px 0;
  z-index: 90;
  height: auto;
  min-height: 0;
  overflow: hidden;
  background: var(--surface);
}
.mobile-chat--thread-open :deep(.input-editor .tiptap-input p.is-editor-empty:first-child::before) {
  content: none !important;
}

/* The shared inbox is desktop-first. Keep every row inside narrow phone viewports. */
.mobile-chat :deep(.conversation-list),
.mobile-chat :deep(.conversation-list-container) { width: 100% !important; min-width: 0 !important; max-width: 100% !important; }
.mobile-chat :deep(.cl-header) { min-width: 0; }
.mobile-chat :deep(.cfb-tabs.main-tab-style) { margin-inline: 8px; }
.mobile-chat :deep(.cfb-tabs.main-tab-style .cfb-tab) { min-width: 0; padding-inline: 4px; font-size: 11px; }
.mobile-chat :deep(.cfb-mini) { gap: 6px; padding-inline: 10px; overflow-x: auto; scrollbar-width: none; }
.mobile-chat :deep(.cfb-mini::-webkit-scrollbar) { display: none; }
.mobile-chat :deep(.mini-count),
.mobile-chat :deep(.mini-sorts) { flex: none; }

@media (max-width: 340px) {
  .mobile-chat :deep(.cfb-tabs.main-tab-style) { margin-inline: 6px; }
  .mobile-chat :deep(.cfb-tabs.main-tab-style .cfb-tab) { padding-inline: 2px; font-size: 10px; letter-spacing: -.2px; }
}
</style>

<style>
body.cl-profile-open .v-bottom-navigation {
  display: none !important;
}

.cl-mobile-sheet-overlay { position: fixed; inset: 0; z-index: 12000; display: flex; align-items: flex-end; justify-content: center; background: color-mix(in srgb, var(--ink) 46%, transparent); animation: cl-sheet-fade-in .16s ease-out; }
.cl-mobile-sheet { width: 100%; max-width: 768px; height: min(90dvh, 90vh); display: flex; flex-direction: column; overflow: hidden; border-radius: 18px 18px 0 0; background: var(--surface); box-shadow: var(--sh-lg); animation: cl-sheet-slide-up .2s ease-out; }
.cl-mobile-sheet-header { min-height: 50px; padding: 8px 10px 8px 16px; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; border-bottom: 1px solid var(--line); color: var(--ink); font-size: 14px; font-weight: 700; }
.cl-mobile-sheet-close { width: 40px; height: 40px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%; color: var(--ink-2); background: transparent; }
.cl-mobile-sheet-close:active { background: var(--surface-3); }
.cl-mobile-sheet-body { flex: 1; min-height: 0; display: flex; overflow: hidden; padding-bottom: env(safe-area-inset-bottom); }
.cl-mobile-contact-panel { flex: 1; min-width: 0; min-height: 0; display: flex !important; flex-direction: column; }
.cl-mobile-sheet-empty { margin: auto; color: var(--ink-3); font-size: 13px; }
@keyframes cl-sheet-fade-in { from { opacity: 0; } }
@keyframes cl-sheet-slide-up { from { transform: translateY(100%); } }
</style>
