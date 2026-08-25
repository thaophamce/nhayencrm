import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ChatSiteApp from './ChatSiteApp.vue';
import { router } from './router/chat';
import { vuetify } from './plugins/vuetify';
import './assets/tokens.css';
import './assets/main.css';
import './assets/rbac-page.css';
import './assets/hs-crm-theme.css';

const app = createApp(ChatSiteApp);
app.use(createPinia());
app.use(router);
app.use(vuetify);
app.mount('#app');
