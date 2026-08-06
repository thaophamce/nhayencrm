// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { ref } from 'vue';
import type { Socket } from 'socket.io-client';
import { api } from '@/api/index';
import type { Message } from '@/composables/use-chat';

// Trạng thái typing và reply/edit
const typingUsers = ref<Map<string, { userId: string; userName: string }[]>>(new Map());
const replyingTo = ref<Message | null>(null);
const editingMessage = ref<Message | null>(null);

// Tin đã ghim theo conversationId — Ghim tin nhắn (CRM-only, 2026-07-14).
const pinnedMessages = ref<Map<string, PinnedMessageEntry[]>>(new Map());

// Debounce typing — tránh spam server
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

export interface PinnedMessageEntry {
  id: string;
  messageId: string;
  pinnedAt: string;
  message: { id: string; content: string | null; contentType: string; senderName: string | null; senderType: string; sentAt: string; isDeleted: boolean };
  pinnedBy: { id: string; fullName: string };
}

export function useChatOperations() {
  async function addReaction(convId: string, msgId: string, reaction: string): Promise<void> {
    try {
      await api.post(`/conversations/${convId}/reactions`, { msgId, reaction });
    } catch (err) {
      console.error('Failed to add reaction:', err);
      throw err;
    }
  }

  /** Toggle off — gỡ reaction của user trên msg. Phase A fix (2026-05-21):
   *  Click chip mình đã reacted → call this instead of addReaction để KHÔNG
   *  trigger SDK addReaction lần 2 (Zalo coi như user re-react → clear emoji khác). */
  async function removeReaction(convId: string, msgId: string, reaction: string): Promise<void> {
    try {
      await api.delete(`/conversations/${convId}/reactions`, { data: { msgId, reaction } });
    } catch (err) {
      console.error('Failed to remove reaction:', err);
      throw err;
    }
  }

  function sendTypingEvent(convId: string): void {
    const existing = typingTimers.get(convId);
    if (existing) return; // đang trong cooldown 3s, bỏ qua

    api.post(`/conversations/${convId}/typing`).catch((err) => {
      console.error('Failed to send typing event:', err);
    });

    const timer = setTimeout(() => {
      typingTimers.delete(convId);
    }, 3000);
    typingTimers.set(convId, timer);
  }

  async function deleteMessage(convId: string, msgId: string): Promise<void> {
    try {
      await api.delete(`/conversations/${convId}/messages/${msgId}`);
    } catch (err) {
      console.error('Failed to delete message:', err);
      throw err;
    }
  }

  async function undoMessage(convId: string, msgId: string): Promise<void> {
    try {
      await api.post(`/conversations/${convId}/messages/${msgId}/undo`);
    } catch (err) {
      console.error('Failed to undo message:', err);
      throw err;
    }
  }

  async function editMessage(convId: string, msgId: string, content: string): Promise<void> {
    try {
      await api.post(`/conversations/${convId}/messages/${msgId}/edit`, { content });
    } catch (err) {
      console.error('Failed to edit message:', err);
      throw err;
    }
  }

  async function forwardMessage(convId: string, msgId: string, targetIds: string[]): Promise<void> {
    try {
      await api.post(`/conversations/${convId}/forward`, {
        msgId,
        targetConversationIds: targetIds,
      });
    } catch (err) {
      console.error('Failed to forward message:', err);
      throw err;
    }
  }

  async function pinMessage(convId: string, msgId: string): Promise<void> {
    try {
      await api.post(`/conversations/${convId}/messages/${msgId}/pin`);
      await fetchPinnedMessages(convId);
    } catch (err) {
      console.error('Failed to pin message:', err);
      throw err;
    }
  }

  async function unpinMessage(convId: string, msgId: string): Promise<void> {
    try {
      await api.delete(`/conversations/${convId}/messages/${msgId}/pin`);
      await fetchPinnedMessages(convId);
    } catch (err) {
      console.error('Failed to unpin message:', err);
      throw err;
    }
  }

  async function fetchPinnedMessages(convId: string): Promise<PinnedMessageEntry[]> {
    try {
      const res = await api.get<{ pins: PinnedMessageEntry[] }>(`/conversations/${convId}/pinned-messages`);
      pinnedMessages.value.set(convId, res.data.pins);
      pinnedMessages.value = new Map(pinnedMessages.value);
      return res.data.pins;
    } catch (err) {
      console.error('Failed to fetch pinned messages:', err);
      return [];
    }
  }

  // Reply/edit helpers
  function setReplyTo(msg: Message) { replyingTo.value = msg; editingMessage.value = null; }
  function clearReplyTo() { replyingTo.value = null; }
  function setEditing(msg: Message) { editingMessage.value = msg; replyingTo.value = null; }
  function clearEditing() { editingMessage.value = null; }

  function registerSocketListeners(socket: Socket | null) {
    if (!socket) return;

    socket.on(
      'chat:typing',
      (data: { conversationId: string; typers: { userId: string; userName: string }[] }) => {
        try {
          typingUsers.value.set(data.conversationId, data.typers);
          // Trigger reactivity — Map mutations không tự reactive
          typingUsers.value = new Map(typingUsers.value);
        } catch (err) {
          console.error('[chat-ops] typing event error:', err);
        }
      },
    );

    socket.on(
      'chat:message-edited',
      (_data: { conversationId: string; msgId: string; content: string }) => {
        // Caller handles update via fetchMessages or direct mutation
      },
    );

    socket.on(
      'chat:message-pinned',
      (data: { conversationId: string; messageId: string; pinnedAt: string }) => {
        void fetchPinnedMessages(data.conversationId);
      },
    );

    socket.on(
      'chat:message-unpinned',
      (data: { conversationId: string; messageId: string }) => {
        void fetchPinnedMessages(data.conversationId);
      },
    );
  }

  return {
    typingUsers,
    replyingTo,
    editingMessage,
    pinnedMessages,
    addReaction,
    removeReaction,
    sendTypingEvent,
    deleteMessage,
    undoMessage,
    editMessage,
    forwardMessage,
    pinMessage,
    unpinMessage,
    fetchPinnedMessages,
    setReplyTo,
    clearReplyTo,
    setEditing,
    clearEditing,
    registerSocketListeners,
  };
}
