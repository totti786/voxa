import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { createSignalingServer } from '../../src/signaling/server.js';

describe('signaling server', () => {
  let wss: ReturnType<typeof createSignalingServer>;
  const PORT = 19999;

  beforeAll(() => {
    wss = createSignalingServer(PORT);
  });

  afterAll(() => {
    wss.close();
  });

  function connect(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
    });
  }

  function waitForMessage(ws: WebSocket): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      ws.once('message', (data) => resolve(JSON.parse(data.toString())));
    });
  }

  it('accepts connections', async () => {
    const ws = await connect();
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('responds to join with joined event', async () => {
    const ws = await connect();
    ws.send(JSON.stringify({ type: 'join', room: 'test-room', display_name: 'Alice' }));
    const msg = await waitForMessage(ws);
    expect(msg.type).toBe('joined');
    expect(Array.isArray(msg.peers)).toBe(true);
    ws.close();
  });

  it('rejects invalid json', async () => {
    const ws = await connect();
    ws.send('not json');
    const msg = await waitForMessage(ws);
    expect(msg.type).toBe('error');
    expect(msg.message).toBe('invalid_json');
    ws.close();
  });

  it('notifies others when peer joins', async () => {
    const ws1 = await connect();
    ws1.send(JSON.stringify({ type: 'join', room: 'notify-room', display_name: 'Alice' }));
    await waitForMessage(ws1); // joined

    const ws2 = await connect();
    ws2.send(JSON.stringify({ type: 'join', room: 'notify-room', display_name: 'Bob' }));
    await waitForMessage(ws2); // joined

    const notify = await waitForMessage(ws1);
    expect(notify.type).toBe('peer_joined');
    expect(notify.peer.display_name).toBe('Bob');

    ws1.close();
    ws2.close();
  });
});
