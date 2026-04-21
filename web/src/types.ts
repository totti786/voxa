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

export type ClientMessage =
  | JoinMessage
  | OfferMessage
  | IceMessage
  | MuteMessage
  | SpeakingMessage
  | LeaveMessage;

export interface PeerInfo {
  id: string;
  display_name: string;
  muted: boolean;
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

export type ServerMessage =
  | JoinedMessage
  | PeerJoinedMessage
  | PeerLeftMessage
  | AnswerMessage
  | ServerIceMessage
  | PeerMuteMessage
  | PeerSpeakingMessage
  | ErrorMessage;
