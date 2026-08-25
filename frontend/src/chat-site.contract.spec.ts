import { describe, expect, it } from 'vitest';
import packageSource from '../package.json?raw';
import html from '../chat.html?raw';
import router from './router/chat.ts?raw';
import config from '../vite.chat.config.ts?raw';
import nginx from '../deploy/chat-site.nginx.conf?raw';
import compose from '../deploy/docker-compose.chat.yml?raw';
import layout from './layouts/ChatSiteLayout.vue?raw';

describe('Nhà Yến Chat standalone site contract', () => {
  it('has a dedicated HTML entry and build command', () => {
    const packageJson = JSON.parse(packageSource) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.['build:chat']).toContain('vite.chat.config.ts');
    expect(html).toContain('/src/chat-main.ts');
    expect(html).toContain('<title>Nhà Yến Chat</title>');
  });

  it('reuses the production ChatView through a chat-only router', () => {
    expect(router).toContain("import('@/views/ChatView.vue')");
    expect(router).toContain("path: '/chat/:convId?'");
    expect(router).not.toContain('DashboardView');
    expect(router).not.toContain('PancakeOrdersView');
  });

  it('builds to an isolated directory so the CRM bundle is not overwritten', () => {
    expect(config).toContain("outDir: 'dist-chat'");
    expect(config).toContain("emptyOutDir: true");
  });

  it('owns the standalone header dimensions instead of relying on scoped CRM CSS', () => {
    expect(layout).toMatch(/\.chat-site-header\s*\{[\s\S]*height:\s*52px/);
    expect(layout).toMatch(/\.header-wordmark img\s*\{[\s\S]*width:\s*132px/);
    expect(layout).toMatch(/\.header-wordmark img\s*\{[\s\S]*height:\s*34px/);
    expect(layout).toMatch(/\.chat-site-main\s*\{[\s\S]*overflow:\s*hidden/);
  });

  it('ships as an isolated static service that proxies the existing backend', () => {
    expect(compose).toContain('127.0.0.1:3081:80');
    expect(nginx).toContain('try_files $uri $uri/ /chat.html');
    expect(nginx).toContain('proxy_pass http://app:3000/api/');
    expect(nginx).toContain('proxy_pass http://app:3000/socket.io/');
  });
});
