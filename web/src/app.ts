import { SignalingClient } from './signaling/client.js';
import { captureAudio, stopCapture } from './audio/capture.js';
import { createAudioGraph, closeAudioGraph, setInputGain } from './audio/processing.js';
import { VADAnalyzer } from './audio/vad.js';
import { PeerConnection } from './webrtc/connection.js';
import { Store } from './state/store.js';
import type { PeerInfo, ServerMessage } from './types.js';

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
  });
}

export class VoiceApp {
  store: Store<AppState>;
  signaling: SignalingClient;
  pc: PeerConnection | null = null;
  localStream: MediaStream | null = null;
  audioGraph: ReturnType<typeof createAudioGraph> | null = null;
  vad: VADAnalyzer | null = null;
  vadInterval: ReturnType<typeof setInterval> | null = null;
  remoteAudioElements = new Map<string, HTMLAudioElement>();

  constructor(signalingUrl: string) {
    this.store = createAppState();
    this.signaling = new SignalingClient(signalingUrl);
    this.setupSignalingHandlers();
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
    // Wait for websocket connect then join
    await new Promise<void>((resolve) => {
      const check = () => {
        if (this.store.getState().connected) {
          resolve();
        } else {
          setTimeout(check, 50);
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
  }

  setDeafen(deafened: boolean): void {
    this.store.setState({ deafened });
    this.remoteAudioElements.forEach((el) => {
      el.muted = deafened;
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

  private async setupLocalAudio(): Promise<void> {
    this.localStream = await captureAudio();
    this.audioGraph = createAudioGraph(this.localStream);
    this.vad = new VADAnalyzer(this.audioGraph.analyzer, {
      thresholdDb: this.store.getState().noiseGateThreshold,
    });

    // Start VAD polling
    this.vadInterval = setInterval(() => {
      if (!this.vad || this.store.getState().localMuted) return;
      const speaking = this.vad.analyze();
      if (speaking !== this.store.getState().localSpeaking) {
        this.store.setState({ localSpeaking: speaking });
        this.signaling.setSpeaking(speaking);
      }
    }, 100);
  }

  private async setupPeerConnection(): Promise<void> {
    this.pc = new PeerConnection({
      onTrack: (event) => {
        const stream = event.streams[0];
        const peerId = stream.id; // In real implementation, map stream ID to peer
        this.playRemoteAudio(peerId, stream);
      },
      onIceCandidate: (candidate) => {
        this.signaling.send({
          type: 'ice',
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid || '',
          sdpMLineIndex: candidate.sdpMLineIndex || 0,
        });
      },
    });
  }

  private playRemoteAudio(peerId: string, stream: MediaStream): void {
    let el = this.remoteAudioElements.get(peerId);
    if (!el) {
      el = document.createElement('audio');
      el.autoplay = true;
      el.muted = this.store.getState().deafened;
      this.remoteAudioElements.set(peerId, el);
    }
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
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.remoteAudioElements.forEach((el) => el.remove());
    this.remoteAudioElements.clear();
  }

  private handleServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'joined': {
        this.store.setState({ peers: msg.peers });
        this.setupLocalAudio().then(() => this.setupPeerConnection());
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
      case 'answer': {
        this.pc?.handleAnswer(msg.sdp);
        break;
      }
      case 'ice': {
        this.pc?.addIceCandidate({
          candidate: msg.candidate,
          sdpMid: msg.sdpMid,
          sdpMLineIndex: msg.sdpMLineIndex,
        });
        break;
      }
      case 'error': {
        console.error('Server error:', msg.message);
        break;
      }
    }
  }
}
