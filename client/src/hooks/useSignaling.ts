import { useEffect, useRef, useCallback } from 'react';
import type { SignalMessage } from '../types';

const SIGNAL_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/signal`;

export interface SignalingHandlers {
  onPeers: (peers: { id: string; name: string; color: string }[]) => void;
  onPeerJoined: (userId: string, userName: string, color: string) => void;
  onPeerLeft: (userId: string) => void;
  onOffer: (from: string, sdp: RTCSessionDescriptionInit) => void;
  onAnswer: (from: string, sdp: RTCSessionDescriptionInit) => void;
  onIceCandidate: (from: string, candidate: RTCIceCandidateInit) => void;
}

export function useSignaling(
  userId: string,
  userName: string,
  color: string,
  handlers: SignalingHandlers
) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  // Queue for signaling messages sent before WebSocket is open
  const pendingMessagesRef = useRef<SignalMessage[]>([]);

  useEffect(() => {
    if (!userId || !userName) return;

    const ws = new WebSocket(SIGNAL_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', userId, userName, color } satisfies SignalMessage));
      // Flush any pending messages
      const queue = pendingMessagesRef.current;
      while (queue.length > 0) {
        const msg = queue.shift();
        if (msg) ws.send(JSON.stringify(msg));
      }
    };

    ws.onmessage = (evt) => {
      let msg: SignalMessage;
      try {
        msg = JSON.parse(evt.data as string);
      } catch {
        return;
      }

      const h = handlersRef.current;
      switch (msg.type) {
        case 'peers':
          h.onPeers(msg.peers);
          break;
        case 'peer-joined':
          h.onPeerJoined(msg.userId, msg.userName, msg.color);
          break;
        case 'peer-left':
          h.onPeerLeft(msg.userId);
          break;
        case 'offer':
          h.onOffer(msg.from, msg.sdp);
          break;
        case 'answer':
          h.onAnswer(msg.from, msg.sdp);
          break;
        case 'ice-candidate':
          h.onIceCandidate(msg.from, msg.candidate);
          break;
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
    };

    return () => {
      // Only close if not already closed or closing
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [userId, userName, color]);

  const send = useCallback((msg: SignalMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      // Queue the message to be sent when the socket opens
      pendingMessagesRef.current.push(msg);
    }
  }, []);

  return { send };
}
