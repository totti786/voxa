import type { ClientMessage, ServerMessage } from '../types.js';

export const PROTOCOL_VERSION = 1;

export function validateClientMessage(data: unknown): ClientMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const msg = data as Record<string, unknown>;
  if (typeof msg.type !== 'string') return null;

  switch (msg.type) {
    case 'join':
      if (typeof msg.room !== 'string' || typeof msg.display_name !== 'string') return null;
      if (!msg.room.trim() || msg.room.length > 64) return null;
      if (!msg.display_name.trim() || msg.display_name.length > 32) return null;
      return {
        type: 'join',
        room: msg.room.trim(),
        password: typeof msg.password === 'string' ? msg.password : undefined,
        display_name: msg.display_name.trim(),
      };
    case 'offer':
      if (typeof msg.sdp !== 'string') return null;
      return { type: 'offer', sdp: msg.sdp };
    case 'answer':
      if (typeof msg.sdp !== 'string') return null;
      return { type: 'answer', sdp: msg.sdp };
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
        (msg.direction !== 'send' && msg.direction !== 'recv') ||
        typeof msg.dtlsParameters !== 'object' ||
        msg.dtlsParameters === null ||
        !Array.isArray((msg.dtlsParameters as Record<string, unknown>).fingerprints)
      )
        return null;
      return {
        type: 'connect_transport',
        direction: msg.direction,
        dtlsParameters: msg.dtlsParameters,
      };
    case 'produce':
      if (
        msg.kind !== 'audio' ||
        typeof msg.rtpParameters !== 'object' ||
        msg.rtpParameters === null
      )
        return null;
      return {
        type: 'produce',
        kind: msg.kind,
        rtpParameters: msg.rtpParameters,
      };
    case 'client_rtp_capabilities':
      if (
        typeof msg.rtpCapabilities !== 'object' ||
        msg.rtpCapabilities === null
      )
        return null;
      return {
        type: 'client_rtp_capabilities',
        rtpCapabilities: msg.rtpCapabilities,
      };
    case 'resume_consumer':
      if (typeof msg.consumerId !== 'string') return null;
      return {
        type: 'resume_consumer',
        consumerId: msg.consumerId,
      };
    case 'chat':
      if (typeof msg.text !== 'string') return null;
      const trimmed = msg.text.trim();
      if (!trimmed || trimmed.length > 500) return null;
      return { type: 'chat', text: trimmed };
    case 'kick_peer':
      if (typeof msg.peer_id !== 'string') return null;
      return { type: 'kick_peer', peer_id: msg.peer_id };
    case 'force_mute':
      if (typeof msg.peer_id !== 'string' || typeof msg.muted !== 'boolean') return null;
      return { type: 'force_mute', peer_id: msg.peer_id, muted: msg.muted };
    case 'leave':
      return { type: 'leave' };
    default:
      return null;
  }
}

export function encodeServerMessage(msg: ServerMessage): string {
  return JSON.stringify(msg);
}
