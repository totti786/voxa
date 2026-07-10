import { roomState } from './state.js';
import type { Peer } from './state.js';
import type { PeerInfo } from '../types.js';

export interface JoinResult {
  success: boolean;
  error?: string;
  peers?: PeerInfo[];
}

export function joinRoom(
  roomId: string,
  peerId: string,
  displayName: string,
  wsId: string,
  password?: string,
  banKey = peerId
): JoinResult {
  let room = roomState.getRoom(roomId);

  if (!room) {
    room = roomState.createRoom(roomId);
  }

  if (roomState.isBanned(roomId, banKey)) {
    return { success: false, error: 'banned' };
  }

  if (room.password && room.password !== password) {
    return { success: false, error: 'wrong_password' };
  }

  const peer: Peer = {
    id: peerId,
    displayName,
    muted: false,
    wsId,
    banKey,
    joinedAt: new Date(),
    consumers: new Map(),
  };

  const added = roomState.addPeer(roomId, peer);
  if (!added) {
    return { success: false, error: 'room_full' };
  }

  if (room.ownerPeerId === null || !roomState.getPeer(roomId, room.ownerPeerId)) {
    roomState.setOwner(roomId, peerId);
  }

  const peers = roomState
    .getPeers(roomId)
    .filter((p) => p.id !== peerId)
    .map((p) => roomState.toPeerInfo(p, room));

  return { success: true, peers };
}

export function leaveRoom(roomId: string, peerId: string): boolean {
  return roomState.removePeer(roomId, peerId);
}

export function setMute(roomId: string, peerId: string, muted: boolean): boolean {
  return roomState.setPeerMute(roomId, peerId, muted);
}

export function transferOwnership(roomId: string, peerId: string): boolean {
  return roomState.setOwner(roomId, peerId);
}

export function kickPeer(roomId: string, peerId: string): boolean {
  const peer = roomState.getPeer(roomId, peerId);
  if (!peer) return false;
  roomState.banPeer(roomId, peer.banKey ?? peer.id, 5 * 60 * 1000);
  return true;
}

export function forceMutePeer(roomId: string, peerId: string, muted: boolean): boolean {
  const peer = roomState.getPeer(roomId, peerId);
  if (!peer) return false;
  peer.forceMuted = muted;
  peer.muted = muted;
  return true;
}
