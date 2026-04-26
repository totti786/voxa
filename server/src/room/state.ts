import type { PeerInfo } from '../types.js';
import type { WebRtcTransport, Producer, Consumer, RtpCapabilities } from 'mediasoup/types';

export interface Peer {
  id: string;
  displayName: string;
  muted: boolean;
  forceMuted?: boolean;
  wsId: string;
  joinedAt: Date;
  sendTransport?: WebRtcTransport;
  recvTransport?: WebRtcTransport;
  producer?: Producer;
  consumers: Map<string, Consumer>;
  rtpCapabilities?: RtpCapabilities;
}

export interface Room {
  id: string;
  password?: string;
  maxUsers: number;
  peers: Map<string, Peer>;
  createdAt: Date;
  ownerPeerId: string | null;
  bannedUntil: Map<string, number>;
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
      ownerPeerId: null,
      bannedUntil: new Map(),
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

  toPeerInfo(peer: Peer, room?: Room): PeerInfo {
    return {
      id: peer.id,
      display_name: peer.displayName,
      muted: peer.muted,
      speaking: false,
      is_owner: room ? room.ownerPeerId === peer.id : false,
      force_muted: peer.forceMuted || false,
    };
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  getRooms(): Array<{ id: string; peerCount: number; hasPassword: boolean; maxUsers: number }> {
    return Array.from(this.rooms.values()).map((room) => ({
      id: room.id,
      peerCount: room.peers.size,
      hasPassword: !!room.password,
      maxUsers: room.maxUsers,
    }));
  }

  setOwner(roomId: string, peerId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    room.ownerPeerId = peerId;
    return true;
  }

  getLongestTenurePeer(roomId: string): Peer | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    let oldest: Peer | undefined;
    for (const peer of room.peers.values()) {
      if (!oldest || peer.joinedAt < oldest.joinedAt) {
        oldest = peer;
      }
    }
    return oldest;
  }

  banPeer(roomId: string, peerId: string, durationMs: number): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.bannedUntil.set(peerId, Date.now() + durationMs);
  }

  isBanned(roomId: string, peerId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const until = room.bannedUntil.get(peerId);
    if (!until) return false;
    if (Date.now() >= until) {
      room.bannedUntil.delete(peerId);
      return false;
    }
    return true;
  }

  clearForceMutedFlags(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    for (const peer of room.peers.values()) {
      peer.forceMuted = false;
    }
  }
}

export const roomState = new RoomState();
