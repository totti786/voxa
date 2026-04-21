export interface PeerConnectionOptions {
  iceServers?: RTCIceServer[];
  onTrack?: (event: RTCTrackEvent) => void;
  onIceCandidate?: (candidate: RTCIceCandidate) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
}

export class PeerConnection {
  pc: RTCPeerConnection;
  private options: PeerConnectionOptions;

  constructor(options: PeerConnectionOptions = {}) {
    this.options = options;
    this.pc = new RTCPeerConnection({
      iceServers: options.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    this.pc.ontrack = (event) => {
      options.onTrack?.(event);
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        options.onIceCandidate?.(event.candidate);
      }
    };

    this.pc.onconnectionstatechange = () => {
      options.onConnectionStateChange?.(this.pc.connectionState);
    };
  }

  async addLocalTrack(track: MediaStreamTrack): Promise<RTCRtpSender> {
    return this.pc.addTrack(track);
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async handleAnswer(sdp: string): Promise<void> {
    await this.pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  getConnectionState(): RTCPeerConnectionState {
    return this.pc.connectionState;
  }

  close(): void {
    this.pc.close();
  }
}
