import { registerPlugin } from '@capacitor/core';

interface VoiceCallKeepAlivePlugin {
  start(): Promise<void>;
  stop(): Promise<void>;
}

const VoiceCallKeepAlive = registerPlugin<VoiceCallKeepAlivePlugin>('VoiceCallKeepAlive');

export async function startKeepAlive(): Promise<void> {
  try {
    await VoiceCallKeepAlive.start();
  } catch (_) {
    // Not running in Capacitor (web browser) — no-op
  }
}

export async function stopKeepAlive(): Promise<void> {
  try {
    await VoiceCallKeepAlive.stop();
  } catch (_) {
    // Not running in Capacitor (web browser) — no-op
  }
}
