import { getRouter } from './router.js';
import { createPeerTransports, getTransportIceParams } from './peer.js';
import { roomState } from '../room/state.js';
import type { Router, WebRtcTransport, Producer, Consumer } from 'mediasoup/node/lib/types.js';

export async function setupPeerTransports(
  roomId: string,
  peerId: string
): Promise<{ sendParams: ReturnType<typeof getTransportIceParams>; recvParams: ReturnType<typeof getTransportIceParams> } | null> {
  const router = getRouter(roomId);
  if (!router) return null;

  const { sendTransport, recvTransport } = await createPeerTransports(router, peerId);
  const peer = roomState.getPeer(roomId, peerId);
  if (!peer) return null;

  peer.sendTransport = sendTransport;
  peer.recvTransport = recvTransport;

  return {
    sendParams: getTransportIceParams(sendTransport),
    recvParams: getTransportIceParams(recvTransport),
  };
}

export async function connectTransport(
  roomId: string,
  peerId: string,
  direction: 'send' | 'recv',
  dtlsParameters: Parameters<WebRtcTransport['connect']>[0]
): Promise<boolean> {
  const peer = roomState.getPeer(roomId, peerId);
  if (!peer) return false;

  const transport = direction === 'send' ? peer.sendTransport : peer.recvTransport;
  if (!transport) return false;

  await transport.connect(dtlsParameters);
  return true;
}

export async function produce(
  roomId: string,
  peerId: string,
  kind: 'audio',
  rtpParameters: Parameters<NonNullable<WebRtcTransport['produce']>>[0]['rtpParameters']
): Promise<string | null> {
  const peer = roomState.getPeer(roomId, peerId);
  if (!peer || !peer.sendTransport) return null;

  const producer = await peer.sendTransport.produce({ kind, rtpParameters });
  peer.producer = producer;

  // Create consumers for all other peers
  const peers = roomState.getPeers(roomId).filter((p) => p.id !== peerId);
  for (const otherPeer of peers) {
    await createConsumer(roomId, otherPeer.id, producer);
  }

  return producer.id;
}

export async function createConsumer(
  roomId: string,
  peerId: string,
  producer: Producer
): Promise<{ consumerId: string; producerId: string; kind: string; rtpParameters: unknown } | null> {
  const peer = roomState.getPeer(roomId, peerId);
  const router = getRouter(roomId);
  if (!peer || !peer.recvTransport || !router) return null;

  if (!router.canConsume({ producerId: producer.id, rtpCapabilities: {} })) {
    return null;
  }

  const consumer = await peer.recvTransport.consume({
    producerId: producer.id,
    rtpCapabilities: {}, // Client capabilities should be passed in real implementation
    paused: false,
  });

  peer.consumers.set(consumer.id, consumer);

  return {
    consumerId: consumer.id,
    producerId: producer.id,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters,
  };
}
