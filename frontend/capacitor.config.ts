import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zalocrm.app',
  appName: 'ZaloCRM',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
