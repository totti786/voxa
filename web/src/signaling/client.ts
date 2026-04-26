import type { ClientMessage, ServerMessage, PeerInfo } from '../types.js';

export type MessageHandler = (msg: ServerMessage) => void | Promise<void>;
export type ConnectHandler = () => void;
export type DisconnectHandler = () => void;
export type ReconnectingHandler = () => void;

interface QueuedMessage {
  data: string;
  resolve: () => void;
}

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
  private messageQueue: QueuedMessage[] = [];
  private processingQueue = false;
  private sendQueue: ClientMessage[] = [];

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    this.shouldReconnect = true;
    this.sendQueue = [];
    const socket = new WebSocket(this.url);
    this.ws = socket;

    socket.onopen = () => {
      if (this.ws !== socket) return;
      this.reconnectDelay = 1000;
      this.flushSendQueue();
      this.connectHandlers.forEach((h) => h());
    };

    socket.onmessage = (event) => {
      if (this.ws !== socket) return;
      let data: string;
      if (typeof event.data === 'string') {
        data = event.data;
      } else if (event.data instanceof Blob) {
        console.error('[WS] Received binary Blob, skipping');
        return;
      } else {
        data = String(event.data);
      }
      this.enqueueMessage(data);
    };

    socket.onclose = () => {
      if (this.ws !== socket) return;
      this.disconnectHandlers.forEach((h) => h());
      if (this.shouldReconnect) {
        this.reconnectingHandlers.forEach((h) => h());
        setTimeout(() => this.connect(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
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
    this.flushSendQueue();
    this.ws?.close();
    this.ws = null;
  }

  flushAndDisconnect(): void {
    this.shouldReconnect = false;
    this.flushSendQueue();
    const ws = this.ws;
    setTimeout(() => {
      ws?.close();
      if (this.ws === ws) {
        this.ws = null;
      }
    }, 100);
  }

  send(msg: ClientMessage): void {
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

  join(room: string, displayName: string, password?: string): void {
    this.send({ type: 'join', room, display_name: displayName, password });
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
