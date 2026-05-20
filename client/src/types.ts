// Highlight sent/received over WebRTC DataChannel
export interface Highlight {
  userId: string;
  userName: string;
  color: string;
  paragraphId: string;
  start: number;
  end: number;
}

// Peer info shared via signaling
export interface PeerInfo {
  id: string;
  name: string;
  color: string;
}

// Document structure from REST API
export interface Paragraph {
  id: string;
  text: string;
}

export interface Document {
  id: string;
  title: string;
  paragraphs: Paragraph[];
}

// Signaling messages (client ↔ server)
export type SignalMessage =
  | { type: 'join'; userId: string; userName: string; color: string }
  | { type: 'peers'; peers: PeerInfo[] }
  | { type: 'peer-joined'; userId: string; userName: string; color: string }
  | { type: 'peer-left'; userId: string }
  | { type: 'offer'; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; from: string; to: string; candidate: RTCIceCandidateInit };

// DataChannel messages (peer ↔ peer)
export type DataMessage =
  | { type: 'highlight'; highlight: Highlight }
  | { type: 'clear-highlight'; userId: string };
