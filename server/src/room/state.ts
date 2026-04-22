import type { PeerInfo } from '../types.js';
import type { WebRtcTransport, Producer, Consumer } from 'mediasoup/node/lib/types.js';

export interface Peer {
  id: string;
  displayName: string;
  muted: boolean;
  wsId: string; // WebSocket connection identifier
  sendTransport?: WebRtcTransport;
  recvTransport?: WebRtcTransport;
  producer?: Producer;
  consumers: Map<string, Consumer>;
}

export interface Room {
  id: string;
  password?: string;
  maxUsers: number;
  peers: Map<string, Peer>;
  createdAt: Date;
}

class RoomState {
  private rooms = new Map<string, Room>();

  getRoom(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  createRoom(id: string, password?: string, maxUsers = 10): Room {
    const room: Room = {
      id,
      password,
      maxUsers,
      peers: new Map(),
      createdAt: new Date(),
    };
    this.rooms.set(id, room);
    return room;
  }

  deleteRoom(id: string): boolean {
    return this.rooms.delete(id);
  }

  addPeer(roomId: string, peer: Peer): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.peers.size >= room.maxUsers) return false;
    if (!peer.consumers) {
      peer.consumers = new Map();
    }
    room.peers.set(peer.id, peer);
    return true;
  }

  removePeer(roomId: string, peerId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const removed = room.peers.delete(peerId);
    if (removed && room.peers.size === 0) {
      this.rooms.delete(roomId);
    }
    return removed;
  }

  getPeers(roomId: string): Peer[] {
    const room = this.rooms.get(roomId);
    return room ? Array.from(room.peers.values()) : [];
  }

  getPeer(roomId: string, peerId: string): Peer | undefined {
    const room = this.rooms.get(roomId);
    return room?.peers.get(peerId);
  }

  setPeerMute(roomId: string, peerId: string, muted: boolean): boolean {
    const peer = this.getPeer(roomId, peerId);
    if (!peer) return false;
    peer.muted = muted;
    return true;
  }

  toPeerInfo(peer: Peer): PeerInfo {
    return {
      id: peer.id,
      display_name: peer.displayName,
      muted: peer.muted,
      speaking: false,
    };
  }

  getRoomCount(): number {
    return this.rooms.size;
  }
}

export const roomState = new RoomState();
