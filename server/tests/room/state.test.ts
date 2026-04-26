import { describe, it, expect, beforeEach } from 'vitest';
import { roomState } from '../../src/room/state.js';

describe('room state', () => {
  beforeEach(() => {
    // Reset singleton state between tests
    for (const roomId of Array.from({ length: roomState.getRoomCount() }, (_, i) => `room-${i}`)) {
      roomState.deleteRoom(roomId);
    }
  });

  it('creates and retrieves a room', () => {
    const room = roomState.createRoom('test-room');
    expect(room.id).toBe('test-room');
    expect(room.maxUsers).toBe(10);
    expect(roomState.getRoom('test-room')).toBe(room);
  });

  it('adds and removes peers', () => {
    roomState.createRoom('room-1');
    const peer = { id: 'p1', displayName: 'Alice', muted: false, wsId: 'ws1' };
    expect(roomState.addPeer('room-1', peer)).toBe(true);
    expect(roomState.getPeers('room-1')).toHaveLength(1);
    expect(roomState.removePeer('room-1', 'p1')).toBe(true);
    expect(roomState.getPeers('room-1')).toHaveLength(0);
  });

  it('deletes room when last peer leaves', () => {
    roomState.createRoom('empty-room');
    const peer = { id: 'p1', displayName: 'Bob', muted: false, wsId: 'ws1' };
    roomState.addPeer('empty-room', peer);
    roomState.removePeer('empty-room', 'p1');
    expect(roomState.getRoom('empty-room')).toBeUndefined();
  });

  it('respects max users limit', () => {
    roomState.createRoom('full-room', undefined, 2);
    roomState.addPeer('full-room', { id: 'p1', displayName: 'A', muted: false, wsId: 'ws1' });
    roomState.addPeer('full-room', { id: 'p2', displayName: 'B', muted: false, wsId: 'ws2' });
    expect(roomState.addPeer('full-room', { id: 'p3', displayName: 'C', muted: false, wsId: 'ws3' })).toBe(false);
  });

  it('validates password', () => {
    roomState.createRoom('private-room', 'secret123');
    const room = roomState.getRoom('private-room');
    expect(room?.password).toBe('secret123');
  });

  it('sets and gets owner', () => {
    roomState.createRoom('owner-room');
    expect(roomState.setOwner('owner-room', 'p1')).toBe(true);
    expect(roomState.getRoom('owner-room')?.ownerPeerId).toBe('p1');
    expect(roomState.setOwner('nonexistent', 'p1')).toBe(false);
  });

  it('finds longest tenure peer', () => {
    roomState.createRoom('tenure-room');
    const early = new Date(Date.now() - 10000);
    const late = new Date(Date.now() - 1000);
    roomState.addPeer('tenure-room', { id: 'p1', displayName: 'A', muted: false, wsId: 'ws1', joinedAt: late, consumers: new Map() });
    roomState.addPeer('tenure-room', { id: 'p2', displayName: 'B', muted: false, wsId: 'ws2', joinedAt: early, consumers: new Map() });
    expect(roomState.getLongestTenurePeer('tenure-room')?.id).toBe('p2');
  });

  it('bans and checks ban', () => {
    roomState.createRoom('ban-room');
    roomState.banPeer('ban-room', 'p1', 5 * 60 * 1000);
    expect(roomState.isBanned('ban-room', 'p1')).toBe(true);
    expect(roomState.isBanned('ban-room', 'p2')).toBe(false);
  });

  it('clears force-muted flags', () => {
    roomState.createRoom('fm-room');
    roomState.addPeer('fm-room', { id: 'p1', displayName: 'A', muted: true, forceMuted: true, wsId: 'ws1', joinedAt: new Date(), consumers: new Map() });
    roomState.clearForceMutedFlags('fm-room');
    expect(roomState.getPeer('fm-room', 'p1')?.forceMuted).toBe(false);
  });

  it('includes owner and force_muted in PeerInfo', () => {
    roomState.createRoom('info-room');
    roomState.addPeer('info-room', { id: 'p1', displayName: 'A', muted: false, forceMuted: true, wsId: 'ws1', joinedAt: new Date(), consumers: new Map() });
    roomState.setOwner('info-room', 'p1');
    const info = roomState.toPeerInfo(roomState.getPeer('info-room', 'p1')!, roomState.getRoom('info-room'));
    expect(info.is_owner).toBe(true);
    expect(info.force_muted).toBe(true);
  });
});
