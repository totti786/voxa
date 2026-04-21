import type { Router, WebRtcTransport, Producer, Consumer } from 'mediasoup/node/lib/types.js';

export interface TransportPair {
  sendTransport: WebRtcTransport;
  recvTransport: WebRtcTransport;
}

export interface PeerSfuState {
  peerId: string;
  sendTransport: WebRtcTransport | null;
  recvTransport: WebRtcTransport | null;
  producer: Producer | null;
  consumers: Map<string, Consumer>;
}

export async function createWebRtcTransport(
  router: Router,
  direction: 'send' | 'recv'
): Promise<WebRtcTransport> {
  const transport = await router.createWebRtcTransport({
    listenIps: [{ ip: '0.0.0.0', announcedIp: undefined }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });

  transport.on('icestatechange', (iceState) => {
    if (iceState === 'disconnected' || iceState === 'closed' || iceState === 'failed') {
      console.warn(`Transport ${direction} for peer disconnected`);
    }
  });

  return transport;
}

export async function createPeerTransports(
  router: Router,
  peerId: string
): Promise<TransportPair> {
  const [sendTransport, recvTransport] = await Promise.all([
    createWebRtcTransport(router, 'send'),
    createWebRtcTransport(router, 'recv'),
  ]);

  return { sendTransport, recvTransport };
}

export function getTransportIceParams(transport: WebRtcTransport) {
  return {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
  };
}
