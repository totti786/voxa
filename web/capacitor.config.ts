import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.voxa.app',
  appName: 'Voxa',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    webContentsDebuggingEnabled: true,
  },
};

export default config;
