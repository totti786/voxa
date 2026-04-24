import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { createSignalingServer } from '../../src/signaling/server.js';
import { createWorker } from '../../src/sfu/worker.js';

const previousEnv = {
  RTC_MIN_PORT: process.env.RTC_MIN_PORT,
  RTC_MAX_PORT: process.env.RTC_MAX_PORT,
  TURN_ENABLED: process.env.TURN_ENABLED,
  TURN_SERVER: process.env.TURN_SERVER,
  TURN_USERNAME: process.env.TURN_USERNAME,
  TURN_CREDENTIAL: process.env.TURN_CREDENTIAL,
};

const TEST_RTC_MIN_PORT = '25200';
const TEST_RTC_MAX_PORT = '25300';

describe('signaling server', () => {
  let wss: ReturnType<typeof createSignalingServer>;
  const PORT = 19999;

  beforeAll(async () => {
    process.env.RTC_MIN_PORT = TEST_RTC_MIN_PORT;
    process.env.RTC_MAX_PORT = TEST_RTC_MAX_PORT;
    await createWorker();
    wss = createSignalingServer({ port: PORT });
  });

  afterAll(() => {
    wss.close();
    process.env.RTC_MIN_PORT = previousEnv.RTC_MIN_PORT;
    process.env.RTC_MAX_PORT = previousEnv.RTC_MAX_PORT;
    process.env.TURN_ENABLED = previousEnv.TURN_ENABLED;
    process.env.TURN_SERVER = previousEnv.TURN_SERVER;
    process.env.TURN_USERNAME = previousEnv.TURN_USERNAME;
    process.env.TURN_CREDENTIAL = previousEnv.TURN_CREDENTIAL;
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

  it('includes ice servers in transport params when TURN is configured', async () => {
    process.env.TURN_ENABLED = 'true';
    process.env.TURN_SERVER = 'turn.example.com:3478';
    process.env.TURN_USERNAME = 'voxa';
    process.env.TURN_CREDENTIAL = 'secret';

    const ws = await connect();
    const q = createMessageQueue(ws);
    ws.send(JSON.stringify({ type: 'join', room: 'turn-room', display_name: 'Alice' }));
    let msg = await q.next();
    expect(msg.type).toBe('router_capabilities');
    msg = await q.next();
    expect(msg.type).toBe('transport_params');
    expect(Array.isArray(msg.iceServers)).toBe(true);
    expect(msg.iceServers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ urls: 'stun:stun.l.google.com:19302' }),
        expect.objectContaining({
          urls: ['turn:turn.example.com:3478?transport=udp', 'turn:turn.example.com:3478?transport=tcp'],
          username: 'voxa',
          credential: 'secret',
        }),
      ])
    );
    ws.close();

    delete process.env.TURN_ENABLED;
    delete process.env.TURN_SERVER;
    delete process.env.TURN_USERNAME;
    delete process.env.TURN_CREDENTIAL;
  }, 15000);

  it('rejects invalid json', async () => {
    const ws = await connect();
    const q = createMessageQueue(ws);
    ws.send('not json');
    const msg = await q.next();
    expect(msg.type).toBe('error');
    expect(msg.message).toBe('invalid_json');
    ws.close();
  }, 15000);

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
