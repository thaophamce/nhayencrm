// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { ref } from 'vue';
import { api } from '@/api/index';

export interface FriendBlastPacing {
  delaySeconds?: number;
  batchSize?: number;
  batchPauseSeconds?: number;
  dailyLimit?: number;
}

export interface FriendBlastCampaign {
  id: string;
  orgId: string;
  zaloAccountId: string;
  messageText: string | null;
  imageUrl: string | null;
  imageFilename: string | null;
  pacing: FriendBlastPacing;
  state: 'draft' | 'running' | 'paused' | 'completed' | 'cancelled';
  totalRecipients: number;
  sentCount: number;
  successCount: number;
  failedCount: number;
  sentToday: number;
  createdById: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FriendBlastRecipient {
  id: string;
  campaignId: string;
  friendUid: string;
  displayName: string | null;
  status: 'pending' | 'sending' | 'success' | 'failed' | 'skipped_blacklist';
  note: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface FriendBlacklistEntry {
  id: string;
  orgId: string;
  zaloAccountId: string;
  friendUid: string;
  note: string | null;
  createdAt: string;
}

export function useFriendBlast() {
  const campaign = ref<FriendBlastCampaign | null>(null);
  const recipients = ref<FriendBlastRecipient[]>([]);
  const recipientsTotal = ref(0);
  const blacklist = ref<FriendBlacklistEntry[]>([]);
  const loading = ref(false);

  function base(accountId: string) {
    return `/zalo-accounts/${accountId}/friend-blasts`;
  }

  async function createCampaign(
    accountId: string,
    payload: { messageText?: string; imageUrl?: string; imageFilename?: string; pacing?: FriendBlastPacing; friendUids: string[] },
  ) {
    loading.value = true;
    try {
      const res = await api.post(`${base(accountId)}`, payload);
      campaign.value = res.data?.campaign ?? null;
      return campaign.value;
    } catch (err) {
      console.error('createCampaign failed:', err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function fetchCampaign(accountId: string, id: string) {
    try {
      const res = await api.get(`${base(accountId)}/${id}`);
      campaign.value = res.data?.campaign ?? null;
      return campaign.value;
    } catch (err) {
      console.error('fetchCampaign failed:', err);
      return null;
    }
  }

  async function fetchRecipients(accountId: string, id: string, opts: { page?: number; pageSize?: number } = {}) {
    try {
      const res = await api.get(`${base(accountId)}/${id}/recipients`, {
        params: { page: opts.page ?? 1, pageSize: opts.pageSize ?? 50 },
      });
      recipients.value = res.data?.recipients ?? [];
      recipientsTotal.value = res.data?.total ?? 0;
      return recipients.value;
    } catch (err) {
      console.error('fetchRecipients failed:', err);
      return [];
    }
  }

  async function startCampaign(accountId: string, id: string) {
    try {
      const res = await api.post(`${base(accountId)}/${id}/start`);
      return res.data;
    } catch (err) {
      console.error('startCampaign failed:', err);
      return null;
    }
  }

  async function pauseCampaign(accountId: string, id: string) {
    try {
      const res = await api.post(`${base(accountId)}/${id}/pause`);
      campaign.value = res.data?.campaign ?? campaign.value;
      return res.data;
    } catch (err) {
      console.error('pauseCampaign failed:', err);
      return null;
    }
  }

  async function resumeCampaign(accountId: string, id: string) {
    try {
      const res = await api.post(`${base(accountId)}/${id}/resume`);
      campaign.value = res.data?.campaign ?? campaign.value;
      return res.data;
    } catch (err) {
      console.error('resumeCampaign failed:', err);
      return null;
    }
  }

  async function cancelCampaign(accountId: string, id: string) {
    try {
      const res = await api.post(`${base(accountId)}/${id}/cancel`);
      campaign.value = res.data?.campaign ?? campaign.value;
      return res.data;
    } catch (err) {
      console.error('cancelCampaign failed:', err);
      return null;
    }
  }

  async function fetchBlacklist(accountId: string) {
    try {
      const res = await api.get(`${base(accountId)}/blacklist`);
      blacklist.value = res.data?.entries ?? [];
      return blacklist.value;
    } catch (err) {
      console.error('fetchBlacklist failed:', err);
      return [];
    }
  }

  async function addToBlacklist(accountId: string, friendUid: string, note?: string) {
    try {
      const res = await api.post(`${base(accountId)}/blacklist`, { friendUid, note });
      await fetchBlacklist(accountId);
      return res.data?.entry ?? null;
    } catch (err) {
      console.error('addToBlacklist failed:', err);
      return null;
    }
  }

  async function removeFromBlacklist(accountId: string, friendUid: string) {
    try {
      await api.delete(`${base(accountId)}/blacklist/${friendUid}`);
      await fetchBlacklist(accountId);
      return true;
    } catch (err) {
      console.error('removeFromBlacklist failed:', err);
      return false;
    }
  }

  return {
    campaign,
    recipients,
    recipientsTotal,
    blacklist,
    loading,
    createCampaign,
    fetchCampaign,
    fetchRecipients,
    startCampaign,
    pauseCampaign,
    resumeCampaign,
    cancelCampaign,
    fetchBlacklist,
    addToBlacklist,
    removeFromBlacklist,
  };
}
