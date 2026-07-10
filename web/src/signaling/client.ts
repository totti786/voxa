import type { ClientMessage, ServerMessage, PeerInfo } from '../types.js';

export const PROTOCOL_VERSION = 1;

export type MessageHandler = (msg: ServerMessage) => void | Promise<void>;
export type ConnectHandler = () => void;
export type DisconnectHandler = () => void;
export type ReconnectingHandler = () => void;
export type VersionMismatchHandler = (serverVersion: number) => void;

interface QueuedMessage {
  data: string;
  resolve: () => void;
}

const PING_INTERVAL_MS = 15000;
const PONG_TIMEOUT_MS = 30000;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 8000;
  private shouldReconnect = true;
  private messageHandlers: MessageHandler[] = [];
  private connectHandlers: ConnectHandler[] = [];
  private disconnectHandlers: DisconnectHandler[] = [];
  private reconnectingHandlers: ReconnectingHandler[] = [];
  private versionMismatchHandlers: VersionMismatchHandler[] = [];
  private messageQueue: QueuedMessage[] = [];
  private processingQueue = false;
  private sendQueue: ClientMessage[] = [];
  private firstMessage = true;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly clientId: string;

  constructor(url: string) {
    this.url = url;
    this.clientId = getClientId();
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.shouldReconnect = true;
    this.sendQueue = [];
    this.firstMessage = true;
    const socket = new WebSocket(this.url);
    this.ws = socket;

    socket.onopen = () => {
      if (this.ws !== socket) return;
      this.reconnectDelay = 1000;
      this.flushSendQueue();
      this.startKeepAlive(socket);
      this.connectHandlers.forEach((h) => h());
    };

    socket.onmessage = (event) => {
      if (this.ws !== socket) return;
      this.resetPongTimeout(socket);
      let data: string;
      if (typeof event.data === 'string') {
        data = event.data;
      } else if (event.data instanceof Blob) {
        console.error('[WS] Received binary Blob, skipping');
        return;
      } else {
        data = String(event.data);
      }
      try {
        const parsed = JSON.parse(data);
        console.log('[WS] ←', parsed.type || 'unknown', parsed);
      } catch {
        console.log('[WS] ← raw:', data);
      }
      this.enqueueMessage(data);
    };

    socket.onclose = () => {
      if (this.ws !== socket) return;
      this.stopKeepAlive();
      this.ws = null;
      this.disconnectHandlers.forEach((h) => h());
      if (this.shouldReconnect) {
        this.reconnectingHandlers.forEach((h) => h());
        this.scheduleReconnect();
      }
    };

    socket.onerror = (err) => {
      if (this.ws !== socket) return;
      console.error('WebSocket error:', err);
    };
  }

  private enqueueMessage(data: string): void {
    const promise = new Promise<void>((resolve) => {
      this.messageQueue.push({ data, resolve });
    });
    if (!this.processingQueue) {
      this.processQueue();
    }
    return void promise;
  }

  private async processQueue(): Promise<void> {
    this.processingQueue = true;
    while (this.messageQueue.length > 0) {
      const item = this.messageQueue.shift()!;
      try {
        const msg = JSON.parse(item.data) as ServerMessage;

        // Check protocol version on first message
        if (this.firstMessage) {
          this.firstMessage = false;
          if (msg.type === 'welcome') {
            if (msg.version !== PROTOCOL_VERSION) {
              console.error(`[WS] Protocol version mismatch: server=${msg.version}, client=${PROTOCOL_VERSION}`);
              this.versionMismatchHandlers.forEach((h) => h(msg.version));
              this.shouldReconnect = false;
              this.ws?.close();
              return;
            }
            // Welcome acknowledged — don't pass to regular handlers
            item.resolve();
            continue;
          }
        }
        for (const h of this.messageHandlers) {
          await h(msg);
        }
      } catch (err) {
        console.error('[WS] Error handling message:', err, item.data.slice(0, 200));
      }
      item.resolve();
    }
    this.processingQueue = false;
  }

  private flushSendQueue(): void {
    while (this.sendQueue.length > 0) {
      const msg = this.sendQueue.shift()!;
      this.ws?.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.stopKeepAlive();
    this.clearReconnectTimer();
    this.flushSendQueue();
    this.ws?.close();
    this.ws = null;
  }

  flushAndDisconnect(): void {
    this.shouldReconnect = false;
    this.stopKeepAlive();
    this.clearReconnectTimer();
    this.flushSendQueue();
    const ws = this.ws;
    setTimeout(() => {
      ws?.close();
      if (this.ws === ws) {
        this.ws = null;
      }
    }, 100);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const attempt = () => {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if (this.shouldReconnect) this.connect();
      }, this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    };

    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      const onVisible = () => {
        if (document.visibilityState === 'visible') {
          document.removeEventListener('visibilitychange', onVisible);
          if (this.shouldReconnect) attempt();
        }
      };
      document.addEventListener('visibilitychange', onVisible);
    } else {
      attempt();
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startKeepAlive(socket: WebSocket): void {
    this.pingTimer = setInterval(() => {
      if (this.ws === socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping' }));
      }
    }, PING_INTERVAL_MS);

    this.pongTimer = setTimeout(() => {
      if (this.ws === socket) {
        console.warn('[WS] Pong timeout — closing socket to trigger reconnect');
        socket.close();
      }
    }, PONG_TIMEOUT_MS);
  }

  private resetPongTimeout(socket: WebSocket): void {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
    }
    this.pongTimer = setTimeout(() => {
      if (this.ws === socket) {
        console.warn('[WS] Pong timeout — closing socket to trigger reconnect');
        socket.close();
      }
    }, PONG_TIMEOUT_MS);
  }

  private stopKeepAlive(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  send(msg: ClientMessage): void {
    console.log('[WS] →', msg.type, msg);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.sendQueue.push(msg);
    }
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onConnect(handler: ConnectHandler): void {
    this.connectHandlers.push(handler);
  }

  onDisconnect(handler: DisconnectHandler): void {
    this.disconnectHandlers.push(handler);
  }

  onReconnecting(handler: ReconnectingHandler): void {
    this.reconnectingHandlers.push(handler);
  }

  onVersionMismatch(handler: VersionMismatchHandler): void {
    this.versionMismatchHandlers.push(handler);
  }

  join(room: string, displayName: string, password?: string): void {
    this.send({ type: 'join', room, display_name: displayName, password, client_id: this.clientId });
  }

  leave(): void {
    this.send({ type: 'leave' });
  }

  setMute(muted: boolean): void {
    this.send({ type: 'mute', muted });
  }

  setSpeaking(speaking: boolean): void {
    this.send({ type: 'speaking', speaking });
  }

  connectTransport(direction: 'send' | 'recv', dtlsParameters: unknown): void {
    this.send({ type: 'connect_transport', direction, dtlsParameters });
  }

  produce(kind: 'audio', rtpParameters: unknown): void {
    this.send({ type: 'produce', kind, rtpParameters });
  }

  sendRtpCapabilities(rtpCapabilities: unknown): void {
    this.send({ type: 'client_rtp_capabilities', rtpCapabilities });
  }

  resumeConsumer(consumerId: string): void {
    this.send({ type: 'resume_consumer', consumerId });
  }

  sendChat(text: string): void {
    this.send({ type: 'chat', text });
  }

  kickPeer(peerId: string): void {
    this.send({ type: 'kick_peer', peer_id: peerId });
  }

  forceMute(peerId: string, muted: boolean): void {
    this.send({ type: 'force_mute', peer_id: peerId, muted });
  }
}

function getClientId(): string {
  const key = 'voxa-client-id';
  let storage: Storage | undefined;
  try {
    storage = typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    // Private browsing and non-browser test environments may deny storage.
  }
  const existing = storage?.getItem(key);
  if (existing && /^[a-zA-Z0-9_-]{16,128}$/.test(existing)) return existing;
  const value = globalThis.crypto?.randomUUID?.().replace(/-/g, '') ?? `${Date.now()}${Math.random().toString(36).slice(2)}`;
  storage?.setItem(key, value);
  return value;
}
