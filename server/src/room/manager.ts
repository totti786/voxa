import { roomState } from './state.js';
import type { Peer } from './state.js';

export interface JoinResult {
  success: boolean;
  error?: string;
  peers?: Array<{ id: string; display_name: string; muted: boolean }>;
}

export function joinRoom(
  roomId: string,
  peerId: string,
  displayName: string,
  wsId: string,
  password?: string
): JoinResult {
  let room = roomState.getRoom(roomId);

  if (!room) {
    room = roomState.createRoom(roomId);
  }

  if (room.password && room.password !== password) {
    return { success: false, error: 'wrong_password' };
  }

  const peer: Peer = {
    id: peerId,
    displayName,
    muted: false,
    wsId,
  };

  const added = roomState.addPeer(roomId, peer);
  if (!added) {
    return { success: false, error: 'room_full' };
  }

  const peers = roomState
    .getPeers(roomId)
    .filter((p) => p.id !== peerId)
    .map((p) => roomState.toPeerInfo(p));

  return { success: true, peers };
}

export function leaveRoom(roomId: string, peerId: string): boolean {
  return roomState.removePeer(roomId, peerId);
}

export function setMute(roomId: string, peerId: string, muted: boolean): boolean {
  return roomState.setPeerMute(roomId, peerId, muted);
}
