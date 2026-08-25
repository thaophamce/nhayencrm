<template>
  <AuthLayout v-if="route.meta.layout === 'auth'">
    <RouterView />
  </AuthLayout>
  <ChatSiteLayout v-else>
    <RouterView />
  </ChatSiteLayout>
  <ConfirmHost />
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import AuthLayout from '@/layouts/AuthLayout.vue';
import ChatSiteLayout from '@/layouts/ChatSiteLayout.vue';
import ConfirmHost from '@/components/ui/ConfirmHost.vue';
import { useAuthStore } from '@/stores/auth';
import { usePrivacyStore } from '@/stores/privacy';

const route = useRoute();
const auth = useAuthStore();
const privacy = usePrivacyStore();

watch(
  () => auth.user?.id,
  (userId) => {
    if (userId) privacy.fetchStatus(true).catch(() => {});
  },
  { immediate: true },
);
</script>
