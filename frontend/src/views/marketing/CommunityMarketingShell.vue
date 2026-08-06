<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  CommunityMarketingShell — menu Marketing cho bản COMMUNITY (open-core).
  Nav hiện chỉ hiện: Gửi tin nhắn bạn bè, Gửi tin hàng loạt. Quét nhóm/Tệp khách hàng/
  Khối nội dung bị ẩn khỏi menu 2026-07 (route vẫn đăng ký, chỉ không link từ nav).
  KHÔNG chứa chức năng EE (triggers/sequences/care…). Route /marketing này chỉ đăng ký
  khi !isExtension (xem router/index.ts) nên KHÔNG đụng shell Marketing của EE.
-->
<template>
  <div class="ce-marketing-shell">
    <aside class="ce-mkt-sidebar">
      <nav class="ce-mkt-nav">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="ce-mkt-link"
          :class="{ 'is-active': isActive(item.to) }"
        >
          <v-icon size="18">{{ item.icon }}</v-icon>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
    </aside>
    <main class="ce-mkt-content">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';

const route = useRoute();

const navItems = [
  { to: '/marketing/friend-blast', label: 'Gửi tin nhắn bạn bè', icon: 'mdi-message-fast-outline' },
  { to: '/marketing/group-blast', label: 'Gửi tin nhắn nhóm', icon: 'mdi-account-group-outline' },
  { to: '/marketing/unfriend-blast', label: 'Huỷ kết bạn hàng loạt', icon: 'mdi-account-minus-outline' },
  { to: '/marketing/group-leave-blast', label: 'Rời nhóm hàng loạt', icon: 'mdi-logout-variant' },
];

function isActive(to: string): boolean {
  return route.path === to || route.path.startsWith(to + '/');
}
</script>

<style scoped>
.ce-marketing-shell { display: flex; height: 100%; min-height: 0; background: #1A6FD4; }
.ce-mkt-sidebar {
  flex: 0 0 220px; border-right: 1px solid rgba(255, 255, 255, 0.16);
  background: #1A6FD4; display: flex; flex-direction: column; padding: 12px 8px;
}
.ce-mkt-header {
  display: flex; align-items: center; gap: 8px; padding: 8px 10px 12px;
  font-weight: 700; color: #ffffff; font-size: 15px;
}
.ce-mkt-nav { display: flex; flex-direction: column; gap: 2px; }
.ce-mkt-link {
  display: flex; align-items: center; gap: 10px; padding: 9px 12px;
  border-radius: 8px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;
}
.ce-mkt-link:hover { background: rgba(255, 255, 255, 0.12); }
.ce-mkt-link.is-active {
  background: rgba(255, 255, 255, 0.20); color: #ffffff;
  box-shadow: inset 3px 0 0 #ffffff; font-weight: 700;
}
.ce-mkt-content { flex: 1 1 auto; min-width: 0; overflow: auto; background: #F7F8FC; border-top-left-radius: 24px; }

@media (max-width: 768px) {
  .ce-marketing-shell { flex-direction: column; }
  .ce-mkt-sidebar { flex: 0 0 auto; border-right: none; border-bottom: 1px solid rgba(255, 255, 255, 0.16); }
  .ce-mkt-nav { flex-direction: row; overflow-x: auto; }
  .ce-mkt-content { border-top-left-radius: 0; }
}
</style>
