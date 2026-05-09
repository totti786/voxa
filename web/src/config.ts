import { Capacitor } from '@capacitor/core';

let isNative = false;
try {
  isNative = Capacitor.isNativePlatform();
} catch (_) {}
export const SERVER_BASE = isNative ? 'https://voxa.deshli.site' : '';
