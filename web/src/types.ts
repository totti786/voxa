export interface SignalingMessage {
  type: string;
}

export interface JoinMessage extends SignalingMessage {
  type: 'join';
  room: string;
  password?: string;
  display_name: string;
}

export interface OfferMessage extends SignalingMessage {
  type: 'offer';
  sdp: string;
}

export interface IceMessage extends SignalingMessage {
  type: 'ice';
  candidate: string;
  sdpMid: string;
  sdpMLineIndex: number;
}

export interface MuteMessage extends SignalingMessage {
  type: 'mute';
  muted: boolean;
}

export interface SpeakingMessage extends SignalingMessage {
  type: 'speaking';
  speaking: boolean;
}

export interface LeaveMessage extends SignalingMessage {
  type: 'leave';
}

export interface ConnectTransportMessage extends SignalingMessage {
  type: 'connect_transport';
  direction: 'send' | 'recv';
  dtlsParameters: unknown;
}

export interface ProduceMessage extends SignalingMessage {
  type: 'produce';
  kind: 'audio';
  rtpParameters: unknown;
}

export interface ClientRtpCapabilitiesMessage extends SignalingMessage {
  type: 'client_rtp_capabilities';
  rtpCapabilities: unknown;
}

export interface ResumeConsumerMessage extends SignalingMessage {
  type: 'resume_consumer';
  consumerId: string;
}

export interface ChatMessage extends SignalingMessage {
  type: 'chat';
  peer_id: string;
  text: string;
  timestamp: number;
}

export interface ClientChatMessage extends SignalingMessage {
  type: 'chat';
  text: string;
}

export interface KickPeerMessage extends SignalingMessage {
  type: 'kick_peer';
  peer_id: string;
}

export interface ForceMuteMessage extends SignalingMessage {
  type: 'force_mute';
  peer_id: string;
  muted: boolean;
}

export type ClientMessage =
  | JoinMessage
  | OfferMessage
  | IceMessage
  | MuteMessage
  | SpeakingMessage
  | LeaveMessage
  | ConnectTransportMessage
  | ProduceMessage
  | ClientRtpCapabilitiesMessage
  | ResumeConsumerMessage
  | ClientChatMessage
  | KickPeerMessage
  | ForceMuteMessage;

export interface PeerInfo {
  id: string;
  display_name: string;
  muted: boolean;
  speaking: boolean;
  is_owner?: boolean;
  force_muted?: boolean;
}

export interface JoinedMessage extends SignalingMessage {
  type: 'joined';
  peers: PeerInfo[];
  self_peer_id: string;
}

export interface PeerJoinedMessage extends SignalingMessage {
  type: 'peer_joined';
  peer: PeerInfo;
}

export interface PeerLeftMessage extends SignalingMessage {
  type: 'peer_left';
  peer_id: string;
}

export interface AnswerMessage extends SignalingMessage {
  type: 'answer';
  sdp: string;
}

export interface ServerIceMessage extends SignalingMessage {
  type: 'ice';
  candidate: string;
  sdpMid: string;
  sdpMLineIndex: number;
}

export interface PeerMuteMessage extends SignalingMessage {
  type: 'peer_mute';
  peer_id: string;
  muted: boolean;
}

export interface PeerSpeakingMessage extends SignalingMessage {
  type: 'peer_speaking';
  peer_id: string;
  speaking: boolean;
}

export interface ErrorMessage extends SignalingMessage {
  type: 'error';
  message: string;
}

export interface TransportParamsMessage extends SignalingMessage {
  type: 'transport_params';
  direction: 'send' | 'recv';
  id: string;
  iceParameters: unknown;
  iceCandidates: unknown[];
  dtlsParameters: unknown;
  iceServers?: RTCIceServer[];
}

export interface RouterCapabilitiesMessage extends SignalingMessage {
  type: 'router_capabilities';
  rtpCapabilities: unknown;
}

export interface ConsumerCreatedMessage extends SignalingMessage {
  type: 'consumer_created';
  consumerId: string;
  producerId: string;
  peerId: string;
  kind: string;
  rtpParameters: unknown;
}

export interface ProducerCreatedMessage extends SignalingMessage {
  type: 'producer_created';
  producerId: string;
}

export interface TransportConnectedMessage extends SignalingMessage {
  type: 'transport_connected';
  direction: 'send' | 'recv';
}

export interface TransportFailedMessage extends SignalingMessage {
  type: 'transport_failed';
  direction: 'send' | 'recv';
  message: string;
}

export interface ProducerClosedMessage extends SignalingMessage {
  type: 'producer_closed';
  producerId: string;
  peerId: string;
}

export interface PeerForceMutedMessage extends SignalingMessage {
  type: 'peer_force_muted';
  peer_id: string;
  muted: boolean;
}

export interface OwnershipChangedMessage extends SignalingMessage {
  type: 'ownership_changed';
  peer_id: string;
}

export interface KickedMessage extends SignalingMessage {
  type: 'kicked';
  reason: string;
}

export type ServerMessage =
  | JoinedMessage
  | PeerJoinedMessage
  | PeerLeftMessage
  | AnswerMessage
  | ServerIceMessage
  | PeerMuteMessage
  | PeerSpeakingMessage
  | ErrorMessage
  | TransportParamsMessage
  | RouterCapabilitiesMessage
  | ConsumerCreatedMessage
  | ProducerCreatedMessage
  | TransportConnectedMessage
  | TransportFailedMessage
  | ProducerClosedMessage
  | ChatMessage
  | PeerForceMutedMessage
  | OwnershipChangedMessage
  | KickedMessage;

export interface RoomSummary {
  id: string;
  peerCount: number;
  hasPassword: boolean;
  maxUsers: number;
}
