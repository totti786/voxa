import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceApp, createAppState } from '../../src/app.js';

describe('VoiceApp integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.WebSocket = vi.fn(() => ({
      send: vi.fn(),
      close: vi.fn(),
      readyState: 1,
    })) as unknown as typeof WebSocket;
    (global.WebSocket as any).OPEN = 1;
  });

  it('creates app with initial state', () => {
    const app = new VoiceApp('ws://test/ws');
    const state = app.store.getState();
    expect(state.connected).toBe(false);
    expect(state.peers).toEqual([]);
    expect(state.localMuted).toBe(false);
  });

  it('toggles mute state', () => {
    const app = new VoiceApp('ws://test/ws');
    app.setMute(true);
    expect(app.store.getState().localMuted).toBe(true);
    app.setMute(false);
    expect(app.store.getState().localMuted).toBe(false);
  });

  it('toggles deafen state', () => {
    const app = new VoiceApp('ws://test/ws');
    app.setDeafen(true);
    expect(app.store.getState().deafened).toBe(true);
    app.setDeafen(false);
    expect(app.store.getState().deafened).toBe(false);
  });
});
