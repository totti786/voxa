import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceApp } from '../../src/app.js';

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

  it('toggles mute state and pauses the producer', () => {
    const app = new VoiceApp('ws://test/ws');
    const producer = {
      paused: false,
      pause: vi.fn(function (this: any) {
        this.paused = true;
      }),
      resume: vi.fn(function (this: any) {
        this.paused = false;
      }),
    };
    app.producer = producer as any;

    app.setMute(true);
    expect(app.store.getState().localMuted).toBe(true);
    expect(producer.pause).toHaveBeenCalled();
    expect(producer.paused).toBe(true);

    app.setMute(false);
    expect(app.store.getState().localMuted).toBe(false);
    expect(producer.resume).toHaveBeenCalled();
    expect(producer.paused).toBe(false);
  });

  it('toggles deafen state', () => {
    const app = new VoiceApp('ws://test/ws');
    app.setDeafen(true);
    expect(app.store.getState().deafened).toBe(true);
    app.setDeafen(false);
    expect(app.store.getState().deafened).toBe(false);
  });

  it('gates outgoing audio with push-to-talk using the producer', () => {
    const app = new VoiceApp('ws://test/ws');
    const producer = {
      paused: false,
      pause: vi.fn(function (this: any) {
        this.paused = true;
      }),
      resume: vi.fn(function (this: any) {
        this.paused = false;
      }),
    };
    app.producer = producer as any;

    app.store.setState({ pttEnabled: true });
    app.setPttActive(false);
    expect(producer.pause).toHaveBeenCalled();
    expect(producer.paused).toBe(true);

    app.setPttActive(true);
    expect(producer.resume).toHaveBeenCalled();
    expect(producer.paused).toBe(false);
  });

  it('clears speaking state when push-to-talk is released', () => {
    const app = new VoiceApp('ws://test/ws');
    const setSpeaking = vi.spyOn(app.signaling, 'setSpeaking');
    app.store.setState({ pttEnabled: true, localSpeaking: true });

    app.setPttActive(false);
    expect(app.store.getState().localSpeaking).toBe(false);
    expect(setSpeaking).toHaveBeenCalledWith(false);
  });

  it('does not clear speaking state on PTT release when PTT is disabled', () => {
    const app = new VoiceApp('ws://test/ws');
    const setSpeaking = vi.spyOn(app.signaling, 'setSpeaking');
    app.store.setState({ pttEnabled: false, localSpeaking: true });

    app.setPttActive(false);
    expect(app.store.getState().localSpeaking).toBe(true);
    expect(setSpeaking).not.toHaveBeenCalled();
  });

  it('produces the processed audio track when an audio graph is available', async () => {
    const app = new VoiceApp('ws://test/ws');
    const rawTrack = { id: 'raw-track' } as MediaStreamTrack;
    const processedTrack = { id: 'processed-track' } as MediaStreamTrack;
    const produce = vi.fn().mockResolvedValue({ id: 'producer-1' });

    app.localStream = {
      getAudioTracks: () => [rawTrack],
    } as unknown as MediaStream;
    app.audioGraph = {
      outputStream: {
        getAudioTracks: () => [processedTrack],
      },
    } as unknown as ReturnType<typeof import('../../src/audio/processing.js').createAudioGraph>;
    app.sendTransport = {
      produce,
    } as unknown as typeof app.sendTransport;

    await (app as any).produceAudio();

    expect(produce).toHaveBeenCalledWith({ track: processedTrack });
  });

  it('creates mediasoup transports without forcing relay ICE', async () => {
    const app = new VoiceApp('ws://test/ws');
    const createSendTransport = vi.fn().mockReturnValue({
      on: vi.fn(),
    });
    app.device = {
      createSendTransport,
      createRecvTransport: vi.fn(),
      rtpCapabilities: {},
    } as any;

    await (app as any).handleServerMessage({
      type: 'transport_params',
      direction: 'send',
      id: 'transport-1',
      iceParameters: {},
      iceCandidates: [],
      dtlsParameters: {},
      iceServers: [],
    });

    expect(createSendTransport).toHaveBeenCalledWith(
      expect.not.objectContaining({ iceTransportPolicy: 'relay' })
    );
  });

  it('activates PTT on P key hold and auto-enables PTT mode', () => {
    const app = new VoiceApp('ws://test/ws');
    const producer = {
      paused: false,
      pause: vi.fn(function (this: any) { this.paused = true; }),
      resume: vi.fn(function (this: any) { this.paused = false; }),
    };
    app.producer = producer as any;

    expect(app.store.getState().pttEnabled).toBe(false);

    app.setPttActiveFromKey(true);
    expect(app.store.getState().pttEnabled).toBe(true);
    expect(app.store.getState().pttActive).toBe(true);

    app.setPttActiveFromKey(false);
    expect(app.store.getState().pttActive).toBe(false);
    expect(producer.pause).toHaveBeenCalled();
    expect(app.store.getState().pttEnabled).toBe(true);
  });

  it('toggles mute on M key via setMute', () => {
    const app = new VoiceApp('ws://test/ws');
    app.setMute(true);
    expect(app.store.getState().localMuted).toBe(true);
    app.setMute(false);
    expect(app.store.getState().localMuted).toBe(false);
  });

  it('toggles deafen on D key via setDeafen', () => {
    const app = new VoiceApp('ws://test/ws');
    app.setDeafen(true);
    expect(app.store.getState().deafened).toBe(true);
    app.setDeafen(false);
    expect(app.store.getState().deafened).toBe(false);
  });
});
