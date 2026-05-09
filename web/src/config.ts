import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();
export const SERVER_BASE = isNative ? 'https://voxa.deshli.site' : '';
