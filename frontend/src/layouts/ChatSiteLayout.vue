<template>
  <v-app class="smax-app chat-site-app">
    <header class="smax-topnav chat-site-header">
      <a class="header-wordmark" href="/chat" title="Nhà Yến Chat">
        <img src="/brand/brand-lockup-horizontal.png" alt="Nhà Yến Chat" />
      </a>
      <span class="chat-site-name">Nhà Yến Chat</span>
      <span class="chat-site-badge">Tin nhắn</span>
      <div class="topnav-spacer" />
      <a class="chat-site-crm-link" :href="crmUrl">Mở Nhà Yến CRM</a>
      <button class="chat-site-user" type="button" :title="auth.user?.fullName || 'Tài khoản'">
        <Avatar :src="auth.user?.avatarUrl" :name="auth.user?.fullName || 'U'" :size="30" :platform="null" />
        <span>{{ auth.user?.fullName }}</span>
      </button>
      <button class="chat-site-logout" type="button" @click="logout">Đăng xuất</button>
    </header>
    <v-main class="smax-main chat-site-main">
      <slot />
    </v-main>
    <ToastContainer />
  </v-app>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import Avatar from '@/components/ui/Avatar.vue';
import ToastContainer from '@/components/ui/ToastContainer.vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const crmUrl = import.meta.env.VITE_CRM_URL || 'https://nhayencrm.com';

function logout() {
  auth.logout();
  void router.replace('/login');
}
</script>

<style scoped>
.chat-site-header {
  background: #1a6fd4;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 52px;
  max-height: 52px;
  min-height: 52px;
  overflow: hidden;
  padding: 0 16px;
  position: sticky;
  top: 0;
  width: 100%;
  z-index: 100;
}

.header-wordmark {
  align-items: center;
  display: flex;
  flex: 0 0 148px;
  height: 34px;
  justify-content: center;
  overflow: hidden;
  width: 148px;
}

.header-wordmark img {
  display: block;
  height: 34px;
  max-height: 34px;
  max-width: 132px;
  object-fit: contain;
  width: 132px;
}

.chat-site-main {
  min-height: 0;
  overflow: hidden;
}

.chat-site-name {
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
}

.chat-site-badge {
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 999px;
  color: rgba(255, 255, 255, 0.84);
  font-size: 11px;
  padding: 3px 8px;
}

.chat-site-crm-link,
.chat-site-logout {
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  text-decoration: none;
}

.chat-site-crm-link:hover,
.chat-site-logout:hover {
  color: #fff;
}

.chat-site-user {
  align-items: center;
  color: #fff;
  display: flex;
  font-size: 12px;
  gap: 8px;
  max-width: 190px;
}

.chat-site-user span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-site-logout {
  border-left: 1px solid rgba(255, 255, 255, 0.2);
  padding-left: 12px;
}

@media (max-width: 900px) {
  .chat-site-name,
  .chat-site-badge,
  .chat-site-crm-link,
  .chat-site-user span {
    display: none;
  }
}
</style>
