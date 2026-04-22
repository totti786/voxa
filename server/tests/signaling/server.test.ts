import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { createSignalingServer } from '../../src/signaling/server.js';
import { createWorker } from '../../src/sfu/worker.js';

describe('signaling server', () => {
  let wss: ReturnType<typeof createSignalingServer>;
  const PORT = 19999;

  beforeAll(async () => {
    await createWorker();
    wss = createSignalingServer({ port: PORT });
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

  function createMessageQueue(ws: WebSocket): { next: () => Promise<Record<string, unknown>> } {
    const messages: Record<string, unknown>[] = [];
    const resolvers: Array<(msg: Record<string, unknown>) => void> = [];
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (resolvers.length > 0) {
        resolvers.shift()!(msg);
      } else {
        messages.push(msg);
      }
    });
    return {
      next: () => {
        if (messages.length > 0) {
          return Promise.resolve(messages.shift()!);
        }
        return new Promise((resolve) => resolvers.push(resolve));
      },
    };
  }

  it('accepts connections', async () => {
    const ws = await connect();
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('responds to join with joined event', async () => {
    const ws = await connect();
    const q = createMessageQueue(ws);
    ws.send(JSON.stringify({ type: 'join', room: 'test-room', display_name: 'Alice' }));
    let msg = await q.next();
    expect(msg.type).toBe('router_capabilities');
    msg = await q.next();
    expect(msg.type).toBe('transport_params');
    msg = await q.next();
    expect(msg.type).toBe('transport_params');
    msg = await q.next();
    expect(msg.type).toBe('joined');
    expect(Array.isArray(msg.peers)).toBe(true);
    ws.close();
  }, 15000);

  it('rejects invalid json', async () => {
    const ws = await connect();
    const q = createMessageQueue(ws);
    ws.send('not json');
    const msg = await q.next();
    expect(msg.type).toBe('error');
    expect(msg.message).toBe('invalid_json');
    ws.close();
  });

  it('notifies others when peer joins', async () => {
    const ws1 = await connect();
    const q1 = createMessageQueue(ws1);
    ws1.send(JSON.stringify({ type: 'join', room: 'notify-room', display_name: 'Alice' }));
    for (let i = 0; i < 4; i++) await q1.next();

    const ws2 = await connect();
    const q2 = createMessageQueue(ws2);
    ws2.send(JSON.stringify({ type: 'join', room: 'notify-room', display_name: 'Bob' }));
    for (let i = 0; i < 4; i++) await q2.next();

    const notify = await q1.next();
    expect(notify.type).toBe('peer_joined');
    expect(notify.peer.display_name).toBe('Bob');

    ws1.close();
    ws2.close();
  }, 15000);
});
