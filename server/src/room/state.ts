import fs from 'fs';
import path from 'path';
import type { PeerInfo } from '../types.js';
import type { WebRtcTransport, Producer, Consumer, RtpCapabilities } from 'mediasoup/types';

export interface Peer {
  id: string;
  displayName: string;
  muted: boolean;
  forceMuted?: boolean;
  wsId: string;
  banKey?: string;
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

interface PersistedRoom {
  id: string;
  password?: string;
  maxUsers: number;
  createdAt: string;
  ownerPeerId: string | null;
  bannedUntil: Record<string, number>;
}

interface PersistedState {
  version: number;
  rooms: PersistedRoom[];
}

const STATE_VERSION = 1;
const STATE_FILE = process.env.STATE_FILE || path.join(process.cwd(), 'voxa-state.json');

class RoomState {
  private rooms = new Map<string, Room>();
  private dirty = false;
  private saveTimer: NodeJS.Timeout | null = null;

  private markDirty(): void {
    this.dirty = true;
    if (!this.saveTimer) {
      this.saveTimer = setTimeout(() => this.saveState(), 500);
    }
  }

  private saveState(): void {
    this.saveTimer = null;
    if (!this.dirty) return;

    const persisted: PersistedState = {
      version: STATE_VERSION,
      rooms: Array.from(this.rooms.values()).map((room) => ({
        id: room.id,
        password: room.password,
        maxUsers: room.maxUsers,
        createdAt: room.createdAt.toISOString(),
        ownerPeerId: room.ownerPeerId,
        bannedUntil: Object.fromEntries(room.bannedUntil),
      })),
    };

    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(persisted, null, 2), 'utf-8');
      this.dirty = false;
    } catch (err) {
      console.error('[STATE] Failed to save state:', err);
    }
  }

  loadState(): void {
    try {
      if (!fs.existsSync(STATE_FILE)) return;

      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const data: PersistedState = JSON.parse(raw);

      if (!data.version || !Array.isArray(data.rooms)) {
        console.warn('[STATE] Invalid state file format, starting fresh');
        return;
      }

      for (const pr of data.rooms) {
        const room: Room = {
          id: pr.id,
          password: pr.password,
          maxUsers: pr.maxUsers || 10,
          peers: new Map(),
          createdAt: new Date(pr.createdAt),
          ownerPeerId: pr.ownerPeerId ?? null,
          bannedUntil: new Map(Object.entries(pr.bannedUntil || {}).map(([k, v]) => [k, Number(v)])),
        };
        // Clean expired bans
        const now = Date.now();
        for (const [peerId, until] of room.bannedUntil) {
          if (now >= until) room.bannedUntil.delete(peerId);
        }
        this.rooms.set(room.id, room);
      }
      console.log(`[STATE] Loaded ${this.rooms.size} rooms from ${STATE_FILE}`);
    } catch (err) {
      console.error('[STATE] Failed to load state:', err);
    }
  }

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
    this.markDirty();
    return room;
  }

  deleteRoom(id: string): boolean {
    const result = this.rooms.delete(id);
    if (result) this.markDirty();
    return result;
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
    if (removed) this.markDirty();
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
    this.markDirty();
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
    this.markDirty();
  }

  isBanned(roomId: string, peerId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const until = room.bannedUntil.get(peerId);
    if (!until) return false;
    if (Date.now() >= until) {
      room.bannedUntil.delete(peerId);
      this.markDirty();
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

  /** Flush pending saves immediately (call before shutdown) */
  flushSync(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.saveState();
  }
}

export const roomState = new RoomState();
