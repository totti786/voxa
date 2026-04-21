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
});
