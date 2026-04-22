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
    this.localStream = await captureAudio();
    this.audioGraph = createAudioGraph(this.localStream);
    this.vad = new VADAnalyzer(this.audioGraph.analyzer, {
      thresholdDb: this.store.getState().noiseGateThreshold,
    });

    this.vadInterval = setInterval(() => {
      if (!this.vad || this.store.getState().localMuted) return;
      const speaking = this.vad.analyze();
      if (speaking !== this.store.getState().localSpeaking) {
        this.store.setState({ localSpeaking: speaking });
        this.signaling.setSpeaking(speaking);
      }
    }, 100);
  }

  private async produceAudio(): Promise<void> {
    if (!this.sendTransport || !this.localStream) return;
    const track = this.localStream.getAudioTracks()[0];
    if (!track) return;
    this.producer = await this.sendTransport.produce({ track });
    if (this.store.getState().localMuted) {
      this.producer.pause();
    }
  }

  private playRemoteAudio(peerId: string, track: MediaStreamTrack): void {
    let el = this.remoteAudioElements.get(peerId);
    if (!el) {
      el = document.createElement('audio');
      el.autoplay = true;
      el.muted = this.store.getState().deafened;
      this.remoteAudioElements.set(peerId, el);
    }
    const stream = new MediaStream([track]);
    el.srcObject = stream;
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
  }

  private handleServerMessage(msg: ServerMessage): void {
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
        this.device = new Device();
        this.device.load({ routerRtpCapabilities: msg.rtpCapabilities as RtpCapabilities });
        this.signaling.sendRtpCapabilities(this.device.rtpCapabilities);
        break;
      }
      case 'transport_params': {
        if (!this.device) return;
        const params = {
          id: msg.id,
          iceParameters: msg.iceParameters as IceParameters,
          iceCandidates: msg.iceCandidates as IceCandidate[],
          dtlsParameters: msg.dtlsParameters as DtlsParameters,
        };
        if (msg.direction === 'send') {
          this.sendTransport = this.device.createSendTransport(params);
          this.sendTransport.on('connect', ({ dtlsParameters }: { dtlsParameters: DtlsParameters }, callback: () => void) => {
            this.signaling.connectTransport('send', dtlsParameters);
            callback();
          });
          this.sendTransport.on('produce', ({ kind, rtpParameters }: { kind: MediaKind; rtpParameters: RtpParameters }, callback: (data: { id: string }) => void) => {
            this.signaling.produce(kind as 'audio', rtpParameters);
            this.pendingProduceCallbacks.push(callback);
          });
        } else {
          this.recvTransport = this.device.createRecvTransport(params);
          this.recvTransport.on('connect', ({ dtlsParameters }: { dtlsParameters: DtlsParameters }, callback: () => void) => {
            this.signaling.connectTransport('recv', dtlsParameters);
            callback();
          });
        }
        if (this.sendTransport && this.localStream) {
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
      case 'consumer_created': {
        if (!this.recvTransport) return;
        this.recvTransport.consume({
          id: msg.consumerId,
          producerId: msg.producerId,
          kind: msg.kind as 'audio',
          rtpParameters: msg.rtpParameters as RtpParameters,
        }).then((consumer) => {
          this.consumers.set(msg.consumerId, consumer);
          consumer.resume();
          this.signaling.resumeConsumer(msg.consumerId);
          this.playRemoteAudio(msg.peerId, consumer.track);
        });
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
