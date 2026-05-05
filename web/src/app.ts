import { Device } from 'mediasoup-client';
import type { Transport, Producer, Consumer, DtlsParameters, RtpParameters, RtpCapabilities, IceParameters, IceCandidate, MediaKind } from 'mediasoup-client/types';
import { SignalingClient, PROTOCOL_VERSION } from './signaling/client.js';
import { captureAudio, stopCapture, enumerateAudioDevices } from './audio/capture.js';
import { createAudioGraph, closeAudioGraph, setInputGain, setupMediaSession, teardownMediaSession } from './audio/processing.js';
import { VADAnalyzer } from './audio/vad.js';
import { Store } from './state/store.js';
import type { PeerInfo, ServerMessage, RoomSummary, ChatMessage, MessageEntry } from './types.js';

export interface AppState {
  connected: boolean;
  connecting: boolean;
  reconnecting: boolean;
  roomId: string | null;
  displayName: string;
  peers: PeerInfo[];
  localMuted: boolean;
  localSpeaking: boolean;
  deafened: boolean;
  inputGain: number;
  noiseGateThreshold: number;
  outputVolume: number;
  pttEnabled: boolean;
  pttActive: boolean;
  rooms: RoomSummary[];
  roomsLoading: boolean;
  joinError: string | null;
  selectedDeviceId: string | null;
  messages: MessageEntry[];
  selfPeerId: string | null;
  localIsOwner: boolean;
  localForceMuted: boolean;
  password?: string;
  audioDegraded: boolean;
  toast: string | null;
}

export function createAppState(): Store<AppState> {
  return new Store<AppState>({
    connected: false,
    connecting: false,
    reconnecting: false,
    roomId: null,
    displayName: '',
    peers: [],
    localMuted: false,
    localSpeaking: false,
    deafened: false,
    inputGain: 1.0,
    noiseGateThreshold: -45,
    outputVolume: 1.0,
    pttEnabled: false,
    pttActive: false,
    rooms: [],
    roomsLoading: false,
    joinError: null,
    selectedDeviceId: null,
    messages: [],
    selfPeerId: null,
    localIsOwner: false,
    localForceMuted: false,
    audioDegraded: false,
    toast: null,
  });
}

export class VoiceApp {
  store: Store<AppState>;
  signaling: SignalingClient;
  device: Device | null = null;
  sendTransport: Transport | null = null;
  recvTransport: Transport | null = null;
  producer: Producer | null = null;
  consumers = new Map<string, Consumer>();
  localStream: MediaStream | null = null;
  audioGraph: ReturnType<typeof createAudioGraph> | null = null;
  vad: VADAnalyzer | null = null;
  vadInterval: ReturnType<typeof setInterval> | null = null;
  fetchRoomsInterval: ReturnType<typeof setInterval> | null = null;
  remoteAudioElements = new Map<string, HTMLAudioElement>();
  peerVolumes = new Map<string, number>();
  private localAudioSetup = false;
  private wakeLock: WakeLockSentinel | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private readonly TRANSPORT_TIMEOUT_MS = 10000;
  private readonly TRANSPORT_MAX_RETRIES = 3;
  private transportRetryCount: Partial<Record<'send' | 'recv', number>> = {};
  private pendingProduceCallbacks: Array<(data: { id: string }) => void> = [];
  private pendingConsumers: Array<{ consumerId: string; producerId: string; peerId: string; kind: string; rtpParameters: unknown }> = [];
  private pendingTransportConnect: Partial<Record<'send' | 'recv', { callback: () => void; errback: (error: Error) => void; timeoutId: ReturnType<typeof setTimeout> }>> = {};
  private pKeyPttActive = false;

  constructor(signalingUrl: string) {
    this.store = createAppState();
    this.signaling = new SignalingClient(signalingUrl);
    this.setupSignalingHandlers();
  }

  async enumerateAudioDevices() {
    return enumerateAudioDevices();
  }

  async fetchRooms(): Promise<void> {
    this.store.setState({ roomsLoading: true });
    try {
      const res = await fetch('/api/rooms');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rooms: RoomSummary[] = await res.json();
      this.store.setState({ rooms, roomsLoading: false });
    } catch (err) {
      console.error('Failed to fetch rooms:', err);
      this.store.setState({ roomsLoading: false });
    }
  }

  startFetchRoomsLoop(): void {
    if (this.fetchRoomsInterval) return;
    this.fetchRoomsInterval = setInterval(() => this.fetchRooms(), 5000);
  }

  stopFetchRoomsLoop(): void {
    if (this.fetchRoomsInterval) {
      clearInterval(this.fetchRoomsInterval);
      this.fetchRoomsInterval = null;
    }
  }

  private setupSignalingHandlers(): void {
    this.signaling.onMessage((msg) => this.handleServerMessage(msg));
    this.signaling.onConnect(() => {
      const wasConnecting = this.store.getState().connecting;
      this.store.setState({ connected: true, connecting: false, reconnecting: false });
      if (wasConnecting) return;
      const state = this.store.getState();
      if (state.roomId && state.displayName) {
        this.signaling.send({ type: 'join', room: state.roomId, display_name: state.displayName, password: state.password });
      }
    });
    this.signaling.onDisconnect(() => {
      this.store.setState({ connected: false });
      this.cleanupCall();
    });
    this.signaling.onReconnecting(() => {
      this.store.setState({ reconnecting: true });
    });
    this.signaling.onVersionMismatch((serverVersion) => {
      this.store.setState({
        connecting: false,
        connected: false,
        joinError: `Client/server version mismatch. Please refresh the page. (Client: ${PROTOCOL_VERSION}, Server: ${serverVersion})`,
      });
    });
  }

  async join(roomId: string, displayName: string, password?: string): Promise<void> {
    this.store.setState({ connecting: true, roomId, displayName, joinError: null, password });
    localStorage.setItem('voxa-username', displayName);
    this.requestWakeLock();
    this.signaling.connect();
    const TIMEOUT_MS = 10000;
    const POLL_MS = 50;
    const maxAttempts = TIMEOUT_MS / POLL_MS;
    try {
      await new Promise<void>((resolve, reject) => {
        let attempts = 0;
        const check = () => {
          if (this.store.getState().connected) {
            resolve();
          } else if (attempts++ > maxAttempts) {
            this.signaling.disconnect();
            this.store.setState({ connecting: false, roomId: null, joinError: 'Connection timed out. Please try again.' });
            reject(new Error('Connection timed out'));
          } else {
            setTimeout(check, POLL_MS);
          }
        };
        check();
      });
      this.signaling.join(roomId, displayName, password);
      setupMediaSession(roomId);
    } catch (err) {
      console.error('[JOIN] Failed:', err);
    }
  }

  leave(): void {
    teardownMediaSession();
    this.signaling.leave();
    this.signaling.flushAndDisconnect();
    this.cleanupCall();
    this.releaseWakeLock();
    this.store.setState({ roomId: null, peers: [], connected: false, messages: [], selfPeerId: null, localIsOwner: false, localForceMuted: false, password: undefined });
  }

  sendChat(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.signaling.sendChat(trimmed);
    const ownPeerId = this.store.getState().peers.find((p) => p.display_name === this.store.getState().displayName)?.id || 'self';
    const msg: ChatMessage = {
      type: 'chat',
      peer_id: ownPeerId,
      text: trimmed,
      timestamp: Date.now(),
    };
    this.store.setState({ messages: [...this.store.getState().messages, msg] });
  }

  setMute(muted: boolean): void {
    if (!muted && this.store.getState().localForceMuted) {
      return;
    }
    this.store.setState({ localMuted: muted });
    this.signaling.setMute(muted);
    this.syncOutgoingAudioState();
  }

  kickPeer(peerId: string): void {
    this.signaling.kickPeer(peerId);
  }

  forceMutePeer(peerId: string, muted: boolean): void {
    this.signaling.forceMute(peerId, muted);
  }

  setDeafen(deafened: boolean): void {
    this.store.setState({ deafened });
    this.remoteAudioElements.forEach((el) => {
      el.muted = deafened;
    });
    this.consumers.forEach((consumer) => {
      if (deafened) {
        consumer.pause();
      } else {
        consumer.resume();
      }
    });
  }

  setInputGain(gain: number): void {
    this.store.setState({ inputGain: gain });
    if (this.audioGraph) {
      setInputGain(this.audioGraph, gain);
    }
  }

  setNoiseGateThreshold(thresholdDb: number): void {
    this.store.setState({ noiseGateThreshold: thresholdDb });
    if (this.vad) {
      this.vad = new VADAnalyzer(this.audioGraph!.analyzer, {
        thresholdDb,
        hysteresisDb: 6,
        smoothingFrames: 3,
      });
    }
  }

  setOutputVolume(volume: number): void {
    this.store.setState({ outputVolume: volume });
    this.remoteAudioElements.forEach((el, peerId) => {
      const peerVol = this.peerVolumes.get(peerId) ?? 1;
      el.volume = volume * peerVol;
    });
  }

  setPeerVolume(peerId: string, volume: number): void {
    this.peerVolumes.set(peerId, volume);
    const el = this.remoteAudioElements.get(peerId);
    if (el) {
      const masterVol = this.store.getState().outputVolume;
      el.volume = masterVol * volume;
    }
  }

  private syncOutgoingAudioState(): void {
    if (!this.producer) return;

    const state = this.store.getState();
    const shouldSend = !state.localMuted && (!state.pttEnabled || state.pttActive);

    if (shouldSend && this.producer.paused) {
      this.producer.resume();
    } else if (!shouldSend && !this.producer.paused) {
      this.producer.pause();
    }
  }

  togglePtt(): void {
    const state = this.store.getState();
    const next = !state.pttEnabled;
    if (!next && state.pttActive) {
      // Disabling PTT while actively holding: clear speaking state
      this.store.setState({ localSpeaking: false });
      this.signaling.setSpeaking(false);
    }
    this.store.setState({ pttEnabled: next, pttActive: false });
    this.syncOutgoingAudioState();
  }

  setPttActive(active: boolean): void {
    const state = this.store.getState();
    if (!active && state.pttEnabled && state.localSpeaking) {
      this.store.setState({ localSpeaking: false });
      this.signaling.setSpeaking(false);
    }
    this.store.setState({ pttActive: active });
    this.syncOutgoingAudioState();
  }

  setPttActiveFromKey(active: boolean): void {
    this.pKeyPttActive = active;
    const state = this.store.getState();
    if (active && !state.pttEnabled) {
      this.store.setState({ pttEnabled: true });
    }
    this.setPttActive(active);
  }

  isPKeyPttActive(): boolean {
    return this.pKeyPttActive;
  }

  async handleForegroundResume(): Promise<void> {
    // Resume AudioContext if suspended (mobile battery save)
    if (this.audioGraph?.context.state === 'suspended') {
      try {
        await this.audioGraph.context.resume();
      } catch (err) {
        console.error('[AUDIO] Failed to resume AudioContext:', err);
      }
    }

    // If the mic track was killed while backgrounded, re-capture it
    if (!this.localAudioSetup && this.store.getState().connected) {
      console.log('[AUDIO] Re-initializing microphone after background kill');
      await this.setupLocalAudio();
      if (this.producer && this.localStream) {
        const track =
          this.audioGraph?.outputStream.getAudioTracks()[0] ??
          this.localStream.getAudioTracks()[0];
        if (track && track.readyState === 'live') {
          try {
            await this.producer.replaceTrack({ track });
            this.store.setState({ audioDegraded: false, toast: null });
            this.syncOutgoingAudioState();
          } catch (err) {
            console.error('[AUDIO] Failed to replace track on producer:', err);
            // Fall back: close old producer and create new one
            this.producer.close();
            this.producer = null;
            await this.produceAudio();
            this.store.setState({ audioDegraded: false, toast: null });
          }
        }
      }
    }
  }

  async requestWakeLock(): Promise<void> {
    if ('wakeLock' in navigator) {
      try {
        const lock = await (navigator as any).wakeLock.request('screen');
        lock.addEventListener('release', () => {
          console.log('[WAKE LOCK] Screen wake lock released');
        });
        this.wakeLock = lock;
        console.log('[WAKE LOCK] Screen wake lock acquired');
      } catch (err) {
        console.error('[WAKE LOCK] Failed to acquire wake lock:', err);
      }
    }
  }

  releaseWakeLock(): void {
    if (this.wakeLock) {
      this.wakeLock.release();
      this.wakeLock = null;
    }
  }

  getFrequencyData(): Uint8Array | null {
    if (!this.audioGraph?.analyzer) return null;
    if (!this.freqData) {
      this.freqData = new Uint8Array(this.audioGraph.analyzer.frequencyBinCount);
    }
    this.audioGraph.analyzer.getByteFrequencyData(this.freqData);
    return this.freqData;
  }

  private async setupLocalAudio(): Promise<void> {
    if (this.localAudioSetup) return;
    this.localAudioSetup = true;
    try {
      const deviceId = this.store.getState().selectedDeviceId;
      this.localStream = await captureAudio(deviceId ? { deviceId } : {});

      // Detect when the mic track is killed by the OS (mobile backgrounding)
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.onended = () => {
          console.warn('[AUDIO] Microphone track ended (OS background kill)');
          this.localAudioSetup = false;
          this.store.setState({ audioDegraded: true, toast: 'Microphone disconnected — tap to re-enable when ready' });
        };
      }
    } catch (err) {
      console.error('[AUDIO] Failed to get microphone:', err);
      alert('Microphone access is required. Please allow microphone access and try again.');
      return;
    }
    this.audioGraph = createAudioGraph(this.localStream);
    try {
      if (this.audioGraph.context.state !== 'running') {
        await this.audioGraph.context.resume();
      }
    } catch (err) {
      console.error('[AUDIO] Failed to start audio processing graph, falling back to raw track:', err);
      closeAudioGraph(this.audioGraph);
      this.audioGraph = null;
      this.store.setState({ audioDegraded: true, toast: 'Audio processing unavailable — using raw microphone' });
    }

    if (this.audioGraph) {
      this.vad = new VADAnalyzer(this.audioGraph.analyzer, {
        thresholdDb: this.store.getState().noiseGateThreshold,
      });
    } else {
      this.vad = null;
    }

    this.vadInterval = setInterval(() => {
      if (!this.vad || this.store.getState().localMuted) return;
      const state = this.store.getState();
      if (state.pttEnabled && !state.pttActive) return;
      const speaking = this.vad.analyze();
      if (speaking !== state.localSpeaking) {
        this.store.setState({ localSpeaking: speaking });
        this.signaling.setSpeaking(speaking);
      }
    }, 100);

    if (this.sendTransport) {
      await this.produceAudio();
    }
  }

  private async produceAudio(): Promise<void> {
    if (this.producer) return;
    if (!this.sendTransport || !this.localStream) {
      return;
    }
    const track =
      this.audioGraph?.outputStream.getAudioTracks()[0] ??
      this.localStream.getAudioTracks()[0];
    if (!track) {
      return;
    }
    try {
      this.producer = await this.sendTransport.produce({ track });
      this.syncOutgoingAudioState();
    } catch (err) {
      console.error('[AUDIO] Failed to produce:', err);
    }
  }

  private consumeRemoteAudio(consumerId: string, producerId: string, peerId: string, kind: string, rtpParameters: unknown): void {
    if (!this.recvTransport) return;
    this.recvTransport.consume({
      id: consumerId,
      producerId,
      kind: kind as 'audio',
      rtpParameters: rtpParameters as RtpParameters,
    }).then((consumer) => {
      this.consumers.set(consumerId, consumer);
      consumer.resume();
      this.signaling.resumeConsumer(consumerId);
      if (consumer.track) {
        this.playRemoteAudio(peerId, consumer.track);
      }
    }).catch((err) => console.error('[AUDIO] Failed to consume:', err));
  }

  private playRemoteAudio(peerId: string, track: MediaStreamTrack): void {

    let el = this.remoteAudioElements.get(peerId);
    if (!el) {
      el = document.createElement('audio');
      el.autoplay = true;
      el.setAttribute('playsinline', 'true');
      el.preload = 'auto';
      el.muted = true;
      el.volume = 1;
      el.style.position = 'absolute';
      el.style.opacity = '0';
      document.body.appendChild(el);
      this.remoteAudioElements.set(peerId, el);
    }

    // Start muted so browser autoplay policy doesn't block the first remote track.
    // Once playback is live, unmute unless the user explicitly deafened.
    const shouldBeMuted = this.store.getState().deafened;
    const peerVol = this.peerVolumes.get(peerId) ?? 1;
    const masterVol = this.store.getState().outputVolume;
    el.volume = masterVol * peerVol;
    const stream = new MediaStream([track]);
    el.srcObject = stream;
    el.muted = true;
    el.play().then(() => {
      el!.muted = shouldBeMuted;
    }).catch((err) => {
      console.error('[AUDIO] Failed to play remote audio:', err.name, err.message);
    });
  }

  private cleanupCall(): void {
    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }
    if (this.audioGraph) {
      closeAudioGraph(this.audioGraph);
      this.audioGraph = null;
    }
    if (this.localStream) {
      stopCapture(this.localStream);
      this.localStream = null;
    }
    if (this.producer) {
      this.producer.close();
      this.producer = null;
    }
    this.consumers.forEach((c) => c.close());
    this.consumers.clear();
    if (this.sendTransport) {
      this.sendTransport.close();
      this.sendTransport = null;
    }
    if (this.recvTransport) {
      this.recvTransport.close();
      this.recvTransport = null;
    }
    this.device = null;
    this.remoteAudioElements.forEach((el) => el.remove());
    this.remoteAudioElements.clear();
    this.pendingConsumers = [];
    this.clearPendingCallbacks();
    this.localAudioSetup = false;
    this.store.setState({ peers: [], selfPeerId: null });
  }

  private clearPendingCallbacks(): void {
    for (const key of Object.keys(this.pendingTransportConnect) as Array<'send' | 'recv'>) {
      const pending = this.pendingTransportConnect[key];
      if (pending) {
        clearTimeout(pending.timeoutId);
        pending.errback(new Error('Connection closed'));
        delete this.pendingTransportConnect[key];
      }
    }
    this.pendingProduceCallbacks = [];
  }

  private async handleServerMessage(msg: ServerMessage): Promise<void> {
    switch (msg.type) {
      case 'joined': {
        const prevSelfId = this.store.getState().selfPeerId;
        const dedupedPeers = msg.peers.reduce<PeerInfo[]>((acc, p) => {
          const existingIdx = acc.findIndex((ep) => ep.display_name === p.display_name);
          if (existingIdx === -1) {
            acc.push(p);
          } else if (p.id === msg.self_peer_id) {
            acc[existingIdx] = p;
          } else if (prevSelfId && acc[existingIdx].id === prevSelfId) {
            acc[existingIdx] = p;
          }
          return acc;
        }, []);
        this.store.setState({
          peers: dedupedPeers,
          selfPeerId: msg.self_peer_id,
          localIsOwner: msg.is_owner,
        });
        this.setupLocalAudio();
        break;
      }
      case 'peer_joined': {
        const peers = this.store.getState().peers;
        const existingIdx = peers.findIndex((p) => p.display_name === msg.peer.display_name);
        if (existingIdx !== -1) {
          const nextPeers = [...peers];
          nextPeers[existingIdx] = msg.peer;
          this.store.setState({
            peers: nextPeers,
          });
        } else {
          this.store.setState({
            peers: [...peers, msg.peer],
            messages: [...this.store.getState().messages, { type: 'system', event: 'peer_joined', peer_id: msg.peer.id, timestamp: Date.now() }],
          });
        }
        break;
      }
      case 'peer_left': {
        const peers = this.store.getState().peers.filter((p) => p.id !== msg.peer_id);
        this.store.setState({
          peers,
          messages: [...this.store.getState().messages, { type: 'system', event: 'peer_left', peer_id: msg.peer_id, timestamp: Date.now() }],
        });
        this.remoteAudioElements.get(msg.peer_id)?.remove();
        this.remoteAudioElements.delete(msg.peer_id);
        this.peerVolumes.delete(msg.peer_id);
        for (const [consumerId, consumer] of this.consumers) {
          if (consumer.appData && (consumer.appData as Record<string, unknown>).producerPeerId === msg.peer_id) {
            consumer.close();
            this.consumers.delete(consumerId);
          }
        }
        break;
      }
      case 'peer_mute': {
        const peers = this.store.getState().peers.map((p) =>
          p.id === msg.peer_id ? { ...p, muted: msg.muted } : p
        );
        this.store.setState({
          peers,
          messages: [...this.store.getState().messages, { type: 'system', event: 'peer_mute', peer_id: msg.peer_id, timestamp: Date.now() }],
        });
        break;
      }
      case 'peer_speaking': {
        const peers = this.store.getState().peers.map((p) =>
          p.id === msg.peer_id ? { ...p, speaking: msg.speaking } : p
        );
        this.store.setState({ peers });
        break;
      }
      case 'ownership_changed': {
        const state = this.store.getState();
        const isSelf = msg.peer_id === state.selfPeerId;
        const peers = state.peers.map((p) =>
          p.id === msg.peer_id ? { ...p, is_owner: true } : { ...p, is_owner: false }
        );
        this.store.setState({
          peers,
          localIsOwner: isSelf,
          messages: [...this.store.getState().messages, { type: 'system', event: 'ownership_changed', peer_id: msg.peer_id, timestamp: Date.now() }],
        });
        break;
      }
      case 'peer_force_muted': {
        const state = this.store.getState();
        const isSelf = msg.peer_id === state.selfPeerId;
        const peers = state.peers.map((p) =>
          p.id === msg.peer_id ? { ...p, force_muted: msg.muted } : p
        );
        if (isSelf) {
          this.store.setState({
            peers,
            localForceMuted: msg.muted,
            localMuted: msg.muted,
            messages: [...this.store.getState().messages, { type: 'system', event: 'peer_force_muted', peer_id: msg.peer_id, timestamp: Date.now() }],
          });
          this.syncOutgoingAudioState();
        } else {
          this.store.setState({
            peers,
            messages: [...this.store.getState().messages, { type: 'system', event: 'peer_force_muted', peer_id: msg.peer_id, timestamp: Date.now() }],
          });
        }
        break;
      }
      case 'kicked': {
        this.store.setState({
          messages: [...this.store.getState().messages, { type: 'system', event: 'kicked', peer_id: this.store.getState().selfPeerId ?? '', timestamp: Date.now() }],
        });
        this.leave();
        this.store.setState({ joinError: 'You were kicked from the room.' });
        break;
      }
      case 'router_capabilities': {
        this.device = new Device();
        await this.device.load({ routerRtpCapabilities: msg.rtpCapabilities as RtpCapabilities });
        this.signaling.sendRtpCapabilities(this.device.rtpCapabilities);
        break;
      }
      case 'transport_params': {
        if (!this.device) {
          return;
        }
        const params = {
          id: msg.id,
          iceParameters: msg.iceParameters as IceParameters,
          iceCandidates: msg.iceCandidates as IceCandidate[],
          dtlsParameters: msg.dtlsParameters as DtlsParameters,
          iceServers: msg.iceServers as RTCIceServer[] | undefined,
        };
        if (msg.direction === 'send') {
          this.sendTransport = this.device.createSendTransport(params);
          this.sendTransport.on('connect', ({ dtlsParameters }: { dtlsParameters: DtlsParameters }, callback: () => void, errback: (error: Error) => void) => {
            const timeoutId = setTimeout(() => {
              const p = this.pendingTransportConnect.send;
              if (p) {
                p.errback(new Error('Transport connection timeout'));
                delete this.pendingTransportConnect.send;
              }
            }, this.TRANSPORT_TIMEOUT_MS);
            this.pendingTransportConnect.send = { callback, errback, timeoutId };
            this.signaling.connectTransport('send', dtlsParameters);
          });
          this.sendTransport.on('produce', ({ kind, rtpParameters }: { kind: MediaKind; rtpParameters: RtpParameters }, callback: (data: { id: string }) => void) => {
            if (kind === 'audio') {
              this.signaling.produce(kind, rtpParameters);
            }
            this.pendingProduceCallbacks.push(callback);
          });
        } else {
          this.recvTransport = this.device.createRecvTransport(params);
          this.recvTransport.on('connect', ({ dtlsParameters }: { dtlsParameters: DtlsParameters }, callback: () => void, errback: (error: Error) => void) => {
            const timeoutId = setTimeout(() => {
              const p = this.pendingTransportConnect.recv;
              if (p) {
                p.errback(new Error('Transport connection timeout'));
                delete this.pendingTransportConnect.recv;
              }
            }, this.TRANSPORT_TIMEOUT_MS);
            this.pendingTransportConnect.recv = { callback, errback, timeoutId };
            this.signaling.connectTransport('recv', dtlsParameters);
          });
          if (this.pendingConsumers.length > 0) {
            const pending = [...this.pendingConsumers];
            this.pendingConsumers = [];
            for (const pc of pending) {
              this.consumeRemoteAudio(pc.consumerId, pc.producerId, pc.peerId, pc.kind, pc.rtpParameters);
            }
          }
        }
        if (this.sendTransport && this.localStream) {
          await this.produceAudio();
        }
        break;
      }
      case 'producer_created': {
        const callback = this.pendingProduceCallbacks.shift();
        if (callback) {
          callback({ id: msg.producerId });
        }
        break;
      }
      case 'transport_connected': {
        const pending = this.pendingTransportConnect[msg.direction];
        if (pending) {
          clearTimeout(pending.timeoutId);
          pending.callback();
          delete this.pendingTransportConnect[msg.direction];
        }
        break;
      }
      case 'transport_failed': {
        const pending = this.pendingTransportConnect[msg.direction];
        if (pending) {
          clearTimeout(pending.timeoutId);
          delete this.pendingTransportConnect[msg.direction];
        }
        const retries = (this.transportRetryCount[msg.direction] || 0) + 1;
        if (retries <= this.TRANSPORT_MAX_RETRIES) {
          console.warn(`Transport ${msg.direction} failed, retrying (${retries}/${this.TRANSPORT_MAX_RETRIES})...`);
          this.transportRetryCount[msg.direction] = retries;
          // Retry after backoff
          setTimeout(() => {
            const transport = msg.direction === 'send' ? this.sendTransport : this.recvTransport;
            if (transport) {
              // Trigger reconnect
              this.signaling.connectTransport(msg.direction, (transport as any)._data?.dtlsParameters);
            }
          }, Math.min(1000 * Math.pow(2, retries - 1), 8000));
        } else {
          console.error('Transport setup failed after max retries:', msg.direction, msg.message);
          this.store.setState({ toast: `Connection failed — please try rejoining the room.` });
          if (pending) pending.errback(new Error(msg.message));
        }
        break;
      }
      case 'consumer_created': {
        if (!this.recvTransport) {
          this.pendingConsumers.push({
            consumerId: msg.consumerId,
            producerId: msg.producerId,
            peerId: msg.peerId,
            kind: msg.kind,
            rtpParameters: msg.rtpParameters,
          });
          return;
        }
        this.consumeRemoteAudio(msg.consumerId, msg.producerId, msg.peerId, msg.kind, msg.rtpParameters);
        break;
      }
      case 'producer_closed': {
        const consumer = Array.from(this.consumers.values()).find(
          (c) => c.producerId === msg.producerId
        );
        if (consumer) {
          consumer.close();
          this.consumers.delete(consumer.id);
        }
        this.remoteAudioElements.get(msg.peerId)?.remove();
        this.remoteAudioElements.delete(msg.peerId);
        this.peerVolumes.delete(msg.peerId);
        break;
      }
      case 'chat': {
        this.store.setState({ messages: [...this.store.getState().messages, msg] });
        break;
      }
      case 'error': {
        console.error('Server error:', msg.message);
        this.store.setState({ toast: msg.message });
        setTimeout(() => {
          if (this.store.getState().toast === msg.message) {
            this.store.setState({ toast: null });
          }
        }, 5000);
        break;
      }
    }
  }
}
