import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { validateClientMessage, encodeServerMessage } from './protocol.js';
import { joinRoom, leaveRoom, setMute } from '../room/manager.js';
import { roomState } from '../room/state.js';
import { createRouter, getRouter } from '../sfu/router.js';
import { createPeerTransports, getTransportIceParams } from '../sfu/peer.js';
import { connectTransport, produce, createConsumer } from '../sfu/integration.js';
import type { ServerMessage } from '../types.js';

interface ClientContext {
  peerId: string;
  roomId: string | null;
  ws: WebSocket;
}

const clients = new Map<WebSocket, ClientContext>();

export function createSignalingServer(options: { port?: number; server?: http.Server }): WebSocketServer {
  const wss = new WebSocketServer(options);

  wss.on('connection', (ws) => {
    const peerId = generatePeerId();
    clients.set(ws, { peerId, roomId: null, ws });

    ws.on('message', (raw) => {
      let data: unknown;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        send(ws, { type: 'error', message: 'invalid_json' });
        return;
      }

      const msg = validateClientMessage(data);
      if (!msg) {
        send(ws, { type: 'error', message: 'invalid_message' });
        return;
      }

      handleMessage(ws, msg);
    });

    ws.on('close', () => {
      const ctx = clients.get(ws);
      if (ctx && ctx.roomId) {
        handlePeerLeave(ctx.roomId, ctx.peerId);
      }
      clients.delete(ws);
    });
  });

  return wss;
}

async function handleMessage(ws: WebSocket, msg: ReturnType<typeof validateClientMessage>): Promise<void> {
  if (!msg) return;
  const ctx = clients.get(ws);
  if (!ctx) return;

  switch (msg.type) {
    case 'join': {
      const result = joinRoom(msg.room, ctx.peerId, msg.display_name, ws.toString(), msg.password);
      if (!result.success) {
        send(ws, { type: 'error', message: result.error || 'join_failed' });
        return;
      }
      ctx.roomId = msg.room;

      let router = getRouter(msg.room);
      if (!router) {
        router = await createRouter(msg.room);
      }

      send(ws, { type: 'router_capabilities', rtpCapabilities: router.rtpCapabilities });

      const transports = await createPeerTransports(router, ctx.peerId);
      const peer = roomState.getPeer(msg.room, ctx.peerId);
      if (!peer) {
        send(ws, { type: 'error', message: 'peer_not_found' });
        return;
      }
      peer.sendTransport = transports.sendTransport;
      peer.recvTransport = transports.recvTransport;

      send(ws, {
        type: 'transport_params',
        direction: 'send',
        id: transports.sendTransport.id,
        iceParameters: transports.sendTransport.iceParameters,
        iceCandidates: transports.sendTransport.iceCandidates,
        dtlsParameters: transports.sendTransport.dtlsParameters,
      });
      send(ws, {
        type: 'transport_params',
        direction: 'recv',
        id: transports.recvTransport.id,
        iceParameters: transports.recvTransport.iceParameters,
        iceCandidates: transports.recvTransport.iceCandidates,
        dtlsParameters: transports.recvTransport.dtlsParameters,
      });

      send(ws, {
        type: 'joined',
        peers: result.peers || [],
      });

      broadcast(ctx.roomId, { type: 'peer_joined', peer: roomState.toPeerInfo(roomState.getPeer(ctx.roomId, ctx.peerId)!) }, ctx.peerId);
      break;
    }
    case 'leave': {
      if (ctx.roomId) {
        handlePeerLeave(ctx.roomId, ctx.peerId);
        ctx.roomId = null;
      }
      break;
    }
    case 'mute': {
      if (ctx.roomId) {
        setMute(ctx.roomId, ctx.peerId, msg.muted);
        broadcast(ctx.roomId, { type: 'peer_mute', peer_id: ctx.peerId, muted: msg.muted });
      }
      break;
    }
    case 'speaking': {
      if (ctx.roomId) {
        broadcast(ctx.roomId, { type: 'peer_speaking', peer_id: ctx.peerId, speaking: msg.speaking });
      }
      break;
    }
    case 'connect_transport': {
      if (!ctx.roomId) {
        send(ws, { type: 'error', message: 'not_in_room' });
        return;
      }
      console.log('[SERVER] connect_transport from peer', ctx.peerId, 'direction=', msg.direction);
      console.log('[SERVER] dtlsParameters keys:', Object.keys(msg.dtlsParameters || {}));
      console.log('[SERVER] dtlsParameters.fingerprints:', Array.isArray((msg.dtlsParameters as any)?.fingerprints) ? 'array' : 'missing');
      if ((msg.dtlsParameters as any)?.fingerprints) {
        console.log('[SERVER] first fingerprint:', JSON.stringify((msg.dtlsParameters as any).fingerprints[0]));
      }
      try {
        const dtlsParams = (msg.dtlsParameters || {}) as Parameters<import('mediasoup/types').WebRtcTransport['connect']>[0]['dtlsParameters'];
        console.log('[SERVER] About to connect with dtlsParams type:', typeof dtlsParams, 'has fingerprints:', !!dtlsParams?.fingerprints);
        const ok = await connectTransport(ctx.roomId, ctx.peerId, msg.direction, dtlsParams);
        if (!ok) {
          send(ws, { type: 'error', message: 'connect_transport_failed' });
          return;
        }
        console.log('[SERVER] connect_transport success for peer', ctx.peerId);
      } catch (err) {
        console.error('[SERVER] connect_transport error:', err);
        send(ws, { type: 'error', message: 'connect_transport_error' });
      }
      break;
    }
    case 'produce': {
      if (!ctx.roomId) {
        send(ws, { type: 'error', message: 'not_in_room' });
        return;
      }
      console.log('[SERVER] produce from peer', ctx.peerId, 'kind=', msg.kind);
      const producerId = await produce(ctx.roomId, ctx.peerId, msg.kind, msg.rtpParameters as Parameters<import('mediasoup/types').WebRtcTransport['produce']>[0]['rtpParameters']);
      if (!producerId) {
        console.log('[SERVER] produce failed for peer', ctx.peerId);
        send(ws, { type: 'error', message: 'produce_failed' });
        return;
      }
      console.log('[SERVER] producer_created', producerId, 'for peer', ctx.peerId);
      send(ws, { type: 'producer_created', producerId });

      const peers = roomState.getPeers(ctx.roomId).filter((p) => p.id !== ctx.peerId && p.rtpCapabilities);
      console.log('[SERVER] Creating consumers for', peers.length, 'other peers');
      for (const otherPeer of peers) {
        const consumerInfo = await createConsumer(ctx.roomId, otherPeer.id, roomState.getPeer(ctx.roomId, ctx.peerId)!.producer!);
        if (!consumerInfo) {
          console.log('[SERVER] createConsumer failed for peer', otherPeer.id);
          continue;
        }
        console.log('[SERVER] consumer_created for peer', otherPeer.id, 'consumerId=', consumerInfo.consumerId);
        const otherCtx = findClientByPeerId(otherPeer.id);
        if (!otherCtx) continue;
        send(otherCtx.ws, {
          type: 'consumer_created',
          consumerId: consumerInfo.consumerId,
          producerId: consumerInfo.producerId,
          peerId: ctx.peerId,
          kind: consumerInfo.kind,
          rtpParameters: consumerInfo.rtpParameters,
        });
      }
      break;
    }
    case 'client_rtp_capabilities': {
      if (!ctx.roomId) {
        send(ws, { type: 'error', message: 'not_in_room' });
        return;
      }
      console.log('[SERVER] client_rtp_capabilities from peer', ctx.peerId);
      const peer = roomState.getPeer(ctx.roomId, ctx.peerId);
      if (peer) {
        peer.rtpCapabilities = msg.rtpCapabilities as import('mediasoup/types').RtpCapabilities;
      }

      const existingPeers = roomState.getPeers(ctx.roomId).filter((p) => p.id !== ctx.peerId && p.producer);
      console.log('[SERVER] Creating consumers for existing', existingPeers.length, 'producers');
      for (const existingPeer of existingPeers) {
        const consumerInfo = await createConsumer(ctx.roomId, ctx.peerId, existingPeer.producer!);
        if (!consumerInfo) {
          console.log('[SERVER] createConsumer failed for existing producer from', existingPeer.id);
          continue;
        }
        console.log('[SERVER] consumer_created for peer', ctx.peerId, 'from existing producer', existingPeer.id);
        send(ws, {
          type: 'consumer_created',
          consumerId: consumerInfo.consumerId,
          producerId: consumerInfo.producerId,
          peerId: existingPeer.id,
          kind: consumerInfo.kind,
          rtpParameters: consumerInfo.rtpParameters,
        });
      }
      break;
    }
    case 'resume_consumer': {
      if (!ctx.roomId) {
        send(ws, { type: 'error', message: 'not_in_room' });
        return;
      }
      const peer = roomState.getPeer(ctx.roomId, ctx.peerId);
      if (peer && peer.consumers) {
        const consumer = peer.consumers.get(msg.consumerId);
        if (consumer) {
          await consumer.resume();
        }
      }
      break;
    }
    case 'offer': {
      send(ws, { type: 'error', message: 'use_transport_flow' });
      break;
    }
  }
}

function handlePeerLeave(roomId: string, peerId: string): void {
  const peer = roomState.getPeer(roomId, peerId);
  if (peer) {
    if (peer.producer) {
      peer.producer.close();
    }
    peer.consumers.forEach((c) => c.close());
    peer.consumers.clear();
    if (peer.sendTransport) peer.sendTransport.close();
    if (peer.recvTransport) peer.recvTransport.close();
  }

  const peers = roomState.getPeers(roomId).filter((p) => p.id !== peerId);
  for (const otherPeer of peers) {
    if (otherPeer.consumers) {
      for (const [consumerId, consumer] of otherPeer.consumers) {
        if (consumer.appData && (consumer.appData as Record<string, unknown>).producerPeerId === peerId) {
          consumer.close();
          otherPeer.consumers.delete(consumerId);
        }
      }
    }
  }

  leaveRoom(roomId, peerId);
  broadcast(roomId, { type: 'peer_left', peer_id: peerId });

  const room = roomState.getRoom(roomId);
  if (room && room.peers.size === 0) {
    import('../sfu/router.js').then(({ closeRouter }) => closeRouter(roomId));
  }
}

function broadcast(roomId: string, msg: ServerMessage, excludePeerId?: string): void {
  for (const ctx of clients.values()) {
    if (ctx.roomId === roomId && ctx.peerId !== excludePeerId) {
      send(ctx.ws, msg);
    }
  }
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(encodeServerMessage(msg));
  }
}

function generatePeerId(): string {
  return `peer_${Math.random().toString(36).slice(2, 9)}`;
}

function findClientByPeerId(peerId: string): ClientContext | undefined {
  for (const ctx of clients.values()) {
    if (ctx.peerId === peerId) return ctx;
  }
  return undefined;
}
