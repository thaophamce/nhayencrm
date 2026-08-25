import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/use-toast';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginView.vue'),
    meta: { layout: 'auth' },
  },
  {
    path: '/setup',
    redirect: '/login',
  },
  {
    path: '/setup-password',
    name: 'SetupPassword',
    component: () => import('@/views/ForcePasswordChangeView.vue'),
    meta: { layout: 'auth', requiresAuth: true, allowUnchangedPassword: true },
  },
  {
    path: '/select-account',
    name: 'SelectAccount',
    component: () => import('@/views/SelectAccountView.vue'),
    meta: { layout: 'auth', requiresAuth: true, resource: 'conversation' },
  },
  {
    path: '/chat/:convId?',
    name: 'Chat',
    component: () => import('@/views/ChatView.vue'),
    meta: { requiresAuth: true, resource: 'conversation' },
  },
  { path: '/', redirect: '/chat' },
  { path: '/:pathMatch(.*)*', redirect: '/chat' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();

  if (to.name === 'Login') return true;
  if (!to.meta.requiresAuth) return true;
  if (!auth.token) return { path: '/login', query: { redirect: to.fullPath } };

  if (!auth.user) {
    await auth.init();
    if (!auth.isAuthenticated) return { path: '/login', query: { redirect: to.fullPath } };
  }

  if (auth.user?.passwordChangedAt === null && !to.meta.allowUnchangedPassword) {
    return '/setup-password';
  }
  if (auth.user?.passwordChangedAt !== null && to.meta.allowUnchangedPassword) {
    return '/chat';
  }

  const resource = to.meta.resource as string | undefined;
  if (resource && !auth.canAccess(resource)) {
    try {
      useToast().error('Bạn không có quyền sử dụng Nhà Yến Chat');
    } catch {
      // Toast host may not be mounted during the first navigation.
    }
    return false;
  }

  return true;
});

router.afterEach((to) => {
  document.title = to.name === 'Login' ? 'Đăng nhập · Nhà Yến Chat' : 'Nhà Yến Chat';
});
