import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SignalingClient } from '../../src/signaling/client.js';

// Mock WebSocket
global.WebSocket = vi.fn(() => ({
  send: vi.fn(),
  close: vi.fn(),
  readyState: 1, // OPEN
})) as unknown as typeof WebSocket;
(global.WebSocket as any).OPEN = 1;

describe('SignalingClient', () => {
  let client: SignalingClient;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    client = new SignalingClient('ws://localhost:7880/ws');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('connects and stores handlers', () => {
    const onConnect = vi.fn();
    client.onConnect(onConnect);
    client.connect();
    const wsInstance = (global.WebSocket as unknown as ReturnType<typeof vi.fn>).mock.results[0].value;
    wsInstance.onopen();
    expect(onConnect).toHaveBeenCalled();
  });

  it('sends join message', () => {
    client.connect();
    const wsInstance = (global.WebSocket as unknown as ReturnType<typeof vi.fn>).mock.results[0].value;
    client.join('test-room', 'Alice');
    expect(wsInstance.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'join', room: 'test-room', display_name: 'Alice' })
    );
  });

  it('parses incoming messages', () => {
    const onMessage = vi.fn();
    client.onMessage(onMessage);
    client.connect();
    const wsInstance = (global.WebSocket as unknown as ReturnType<typeof vi.fn>).mock.results[0].value;
    wsInstance.onmessage({ data: JSON.stringify({ type: 'joined', peers: [] }) });
    expect(onMessage).toHaveBeenCalledWith({ type: 'joined', peers: [] });
  });

  it('ignores stale socket closes after a reconnect', () => {
    const onDisconnect = vi.fn();
    client.onDisconnect(onDisconnect);

    client.connect();
    const firstSocket = (global.WebSocket as unknown as ReturnType<typeof vi.fn>).mock.results[0].value;

    client.connect();
    const secondSocket = (global.WebSocket as unknown as ReturnType<typeof vi.fn>).mock.results[1].value;

    firstSocket.onclose();
    expect(onDisconnect).not.toHaveBeenCalled();

    secondSocket.onclose();
    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it('sends ping every 15 seconds', () => {
    client.connect();
    const wsInstance = (global.WebSocket as unknown as ReturnType<typeof vi.fn>).mock.results[0].value;
    wsInstance.onopen();

    expect(wsInstance.send).not.toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }));

    vi.advanceTimersByTime(15000);
    expect(wsInstance.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }));

    vi.advanceTimersByTime(15000);
    expect(wsInstance.send).toHaveBeenCalledTimes(2);
  });

  it('does not close socket when messages arrive within pong timeout', () => {
    client.connect();
    const wsInstance = (global.WebSocket as unknown as ReturnType<typeof vi.fn>).mock.results[0].value;
    wsInstance.onopen();

    vi.advanceTimersByTime(29000);
    wsInstance.onmessage({ data: JSON.stringify({ type: 'joined', peers: [] }) });

    vi.advanceTimersByTime(1000);
    expect(wsInstance.close).not.toHaveBeenCalled();
  });

  it('closes socket when no message received for 30 seconds', () => {
    client.connect();
    const wsInstance = (global.WebSocket as unknown as ReturnType<typeof vi.fn>).mock.results[0].value;
    wsInstance.onopen();

    vi.advanceTimersByTime(30000);
    expect(wsInstance.close).toHaveBeenCalled();
  });

  it('triggers reconnect after pong timeout', () => {
    client.connect();
    const wsInstance = (global.WebSocket as unknown as ReturnType<typeof vi.fn>).mock.results[0].value;
    wsInstance.onopen();

    vi.advanceTimersByTime(30000);
    expect(wsInstance.close).toHaveBeenCalled();

    wsInstance.onclose();
    vi.advanceTimersByTime(1000);
    expect(global.WebSocket).toHaveBeenCalledTimes(2);
  });

  it('clears timers on disconnect', () => {
    client.connect();
    const wsInstance = (global.WebSocket as unknown as ReturnType<typeof vi.fn>).mock.results[0].value;
    wsInstance.onopen();

    client.disconnect();
    expect(wsInstance.close).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60000);
    expect(wsInstance.close).toHaveBeenCalledTimes(1);
    expect(global.WebSocket).toHaveBeenCalledTimes(1);
  });
});
