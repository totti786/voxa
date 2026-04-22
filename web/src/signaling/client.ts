import type { ClientMessage, ServerMessage, PeerInfo } from '../types.js';

export type MessageHandler = (msg: ServerMessage) => void;
export type ConnectHandler = () => void;
export type DisconnectHandler = () => void;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 8000;
  private shouldReconnect = true;
  private messageHandlers: MessageHandler[] = [];
  private connectHandlers: ConnectHandler[] = [];
  private disconnectHandlers: DisconnectHandler[] = [];

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    this.shouldReconnect = true;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.connectHandlers.forEach((h) => h());
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        console.log('[WS] Received:', msg.type);
        this.messageHandlers.forEach((h) => h(msg));
      } catch {
        console.error('Failed to parse server message:', String(event.data).slice(0, 200));
      }
    };

    this.ws.onclose = () => {
      this.disconnectHandlers.forEach((h) => h());
      if (this.shouldReconnect) {
        setTimeout(() => this.connect(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      }
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.ws?.close();
    this.ws = null;
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
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
}
