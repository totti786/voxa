import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.voxa.app',
  appName: 'Voxa',
  webDir: 'dist',
  server: {
    url: 'https://voxa.deshli.site',
    cleartext: false,
  },
  android: {
    webContentsDebuggingEnabled: true,
  },
};

export default config;
