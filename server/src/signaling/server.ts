import { WebSocketServer, WebSocket } from 'ws';
import { validateClientMessage, encodeServerMessage } from './protocol.js';
import { joinRoom, leaveRoom, setMute } from '../room/manager.js';
import { roomState } from '../room/state.js';
import type { ServerMessage } from '../types.js';

interface ClientContext {
  peerId: string;
  roomId: string | null;
  ws: WebSocket;
}

const clients = new Map<WebSocket, ClientContext>();

export function createSignalingServer(port: number): WebSocketServer {
  const wss = new WebSocketServer({ port });

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

function handleMessage(ws: WebSocket, msg: ReturnType<typeof validateClientMessage>): void {
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
      // msg has transport_id and dtlsParameters
      // Connect the transport and confirm
      send(ws, { type: 'error', message: 'not_fully_implemented' });
      break;
    }
    case 'produce': {
      // msg has kind and rtpParameters
      // Create producer, then create consumers for other peers
      send(ws, { type: 'error', message: 'not_fully_implemented' });
      break;
    }
    case 'offer': {
      if (!ctx.roomId) {
        send(ws, { type: 'error', message: 'not_in_room' });
        return;
      }
      // mediasoup uses a different flow: client needs transport params first,
      // then produces/consumes. For simplicity in this plan, we will send
      // router rtpCapabilities and transport params on join, then the client
      // sends a "connectTransport" message before producing.
      send(ws, { type: 'error', message: 'use_transport_flow' });
      break;
    }
  }
}

function handlePeerLeave(roomId: string, peerId: string): void {
  leaveRoom(roomId, peerId);
  broadcast(roomId, { type: 'peer_left', peer_id: peerId });
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
