import http from 'http';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { validateClientMessage, encodeServerMessage } from './protocol.js';
import type { Router } from 'mediasoup/types';
import { joinRoom, leaveRoom, setMute, transferOwnership, kickPeer, forceMutePeer } from '../room/manager.js';
import { roomState } from '../room/state.js';
import { createRouter, getRouter } from '../sfu/router.js';
import { createPeerTransports } from '../sfu/peer.js';
import { connectTransport, produce, createConsumer } from '../sfu/integration.js';
import { loadConfig, buildIceServers } from '../config.js';
import type { ServerMessage } from '../types.js';

interface ClientContext {
  peerId: string;
  roomId: string | null;
  ws: WebSocket;
}

const clients = new Map<WebSocket, ClientContext>();
const routerLocks = new Map<string, Promise<Router>>();

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimits = new Map<string, RateLimitEntry>();
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 10000;

const chatRateLimits = new Map<string, RateLimitEntry>();
const CHAT_RATE_LIMIT_MAX = 5;
const CHAT_RATE_LIMIT_WINDOW_MS = 10000;

export function createSignalingServer(options: { port?: number; server?: http.Server }): WebSocketServer {
  const wss = new WebSocketServer({ ...options, maxPayload: 65536 });

  wss.on('connection', (ws) => {
    const peerId = generatePeerId();
    clients.set(ws, { peerId, roomId: null, ws });

    ws.on('message', (raw) => {
      const now = Date.now();
      const limit = rateLimits.get(peerId);
      if (limit && now < limit.resetTime) {
        limit.count += 1;
        if (limit.count > RATE_LIMIT_MAX) {
          send(ws, { type: 'error', message: 'rate_limited' });
          ws.close(1008, 'rate_limited');
          return;
        }
      } else {
        rateLimits.set(peerId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
      }

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

      handleMessage(ws, msg).catch((err) => {
        console.error('Message handler error:', err);
        send(ws, { type: 'error', message: 'Internal error' });
      });
    });

    ws.on('close', () => {
      const ctx = clients.get(ws);
      if (ctx && ctx.roomId) {
        handlePeerLeave(ctx.roomId, ctx.peerId);
      }
      clients.delete(ws);
      rateLimits.delete(peerId);
      chatRateLimits.delete(peerId);
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
      const result = joinRoom(msg.room, ctx.peerId, msg.display_name, ctx.peerId, msg.password);
      if (!result.success) {
        send(ws, { type: 'error', message: result.error || 'join_failed' });
        return;
      }
      ctx.roomId = msg.room;

      let router = getRouter(msg.room);
      if (!router) {
        let lock = routerLocks.get(msg.room);
        if (!lock) {
          lock = createRouter(msg.room).finally(() => {
            routerLocks.delete(msg.room);
          });
          routerLocks.set(msg.room, lock);
        }
        router = await lock;
      }

      send(ws, { type: 'router_capabilities', rtpCapabilities: router.rtpCapabilities });

      const transports = await createPeerTransports(router, ctx.peerId);
      const peer = roomState.getPeer(msg.room, ctx.peerId);
      if (!peer) {
        send(ws, { type: 'error', message: 'peer_not_found' });
        return;
      }
      const config = loadConfig();
      const iceServers = buildIceServers(config);
      peer.sendTransport = transports.sendTransport;
      peer.recvTransport = transports.recvTransport;

      send(ws, {
        type: 'transport_params',
        direction: 'send',
        id: transports.sendTransport.id,
        iceParameters: transports.sendTransport.iceParameters,
        iceCandidates: transports.sendTransport.iceCandidates,
        dtlsParameters: transports.sendTransport.dtlsParameters,
        iceServers,
      });
      send(ws, {
        type: 'transport_params',
        direction: 'recv',
        id: transports.recvTransport.id,
        iceParameters: transports.recvTransport.iceParameters,
        iceCandidates: transports.recvTransport.iceCandidates,
        dtlsParameters: transports.recvTransport.dtlsParameters,
        iceServers,
      });

      const room = roomState.getRoom(msg.room);
      send(ws, {
        type: 'joined',
        peers: result.peers || [],
        self_peer_id: ctx.peerId,
        is_owner: room ? room.ownerPeerId === ctx.peerId : false,
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
      if (!ctx.roomId) break;
      const peer = roomState.getPeer(ctx.roomId, ctx.peerId);
      if (peer && peer.forceMuted && !msg.muted) {
        send(ws, { type: 'error', message: 'force_muted' });
        return;
      }
      setMute(ctx.roomId, ctx.peerId, msg.muted);
      broadcast(ctx.roomId, { type: 'peer_mute', peer_id: ctx.peerId, muted: msg.muted });
      break;
    }
    case 'speaking': {
      if (ctx.roomId) {
        broadcast(ctx.roomId, { type: 'peer_speaking', peer_id: ctx.peerId, speaking: msg.speaking });
      }
      break;
    }
    case 'kick_peer': {
      if (!ctx.roomId) { send(ws, { type: 'error', message: 'not_in_room' }); return; }
      const room = roomState.getRoom(ctx.roomId);
      if (!room || room.ownerPeerId !== ctx.peerId) { send(ws, { type: 'error', message: 'not_owner' }); return; }
      const targetWs = findClientByPeerId(msg.peer_id)?.ws;
      if (targetWs) {
        send(targetWs, { type: 'kicked', reason: 'kicked_by_owner' });
        targetWs.close(1008, 'kicked');
      }
      kickPeer(ctx.roomId, msg.peer_id);
      break;
    }
    case 'force_mute': {
      if (!ctx.roomId) { send(ws, { type: 'error', message: 'not_in_room' }); return; }
      const room = roomState.getRoom(ctx.roomId);
      if (!room || room.ownerPeerId !== ctx.peerId) { send(ws, { type: 'error', message: 'not_owner' }); return; }
      if (forceMutePeer(ctx.roomId, msg.peer_id, msg.muted)) {
        broadcast(ctx.roomId, { type: 'peer_force_muted', peer_id: msg.peer_id, muted: msg.muted });
        broadcast(ctx.roomId, { type: 'peer_mute', peer_id: msg.peer_id, muted: msg.muted });
      }
      break;
    }
    case 'chat': {
      if (!ctx.roomId) {
        send(ws, { type: 'error', message: 'not_in_room' });
        return;
      }
      const now = Date.now();
      const chatLimit = chatRateLimits.get(ctx.peerId);
      if (chatLimit && now < chatLimit.resetTime) {
        chatLimit.count += 1;
        if (chatLimit.count > CHAT_RATE_LIMIT_MAX) {
          send(ws, { type: 'error', message: 'chat_rate_limited' });
          return;
        }
      } else {
        chatRateLimits.set(ctx.peerId, { count: 1, resetTime: now + CHAT_RATE_LIMIT_WINDOW_MS });
      }
      broadcast(ctx.roomId, { type: 'chat', peer_id: ctx.peerId, text: msg.text, timestamp: Date.now() }, ctx.peerId);
      break;
    }
    case 'connect_transport': {
      if (!ctx.roomId) {
        send(ws, { type: 'error', message: 'not_in_room' });
        return;
      }
      try {
        const dtlsParams = (msg.dtlsParameters || {}) as Parameters<import('mediasoup/types').WebRtcTransport['connect']>[0]['dtlsParameters'];
        const ok = await connectTransport(ctx.roomId, ctx.peerId, msg.direction, dtlsParams);
        if (!ok) {
          send(ws, { type: 'transport_failed', direction: msg.direction, message: 'connect_transport_failed' });
          return;
        }
        send(ws, { type: 'transport_connected', direction: msg.direction });
        if (msg.direction === 'recv') {
          await createConsumersForPeer(ctx.roomId, ctx.peerId);
        }
      } catch (err) {
        console.error('[SERVER] connect_transport error:', err);
        send(ws, { type: 'transport_failed', direction: msg.direction, message: 'connect_transport_error' });
      }
      break;
    }
    case 'produce': {
      if (!ctx.roomId) {
        send(ws, { type: 'error', message: 'not_in_room' });
        return;
      }
      const producerId = await produce(ctx.roomId, ctx.peerId, msg.kind, msg.rtpParameters as Parameters<import('mediasoup/types').WebRtcTransport['produce']>[0]['rtpParameters']);
      if (!producerId) {
        send(ws, { type: 'error', message: 'produce_failed' });
        return;
      }
      send(ws, { type: 'producer_created', producerId });

      const producerPeer = roomState.getPeer(ctx.roomId, ctx.peerId);
      if (producerPeer && producerPeer.producer) {
        producerPeer.producer.on('@close', () => {
          if (!ctx.roomId) return;
          const stillHere = roomState.getPeer(ctx.roomId, ctx.peerId);
          if (!stillHere) return;
          broadcast(ctx.roomId, { type: 'producer_closed', producerId, peerId: ctx.peerId }, ctx.peerId);
          const otherPeers = roomState.getPeers(ctx.roomId).filter((p) => p.id !== ctx.peerId);
          for (const otherPeer of otherPeers) {
            if (otherPeer.consumers) {
              for (const [consumerId, consumer] of otherPeer.consumers) {
                if (consumer.appData && (consumer.appData as Record<string, unknown>).producerPeerId === ctx.peerId) {
                  consumer.close();
                  otherPeer.consumers.delete(consumerId);
                }
              }
            }
          }
        });
      }

      const peers = roomState.getPeers(ctx.roomId).filter((p) => p.id !== ctx.peerId);
      for (const otherPeer of peers) {
        await createConsumersForPeer(ctx.roomId, otherPeer.id);
      }
      break;
    }
    case 'client_rtp_capabilities': {
      if (!ctx.roomId) {
        send(ws, { type: 'error', message: 'not_in_room' });
        return;
      }
      const peer = roomState.getPeer(ctx.roomId, ctx.peerId);
      if (peer) {
        peer.rtpCapabilities = msg.rtpCapabilities as import('mediasoup/types').RtpCapabilities;
      }
      await createConsumersForPeer(ctx.roomId, ctx.peerId);
      break;
    }
    case 'resume_consumer': {
      if (!ctx.roomId) {
        send(ws, { type: 'error', message: 'not_in_room' });
        return;
      }
      const peer = roomState.getPeer(ctx.roomId, ctx.peerId);
      if (!peer || !peer.consumers) {
        send(ws, { type: 'error', message: 'peer_not_found' });
        return;
      }
      const consumer = peer.consumers.get(msg.consumerId);
      if (!consumer) {
        send(ws, { type: 'error', message: 'consumer_not_found' });
        return;
      }
      await consumer.resume();
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

  const room = roomState.getRoom(roomId);
  if (room && room.ownerPeerId === peerId) {
    const nextOwner = roomState.getLongestTenurePeer(roomId);
    if (nextOwner) {
      transferOwnership(roomId, nextOwner.id);
      broadcast(roomId, { type: 'ownership_changed', peer_id: nextOwner.id });
    }
  }

  const isLastPeer = room ? room.peers.size === 1 && room.peers.has(peerId) : false;

  leaveRoom(roomId, peerId);
  broadcast(roomId, { type: 'peer_left', peer_id: peerId });

  if (isLastPeer) {
    import('../sfu/router.js').then(({ closeRouter }) => closeRouter(roomId));
  }
}

async function createConsumersForPeer(roomId: string, peerId: string): Promise<void> {
  const peer = roomState.getPeer(roomId, peerId);
  if (!peer || !peer.rtpCapabilities || !peer.recvTransport) return;

  const existingPeers = roomState.getPeers(roomId).filter((p) => p.id !== peerId && p.producer);
  for (const existingPeer of existingPeers) {
    const hasConsumer = Array.from(peer.consumers.values()).some(
      (c) => c.producerId === existingPeer.producer!.id
    );
    if (hasConsumer) continue;

    const consumerInfo = await createConsumer(roomId, peerId, existingPeer.producer!);
    if (!consumerInfo) continue;
    const ctx = findClientByPeerId(peerId);
    if (!ctx) continue;
    send(ctx.ws, {
      type: 'consumer_created',
      consumerId: consumerInfo.consumerId,
      producerId: consumerInfo.producerId,
      peerId: existingPeer.id,
      kind: consumerInfo.kind,
      rtpParameters: consumerInfo.rtpParameters,
    });
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
  return `peer_${crypto.randomUUID()}`;
}

function findClientByPeerId(peerId: string): ClientContext | undefined {
  for (const ctx of clients.values()) {
    if (ctx.peerId === peerId) return ctx;
  }
  return undefined;
}
