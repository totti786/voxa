import type { ClientMessage, ServerMessage } from '../types.js';

export function validateClientMessage(data: unknown): ClientMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const msg = data as Record<string, unknown>;
  if (typeof msg.type !== 'string') return null;

  switch (msg.type) {
    case 'join':
      if (typeof msg.room !== 'string' || typeof msg.display_name !== 'string') return null;
      return {
        type: 'join',
        room: msg.room,
        password: typeof msg.password === 'string' ? msg.password : undefined,
        display_name: msg.display_name,
      };
    case 'offer':
    case 'answer':
      if (typeof msg.sdp !== 'string') return null;
      return { type: msg.type, sdp: msg.sdp };
    case 'ice':
      if (
        typeof msg.candidate !== 'string' ||
        typeof msg.sdpMid !== 'string' ||
        typeof msg.sdpMLineIndex !== 'number'
      )
        return null;
      return {
        type: 'ice',
        candidate: msg.candidate,
        sdpMid: msg.sdpMid,
        sdpMLineIndex: msg.sdpMLineIndex,
      };
    case 'mute':
      if (typeof msg.muted !== 'boolean') return null;
      return { type: 'mute', muted: msg.muted };
    case 'speaking':
      if (typeof msg.speaking !== 'boolean') return null;
      return { type: 'speaking', speaking: msg.speaking };
    case 'connect_transport':
      if (
        typeof msg.transport_id !== 'string' ||
        typeof msg.dtlsParameters !== 'object'
      )
        return null;
      return {
        type: 'connect_transport',
        transport_id: msg.transport_id,
        dtlsParameters: msg.dtlsParameters,
      };
    case 'produce':
      if (typeof msg.kind !== 'string' || typeof msg.rtpParameters !== 'object')
        return null;
      return {
        type: 'produce',
        kind: msg.kind,
        rtpParameters: msg.rtpParameters,
      };
    case 'leave':
      return { type: 'leave' };
    default:
      return null;
  }
}

export function encodeServerMessage(msg: ServerMessage): string {
  return JSON.stringify(msg);
}
