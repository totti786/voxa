import { describe, it, expect } from 'vitest';
import { joinRoom, leaveRoom, setMute } from '../../src/room/manager.js';
import { roomState } from '../../src/room/state.js';

describe('room manager', () => {
  it('creates room on first join', () => {
    const result = joinRoom('new-room', 'p1', 'Alice', 'ws1');
    expect(result.success).toBe(true);
    expect(result.peers).toEqual([]);
    expect(roomState.getRoom('new-room')).toBeDefined();
  });

  it('returns existing peers on join', () => {
    joinRoom('shared-room', 'p1', 'Alice', 'ws1');
    const result = joinRoom('shared-room', 'p2', 'Bob', 'ws2');
    expect(result.success).toBe(true);
    expect(result.peers).toHaveLength(1);
    expect(result.peers?.[0].display_name).toBe('Alice');
  });

  it('rejects wrong password', () => {
    roomState.createRoom('protected', 'secret');
    const result = joinRoom('protected', 'p1', 'Alice', 'ws1', 'wrong');
    expect(result.success).toBe(false);
    expect(result.error).toBe('wrong_password');
  });

  it('accepts correct password', () => {
    roomState.createRoom('protected', 'secret');
    const result = joinRoom('protected', 'p1', 'Alice', 'ws1', 'secret');
    expect(result.success).toBe(true);
  });

  it('removes peer on leave', () => {
    joinRoom('leave-room', 'p1', 'Alice', 'ws1');
    expect(leaveRoom('leave-room', 'p1')).toBe(true);
    expect(roomState.getPeers('leave-room')).toHaveLength(0);
  });

  it('sets mute state', () => {
    joinRoom('mute-room', 'p1', 'Alice', 'ws1');
    expect(setMute('mute-room', 'p1', true)).toBe(true);
    const peer = roomState.getPeer('mute-room', 'p1');
    expect(peer?.muted).toBe(true);
  });
});
