import { describe, it, expect, vi } from 'vitest';
import { PeerConnection } from '../../src/webrtc/connection.js';

class MockRTCPeerConnection {
  connectionState: RTCPeerConnectionState = 'new';
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  onicecandidate: ((event: RTCIceCandidateEvent) => void) | null = null;
  onconnectionstatechange: ((event: Event) => void) | null = null;
  close() { this.connectionState = 'closed'; }
  addTrack(track: MediaStreamTrack) { return { track } as unknown as RTCRtpSender; }
  async createOffer() { return { type: 'offer' as const, sdp: '' }; }
  async setLocalDescription() {}
  async setRemoteDescription() {}
  async addIceCandidate() {}
}

globalThis.RTCPeerConnection = MockRTCPeerConnection as unknown as typeof RTCPeerConnection;
globalThis.RTCSessionDescription = class {
  constructor(public init: RTCSessionDescriptionInit) {}
} as unknown as typeof RTCSessionDescription;
globalThis.RTCIceCandidate = class {
  constructor(public init: RTCIceCandidateInit) {}
} as unknown as typeof RTCIceCandidate;

describe('PeerConnection', () => {
  it('creates a peer connection with default ice servers', () => {
    const pc = new PeerConnection();
    expect(pc.pc).toBeDefined();
    pc.close();
  });

  it('calls onConnectionStateChange', () => {
    const handler = vi.fn();
    const pc = new PeerConnection({ onConnectionStateChange: handler });
    pc.pc.onconnectionstatechange?.({} as Event);
    expect(handler).toHaveBeenCalled();
    pc.close();
  });

  it('closes the connection', () => {
    const pc = new PeerConnection();
    pc.close();
    expect(pc.pc.connectionState).toBe('closed');
  });
});
