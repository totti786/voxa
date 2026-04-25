import { Device } from 'mediasoup-client';
import type { Transport, Producer, Consumer, DtlsParameters, RtpParameters, RtpCapabilities, IceParameters, IceCandidate, MediaKind } from 'mediasoup-client/types';
import { SignalingClient } from './signaling/client.js';
import { captureAudio, stopCapture } from './audio/capture.js';
import { createAudioGraph, closeAudioGraph, setInputGain } from './audio/processing.js';
import { VADAnalyzer } from './audio/vad.js';
import { Store } from './state/store.js';
import type { PeerInfo, ServerMessage, RoomSummary } from './types.js';

export interface AppState {
  connected: boolean;
  connecting: boolean;
  roomId: string | null;
  displayName: string;
  peers: PeerInfo[];
  localMuted: boolean;
  localSpeaking: boolean;
  deafened: boolean;
  inputGain: number;
  noiseGateThreshold: number;
  pttEnabled: boolean;
  pttActive: boolean;
  rooms: RoomSummary[];
  roomsLoading: boolean;
}

export function createAppState(): Store<AppState> {
  return new Store<AppState>({
    connected: false,
    connecting: false,
    roomId: null,
    displayName: '',
    peers: [],
    localMuted: false,
    localSpeaking: false,
    deafened: false,
    inputGain: 1.0,
    noiseGateThreshold: -45,
    pttEnabled: false,
    pttActive: false,
    rooms: [],
    roomsLoading: false,
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
  remoteAudioElements = new Map<string, HTMLAudioElement>();
  private pendingProduceCallbacks: Array<(data: { id: string }) => void> = [];
  private pendingConsumers: Array<{ consumerId: string; producerId: string; peerId: string; kind: string; rtpParameters: unknown }> = [];
  private pendingTransportConnect: Partial<Record<'send' | 'recv', { callback: () => void; errback: (error: Error) => void }>> = {};

  constructor(signalingUrl: string) {
    this.store = createAppState();
    this.signaling = new SignalingClient(signalingUrl);
    this.setupSignalingHandlers();
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

  private setupSignalingHandlers(): void {
    this.signaling.onMessage((msg) => this.handleServerMessage(msg));
    this.signaling.onConnect(() => {
      this.store.setState({ connected: true, connecting: false });
    });
    this.signaling.onDisconnect(() => {
      this.store.setState({ connected: false });
      this.cleanupCall();
    });
  }

  async join(roomId: string, displayName: string, password?: string): Promise<void> {
    this.store.setState({ connecting: true, roomId, displayName });
    this.signaling.connect();
    const TIMEOUT_MS = 10000;
    const POLL_MS = 50;
    const maxAttempts = TIMEOUT_MS / POLL_MS;
    await new Promise<void>((resolve, reject) => {
      let attempts = 0;
      const check = () => {
        if (this.store.getState().connected) {
          resolve();
        } else if (attempts++ > maxAttempts) {
          this.signaling.disconnect();
          this.store.setState({ connecting: false, roomId: null });
          reject(new Error('Connection timed out'));
        } else {
          setTimeout(check, POLL_MS);
        }
      };
      check();
    });
    this.signaling.join(roomId, displayName, password);
  }

  leave(): void {
    this.signaling.leave();
    this.signaling.disconnect();
    this.cleanupCall();
    this.store.setState({ roomId: null, peers: [], connected: false });
  }

  setMute(muted: boolean): void {
    this.store.setState({ localMuted: muted });
    this.signaling.setMute(muted);
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((t) => (t.enabled = !muted));
    }
    if (this.producer) {
      if (muted) {
        this.producer.pause();
      } else {
        this.producer.resume();
      }
    }
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

  setPttActive(active: boolean): void {
    this.store.setState({ pttActive: active });
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((t) => (t.enabled = active));
    }
  }

  getFrequencyData(): Uint8Array | null {
    if (!this.audioGraph) return null;
    const data = new Uint8Array(this.audioGraph.analyzer.frequencyBinCount);
    this.audioGraph.analyzer.getByteFrequencyData(data);
    return data;
  }

  private async setupLocalAudio(): Promise<void> {
    console.log('[AUDIO] Setting up local audio capture...');
    console.log('[AUDIO] sendTransport exists:', !!this.sendTransport);
    try {
      this.localStream = await captureAudio();
    } catch (err) {
      console.error('[AUDIO] Failed to get microphone:', err);
      alert('Microphone access is required. Please allow microphone access and try again.');
      return;
    }
    console.log('[AUDIO] Local stream acquired, tracks:', this.localStream.getAudioTracks().length);
    this.audioGraph = createAudioGraph(this.localStream);
    try {
      if (this.audioGraph.context.state !== 'running') {
        await this.audioGraph.context.resume();
      }
    } catch (err) {
      console.error('[AUDIO] Failed to start audio processing graph, falling back to raw track:', err);
      closeAudioGraph(this.audioGraph);
      this.audioGraph = null;
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
      const speaking = this.vad.analyze();
      if (speaking !== this.store.getState().localSpeaking) {
        this.store.setState({ localSpeaking: speaking });
        this.signaling.setSpeaking(speaking);
      }
    }, 100);

    if (this.sendTransport) {
      console.log('[AUDIO] sendTransport already exists, producing audio now');
      await this.produceAudio();
    } else {
      console.log('[AUDIO] No sendTransport yet, will produce when transport_params arrives');
    }
  }

  private async produceAudio(): Promise<void> {
    if (!this.sendTransport || !this.localStream) {
      console.log('[AUDIO] Cannot produce: sendTransport=', !!this.sendTransport, 'localStream=', !!this.localStream);
      return;
    }
    const track =
      this.audioGraph?.outputStream.getAudioTracks()[0] ??
      this.localStream.getAudioTracks()[0];
    if (!track) {
      console.log('[AUDIO] No audio track to produce');
      return;
    }
    console.log('[AUDIO] Producing audio track...');
    try {
      this.producer = await this.sendTransport.produce({ track });
      console.log('[AUDIO] Producer created, id=', this.producer.id);
      if (this.store.getState().localMuted) {
        this.producer.pause();
      }
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
      console.log('[AUDIO] Consumer created, paused=', consumer.paused, 'track=', consumer.track?.kind, 'enabled=', consumer.track?.enabled, 'muted=', consumer.track?.muted);
      this.consumers.set(consumerId, consumer);
      consumer.resume();
      console.log('[AUDIO] Client-side consumer resumed, paused=', consumer.paused);
      this.signaling.resumeConsumer(consumerId);
      if (consumer.track) {
        this.playRemoteAudio(peerId, consumer.track);
      }
    }).catch((err) => console.error('[AUDIO] Failed to consume:', err));
  }

  private playRemoteAudio(peerId: string, track: MediaStreamTrack): void {
    console.log('[AUDIO] Playing remote audio for peer', peerId, 'track kind=', track.kind, 'enabled=', track.enabled, 'muted=', track.muted);

    track.onmute = () => console.log('[AUDIO] Track muted for peer', peerId);
    track.onunmute = () => console.log('[AUDIO] Track unmuted for peer', peerId);
    track.onended = () => console.log('[AUDIO] Track ended for peer', peerId);

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
    const stream = new MediaStream([track]);
    el.srcObject = stream;
    el.muted = true;
    console.log('[AUDIO] Calling play() for peer', peerId, 'element paused=', el.paused, 'muted=', el.muted, 'volume=', el.volume);
    el.play().then(() => {
      console.log('[AUDIO] play() succeeded for peer', peerId);
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
    this.pendingTransportConnect = {};
  }

  private async handleServerMessage(msg: ServerMessage): Promise<void> {
    switch (msg.type) {
      case 'joined': {
        this.store.setState({ peers: msg.peers });
        this.setupLocalAudio();
        break;
      }
      case 'peer_joined': {
        const peers = [...this.store.getState().peers, msg.peer];
        this.store.setState({ peers });
        break;
      }
      case 'peer_left': {
        const peers = this.store.getState().peers.filter((p) => p.id !== msg.peer_id);
        this.store.setState({ peers });
        this.remoteAudioElements.get(msg.peer_id)?.remove();
        this.remoteAudioElements.delete(msg.peer_id);
        break;
      }
      case 'peer_mute': {
        const peers = this.store.getState().peers.map((p) =>
          p.id === msg.peer_id ? { ...p, muted: msg.muted } : p
        );
        this.store.setState({ peers });
        break;
      }
      case 'peer_speaking': {
        const peers = this.store.getState().peers.map((p) =>
          p.id === msg.peer_id ? { ...p, speaking: msg.speaking } : p
        );
        this.store.setState({ peers });
        break;
      }
      case 'router_capabilities': {
        console.log('[AUDIO] router_capabilities received');
        this.device = new Device();
        await this.device.load({ routerRtpCapabilities: msg.rtpCapabilities as RtpCapabilities });
        console.log('[AUDIO] Device loaded, sending rtpCapabilities');
        this.signaling.sendRtpCapabilities(this.device.rtpCapabilities);
        break;
      }
      case 'transport_params': {
        console.log('[AUDIO] transport_params received, direction=', msg.direction);
        if (!this.device) {
          console.log('[AUDIO] No device yet, skipping transport_params');
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
          console.log('[AUDIO] sendTransport created');
          this.sendTransport.on('connectionstatechange', (state: string) => {
            console.log('[AUDIO] sendTransport connection state:', state);
          });
          this.sendTransport.on('connect', ({ dtlsParameters }: { dtlsParameters: DtlsParameters }, callback: () => void, errback: (error: Error) => void) => {
            console.log('[AUDIO] sendTransport connect event, dtlsParameters=', typeof dtlsParameters, 'fingerprints=', Array.isArray(dtlsParameters?.fingerprints));
            this.pendingTransportConnect.send = { callback, errback };
            this.signaling.connectTransport('send', dtlsParameters);
          });
          this.sendTransport.on('produce', ({ kind, rtpParameters }: { kind: MediaKind; rtpParameters: RtpParameters }, callback: (data: { id: string }) => void) => {
            this.signaling.produce(kind as 'audio', rtpParameters);
            this.pendingProduceCallbacks.push(callback);
          });
        } else {
          this.recvTransport = this.device.createRecvTransport(params);
          console.log('[AUDIO] recvTransport created');
          this.recvTransport.on('connectionstatechange', (state: string) => {
            console.log('[AUDIO] recvTransport connection state:', state);
          });
          this.recvTransport.on('connect', ({ dtlsParameters }: { dtlsParameters: DtlsParameters }, callback: () => void, errback: (error: Error) => void) => {
            this.pendingTransportConnect.recv = { callback, errback };
            this.signaling.connectTransport('recv', dtlsParameters);
          });
          if (this.pendingConsumers.length > 0) {
            console.log('[AUDIO] Processing', this.pendingConsumers.length, 'pending consumers');
            const pending = [...this.pendingConsumers];
            this.pendingConsumers = [];
            for (const pc of pending) {
              this.consumeRemoteAudio(pc.consumerId, pc.producerId, pc.peerId, pc.kind, pc.rtpParameters);
            }
          }
        }
        if (this.sendTransport && this.localStream) {
          console.log('[AUDIO] sendTransport + localStream ready, producing audio');
          this.produceAudio();
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
          pending.callback();
          delete this.pendingTransportConnect[msg.direction];
        }
        break;
      }
      case 'transport_failed': {
        const pending = this.pendingTransportConnect[msg.direction];
        if (pending) {
          pending.errback(new Error(msg.message));
          delete this.pendingTransportConnect[msg.direction];
        }
        console.error('Transport setup failed:', msg.direction, msg.message);
        break;
      }
      case 'consumer_created': {
        console.log('[AUDIO] consumer_created from peer', msg.peerId, 'consumerId=', msg.consumerId);
        if (!this.recvTransport) {
          console.log('[AUDIO] No recvTransport yet, buffering consumer for later');
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
        break;
      }
      case 'error': {
        console.error('Server error:', msg.message);
        break;
      }
    }
  }
}
