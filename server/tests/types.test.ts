import { describe, it, expect } from 'vitest';
import type { JoinMessage, PeerInfo, ServerMessage } from '../src/types.js';

describe('types', () => {
  it('join message has required fields', () => {
    const msg: JoinMessage = {
      type: 'join',
      room: 'test-room',
      display_name: 'Alice',
    };
    expect(msg.type).toBe('join');
    expect(msg.room).toBe('test-room');
    expect(msg.display_name).toBe('Alice');
  });

  it('peer info has required fields', () => {
    const peer: PeerInfo = {
      id: 'peer-1',
      display_name: 'Bob',
      muted: false,
    };
    expect(peer.id).toBe('peer-1');
  });

  it('server error message has message field', () => {
    const msg: ServerMessage = {
      type: 'error',
      message: 'room_full',
    };
    expect(msg.type).toBe('error');
    expect((msg as Extract<ServerMessage, { type: 'error' }>).message).toBe('room_full');
  });
});
