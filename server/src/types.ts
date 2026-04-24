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

export type ClientMessage =
  | JoinMessage
  | OfferMessage
  | AnswerMessage
  | IceMessage
  | MuteMessage
  | SpeakingMessage
  | LeaveMessage
  | ConnectTransportMessage
  | ProduceMessage
  | ClientRtpCapabilitiesMessage
  | ResumeConsumerMessage;

export interface PeerInfo {
  id: string;
  display_name: string;
  muted: boolean;
  speaking: boolean;
}

export interface JoinedMessage extends SignalingMessage {
  type: 'joined';
  peers: PeerInfo[];
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
  iceServers?: Array<{
    urls: string | string[];
    username?: string;
    credential?: string;
  }>;
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
  | ProducerClosedMessage;
