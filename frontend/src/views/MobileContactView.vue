<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <div class="mobile-contacts pa-3">
    <header class="contacts-head mb-3">
      <div>
        <div class="contacts-eyebrow">KHÁCH HÀNG</div>
        <h1>Danh bạ chăm sóc</h1>
      </div>
      <span class="contacts-total">{{ total }} khách</span>
    </header>

    <v-text-field
      v-model="filters.search"
      aria-label="Tìm khách hàng"
      placeholder="Tên, số điện thoại hoặc Zalo"
      prepend-inner-icon="mdi-magnify"
      variant="outlined"
      density="comfortable"
      hide-details
      clearable
      class="contacts-search mb-3"
      @update:model-value="onSearch"
    />

    <div class="contacts-filters mb-3" aria-label="Lọc khách hàng theo trạng thái">
      <button type="button" class="filter-chip" :class="{ active: !filters.status }" @click="toggleStatus('')">Tất cả</button>
      <button
        v-for="status in STATUS_OPTIONS"
        :key="status.value"
        type="button"
        class="filter-chip"
        :class="{ active: filters.status === status.value }"
        @click="toggleStatus(status.value)"
      >
        {{ status.text }}
      </button>
    </div>

    <div v-if="loading" class="contacts-list" aria-busy="true" aria-label="Đang tải khách hàng">
      <v-skeleton-loader v-for="index in 5" :key="index" type="list-item-avatar-two-line" class="contact-skeleton" />
    </div>

    <div v-else-if="contacts.length" class="contacts-list">
      <button v-for="contact in contacts" :key="contact.id" type="button" class="contact-card" @click="openContact(contact)">
        <v-avatar size="44" class="contact-avatar">
          <v-img v-if="contact.avatarUrl" :src="contact.avatarUrl" />
          <span v-else>{{ initials(contact.fullName) }}</span>
        </v-avatar>
        <div class="contact-main">
          <div class="contact-name">{{ contact.fullName || contact.crmName || 'Khách hàng chưa đặt tên' }}</div>
          <div class="contact-meta">
            <v-icon size="13">mdi-phone-outline</v-icon>
            <span>{{ contact.phone || 'Chưa cập nhật số điện thoại' }}</span>
          </div>
          <div v-if="contact.assignedUser?.fullName" class="contact-owner">Phụ trách: {{ contact.assignedUser.fullName }}</div>
        </div>
        <div class="contact-side">
          <span v-if="contact.status" class="status-pill" :data-status="contact.status">{{ statusLabel(contact.status) }}</span>
          <span v-if="contact._count?.conversations" class="conversation-count">
            <v-icon size="13">mdi-message-text-outline</v-icon>{{ contact._count.conversations }}
          </span>
          <v-icon size="18" color="grey">mdi-chevron-right</v-icon>
        </div>
      </button>
    </div>

    <div v-else class="contacts-empty">
      <div class="contacts-empty__icon"><v-icon size="30">mdi-account-search-outline</v-icon></div>
      <strong>Không tìm thấy khách hàng</strong>
      <span>Thử từ khóa khác hoặc bỏ bộ lọc đang chọn.</span>
      <v-btn v-if="filters.search || filters.status" size="small" variant="tonal" color="primary" @click="clearFilters">Xóa bộ lọc</v-btn>
    </div>

    <v-btn icon color="primary" size="large" class="contacts-fab" aria-label="Thêm khách hàng" @click="openCreate">
      <v-icon>mdi-plus</v-icon>
    </v-btn>

    <ContactDetailDialog v-model="showDialog" :contact="selectedContact" @saved="onSaved" @deleted="onDeleted" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import ContactDetailDialog from '@/components/contacts/ContactDetailDialog.vue';
import { STATUS_OPTIONS, useContacts } from '@/composables/use-contacts';
import type { Contact } from '@/composables/use-contacts';

const { contacts, total, loading, filters, fetchContacts } = useContacts();
const showDialog = ref(false);
const selectedContact = ref<Contact | null>(null);

function initials(name: string | null) {
  const parts = (name || 'KH').trim().split(/\s+/).filter(Boolean);
  return parts.slice(-2).map(part => part[0]?.toUpperCase()).join('') || 'KH';
}

function statusLabel(value: string) {
  return STATUS_OPTIONS.find(option => option.value === value)?.text ?? value;
}

function toggleStatus(value: string) {
  filters.status = value;
  void fetchContacts();
}

let searchTimeout: ReturnType<typeof setTimeout>;
function onSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => void fetchContacts(), 300);
}

function clearFilters() {
  filters.search = '';
  filters.status = '';
  void fetchContacts();
}

function openContact(contact: Contact) { selectedContact.value = contact; showDialog.value = true; }
function openCreate() { selectedContact.value = null; showDialog.value = true; }
function onSaved() { void fetchContacts(); }
function onDeleted() { void fetchContacts(); }

onMounted(() => void fetchContacts());
onUnmounted(() => clearTimeout(searchTimeout));
</script>

<style scoped>
.mobile-contacts { min-height: calc(100dvh - 120px); padding-bottom: 92px !important; color: var(--ink); background: var(--surface-2); font-family: var(--font); }
.contacts-head { display: flex; align-items: flex-end; justify-content: space-between; padding: 2px 4px; }
.contacts-eyebrow { color: var(--brand); font-size: 10px; font-weight: 800; letter-spacing: .08em; }
.contacts-head h1 { margin: 2px 0 0; font-size: 21px; line-height: 1.25; }
.contacts-total { color: var(--ink-3); font-size: 11.5px; font-weight: 700; }
.contacts-search :deep(.v-field) { background: var(--surface); border-radius: var(--r-sm); box-shadow: var(--sh-xs); }
.contacts-filters { display: flex; gap: 8px; overflow-x: auto; padding: 1px 2px 5px; scrollbar-width: none; }
.contacts-filters::-webkit-scrollbar { display: none; }
.filter-chip { min-height: 34px; flex: none; padding: 0 13px; color: var(--ink-2); background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-pill); font-family: var(--font); font-size: 11.5px; font-weight: 700; white-space: nowrap; }
.filter-chip.active { color: var(--surface); background: var(--brand); border-color: var(--brand); }
.contacts-list { display: flex; flex-direction: column; gap: 8px; }
.contact-card { display: flex; width: 100%; min-height: 76px; align-items: center; gap: 11px; padding: 11px 12px; color: inherit; text-align: left; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); box-shadow: var(--sh-xs); font-family: var(--font); }
.contact-card:active { background: var(--brand-softer); border-color: var(--brand-soft); }
.contact-avatar { flex: none; color: var(--brand-700); background: var(--brand-soft); font-size: 13px; font-weight: 800; }
.contact-main { min-width: 0; flex: 1; }
.contact-name { overflow: hidden; color: var(--ink); font-size: 13.5px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.contact-meta { display: flex; align-items: center; gap: 4px; margin-top: 3px; overflow: hidden; color: var(--ink-2); font-size: 11.5px; text-overflow: ellipsis; white-space: nowrap; }
.contact-owner { margin-top: 2px; overflow: hidden; color: var(--ink-3); font-size: 10.5px; text-overflow: ellipsis; white-space: nowrap; }
.contact-side { display: flex; min-width: 64px; flex-direction: column; align-items: flex-end; gap: 5px; }
.status-pill { padding: 3px 7px; color: var(--ink-2); background: var(--surface-3); border-radius: var(--r-pill); font-size: 9.5px; font-weight: 800; white-space: nowrap; }
.status-pill[data-status="new"] { color: var(--brand-700); background: var(--brand-soft); }
.status-pill[data-status="interested"] { color: color-mix(in srgb, var(--warning) 58%, var(--ink)); background: var(--warning-soft); }
.status-pill[data-status="converted"] { color: color-mix(in srgb, var(--success) 62%, var(--ink)); background: var(--success-soft); }
.status-pill[data-status="lost"] { color: var(--error); background: var(--error-soft); }
.conversation-count { display: flex; align-items: center; gap: 3px; color: var(--ink-3); font-size: 10px; font-weight: 700; }
.contacts-empty { display: flex; min-height: 300px; flex-direction: column; align-items: center; justify-content: center; gap: 7px; color: var(--ink-3); text-align: center; }
.contacts-empty__icon { display: grid; width: 58px; height: 58px; margin-bottom: 4px; place-items: center; color: var(--brand); background: var(--brand-soft); border-radius: var(--r-lg); }
.contacts-empty strong { color: var(--ink); font-size: 14px; }
.contacts-empty span { max-width: 260px; font-size: 12px; }
.contacts-fab { position: fixed !important; right: 16px; bottom: calc(76px + env(safe-area-inset-bottom)); z-index: 50; box-shadow: var(--sh-md) !important; }
.contact-skeleton { border: 1px solid var(--line); border-radius: var(--r-md); }
@media (max-width: 340px) { .mobile-contacts { padding-inline: 8px !important; } .contact-card { padding-inline: 9px; } }
</style>
