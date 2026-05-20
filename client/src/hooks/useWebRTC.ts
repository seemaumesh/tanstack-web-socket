import { useState, useRef, useCallback, useEffect } from 'react';
import { useSignaling } from './useSignaling';
import type { Highlight, PeerInfo, DataMessage, SignalMessage } from '../types';
import isEqual from 'lodash.isequal';

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#82E0AA',
];

function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function generateId() {
  return crypto.randomUUID();
}

function getStoredUser(): { id: string; name: string; color: string } {
  const stored = sessionStorage.getItem('collab-user');
  if (stored) return JSON.parse(stored);
  const user = { id: generateId(), name: '', color: randomColor() };
  sessionStorage.setItem('collab-user', JSON.stringify(user));
  return user;
}

interface PeerState extends PeerInfo {
  pc: RTCPeerConnection;
  channel: RTCDataChannel | null;
}

export function useWebRTC() {
  const storedUser = useRef(getStoredUser());

  const [userName, setUserName] = useState<string>(storedUser.current.name);
  const [localUser] = useState<{ id: string; color: string }>({
    id: storedUser.current.id,
    color: storedUser.current.color,
  });

  // Prompt for name if not set
  useEffect(() => {
    if (!storedUser.current.name) {
      const name = prompt('Enter your display name:') ?? 'Anonymous';
      storedUser.current.name = name;
      sessionStorage.setItem('collab-user', JSON.stringify(storedUser.current));
      setUserName(name);
    }
  }, []);

  const [connectedPeers, setConnectedPeers] = useState<PeerInfo[]>([]);
  const [remoteHighlights, setRemoteHighlights] = useState<Highlight[]>([]);
  const [myHighlight, setMyHighlight] = useState<Highlight | null>(null);

  const peersRef = useRef<Map<string, PeerState>>(new Map());
  const signalingRef = useRef<{ send: (msg: SignalMessage) => void } | null>(null);
  // Stores offers that arrive before the corresponding peer-joined is processed
  const pendingOffersRef = useRef<Map<string, RTCSessionDescriptionInit>>(new Map());
  // ICE candidates that arrive before setRemoteDescription is called
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  // Data messages queued until a peer's RTCDataChannel is open
  const pendingDataMessagesRef = useRef<Map<string, string[]>>(new Map());

  const handleDataMessage = useCallback((msg: DataMessage) => {
    if (msg.type === 'highlight') {
      setRemoteHighlights((prev) => {
        const filtered = prev.filter((h) => h.userId !== msg.highlight.userId);
        return [...filtered, msg.highlight];
      });
    } else if (msg.type === 'clear-highlight') {
      setRemoteHighlights((prev) => prev.filter((h) => h.userId !== msg.userId));
    }
  }, []);

  const setupChannel = useCallback(
    (peerId: string, channel: RTCDataChannel) => {
      channel.onopen = () => {
        const queued = pendingDataMessagesRef.current.get(peerId) ?? [];
        if (queued.length > 0) {
          queued.forEach((raw) => channel.send(raw));
          pendingDataMessagesRef.current.delete(peerId);
        }
      };

      channel.onclose = () => {
        console.warn(`[onclose] peerId=${peerId} readyState=${channel.readyState}`);
        const peer = peersRef.current.get(peerId);
        if (peer && peer.channel === channel) {
          peer.channel = null;
        }
      };

      channel.onmessage = (evt) => {
        try {
          const msg: DataMessage = JSON.parse(evt.data as string);
          handleDataMessage(msg);
        } catch {
          // ignore malformed messages
        }
      };
      const peer = peersRef.current.get(peerId);
      if (peer) peer.channel = channel;
    },
    [handleDataMessage]
  );

  const sendToPeerOrQueue = useCallback((peerId: string, raw: string) => {
    const peer = peersRef.current.get(peerId);
    const channel = peer?.channel;

    if (channel?.readyState === 'open') {
      channel.send(raw);
      return;
    }

    const q = pendingDataMessagesRef.current.get(peerId) ?? [];
    q.push(raw);
    // Keep memory bounded in case a peer never reaches open state.
    if (q.length > 100) q.shift();
    pendingDataMessagesRef.current.set(peerId, q);
  }, []);

  const createPeerConnection = useCallback(
    (peerId: string, peerName: string, peerColor: string, isInitiator: boolean) => {
      // Close any existing connection for this peer (e.g. from StrictMode remount)
      const existing = peersRef.current.get(peerId);
      if (existing) {
        existing.pc.close();
        peersRef.current.delete(peerId);
      }

      const pc = new RTCPeerConnection(ICE_CONFIG);

      const peerState: PeerState = { id: peerId, name: peerName, color: peerColor, pc, channel: null };
      peersRef.current.set(peerId, peerState);

      setConnectedPeers((prev) => {
        if (prev.find((p) => p.id === peerId)) return prev;
        return [...prev, { id: peerId, name: peerName, color: peerColor }];
      });

      pc.onicecandidate = (evt) => {
        if (evt.candidate && signalingRef.current) {
          signalingRef.current.send({
            type: 'ice-candidate',
            from: localUser.id,
            to: peerId,
            candidate: evt.candidate.toJSON(),
          });
        }
      };

      pc.onconnectionstatechange = () => {
         if (pc.connectionState === 'failed') {
          if (isInitiator) {
            // Renegotiate ICE without tearing down the peer connection
            pc.createOffer({ iceRestart: true })
              .then(offer => pc.setLocalDescription(offer))
              .then(() => {
                if (signalingRef.current && pc.localDescription) {
                  signalingRef.current.send({
                    type: 'offer',
                    from: localUser.id,
                    to: peerId,
                    sdp: pc.localDescription,
                  });
                }
              })
              .catch(console.error);
          }
          // Non-initiator waits for the restart offer via onOffer
        }
        if (pc.connectionState === 'closed') {
          peersRef.current.delete(peerId);
          pendingCandidatesRef.current.delete(peerId);
          pendingDataMessagesRef.current.delete(peerId);
          setConnectedPeers((prev) => prev.filter((p) => p.id !== peerId));
          setRemoteHighlights((prev) => prev.filter((h) => h.userId !== peerId));
        }
      };

      // Both sides create the same negotiated channel — no ondatachannel race condition
      const channel = pc.createDataChannel('highlights', { negotiated: true, id: 0 });
      setupChannel(peerId, channel);

      if (isInitiator) {

        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => {
            if (signalingRef.current && pc.localDescription) {
              signalingRef.current.send({
                type: 'offer',
                from: localUser.id,
                to: peerId,
                sdp: pc.localDescription,
              });
            }
          })
          .catch(console.error);
      } else {
        // Process any offer that arrived before peer-joined was handled
        const pending = pendingOffersRef.current.get(peerId);
        if (pending) {
          pendingOffersRef.current.delete(peerId);
          pc.setRemoteDescription(pending)
            .then(() => pc.createAnswer())
            .then((answer) => pc.setLocalDescription(answer))
            .then(() => {
              if (signalingRef.current && pc.localDescription) {
                signalingRef.current.send({
                  type: 'answer',
                  from: localUser.id,
                  to: peerId,
                  sdp: pc.localDescription,
                });
              }
            })
            .catch(console.error);
        }
      }

      return pc;
    },
    [localUser.id, setupChannel]
  );

  const signalingHandlers = {
    onPeers: useCallback(
      (peers: PeerInfo[]) => {
        peers.forEach((p) => {
        if (!peersRef.current.has(p.id)) {
          createPeerConnection(p.id, p.name, p.color, true);
        }
      });
      },
      [createPeerConnection]
    ),
    onPeerJoined: useCallback(
      (userId: string, name: string, color: string) => {
        if (!peersRef.current.has(userId)) {
          createPeerConnection(userId, name, color, false);
        }
      },
      [createPeerConnection]
    ),
    onPeerLeft: useCallback((userId: string) => {
      const peer = peersRef.current.get(userId);
      if (peer) {
        peer.pc.close();
        peersRef.current.delete(userId);
      }
      pendingDataMessagesRef.current.delete(userId);
      setConnectedPeers((prev) => prev.filter((p) => p.id !== userId));
      setRemoteHighlights((prev) => prev.filter((h) => h.userId !== userId));
    }, []),
    onOffer: useCallback(
      async (from: string, sdp: RTCSessionDescriptionInit) => {
        const peer = peersRef.current.get(from);
        if (!peer) {
          // peer-joined hasn't arrived yet — stash the offer and process it there
          pendingOffersRef.current.set(from, sdp);
          return;
        }
        const pc = peer.pc;
        try {
          await pc.setRemoteDescription(sdp);
        } catch (err) {
          console.error(`Failed to set remote description from ${from}:`, err);
          return; // Cannot proceed without valid remote description
        }
        
        // Guard: only valid in have-remote-offer state
        if (pc.signalingState !== 'have-remote-offer') {
          console.warn(`Peer ${from} not in have-remote-offer after setting offer, state: ${pc.signalingState}`);
          return;
        }

        // Flush any ICE candidates that arrived before the remote description
        const queued = pendingCandidatesRef.current.get(from) ?? [];
        pendingCandidatesRef.current.delete(from);
        for (const candidate of queued) {
          try { await pc.addIceCandidate(candidate); } catch { /* stale */ }
        }
        
        try {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (signalingRef.current && pc.localDescription) {
            signalingRef.current.send({
              type: 'answer',
              from: localUser.id,
              to: from,
              sdp: pc.localDescription,
            });
          }
        } catch (err) {
          console.error(`Failed to create/send answer to ${from}:`, err);
        }
      },
      [localUser.id]
    ),
    onAnswer: useCallback(async (from: string, sdp: RTCSessionDescriptionInit) => {
      const peer = peersRef.current.get(from);
      if (!peer) return;
      // Only valid in have-local-offer — ignore late/duplicate answers in stable or other states
      if (peer.pc.signalingState !== 'have-local-offer') return;
      await peer.pc.setRemoteDescription(sdp);
      // Flush any ICE candidates that arrived before the remote description
      const queued = pendingCandidatesRef.current.get(from) ?? [];
      pendingCandidatesRef.current.delete(from);
      for (const candidate of queued) {
        try { await peer.pc.addIceCandidate(candidate); } catch { /* stale */ }
      }
    }, []),
    onIceCandidate: useCallback(async (from: string, candidate: RTCIceCandidateInit) => {
      const peer = peersRef.current.get(from);
      if (!peer || !peer.pc.remoteDescription) {
        // Queue until remote description is set
        const q = pendingCandidatesRef.current.get(from) ?? [];
        q.push(candidate);
        pendingCandidatesRef.current.set(from, q);
        return;
      }
      try {
        await peer.pc.addIceCandidate(candidate);
      } catch { /* stale candidate */ }
    }, []),
  };

  const { send } = useSignaling(localUser.id, userName, localUser.color, signalingHandlers);

  // Store send reference so peer connection callbacks can use it
  useEffect(() => {
    signalingRef.current = { send } as typeof signalingRef.current;
  }, [send]);

  // Refactored sendHighlight: only sends if highlight changes
  const sendHighlight = useCallback(
    (highlight: Omit<Highlight, 'userId' | 'userName' | 'color'>) => {
      const full: Highlight = {
        ...highlight,
        userId: localUser.id,
        userName,
        color: localUser.color,
      };
      setMyHighlight((prev) => {
        if (!prev || !isEqual(prev, full)) {
          // Show locally immediately so the user sees their own highlight
          setRemoteHighlights((prevHighlights) => {
            const filtered = prevHighlights.filter((h) => h.userId !== localUser.id);
            return [...filtered, full];
          });
          const msg: DataMessage = { type: 'highlight', highlight: full };
          const raw = JSON.stringify(msg);
          peersRef.current.forEach((_, peerId) => {
            sendToPeerOrQueue(peerId, raw);
          });
          return full;
        }
        return prev;
      });
    },
    [localUser.id, localUser.color, sendToPeerOrQueue, userName]
  );

  // Refactored clearHighlight: only sends if highlight was set
  const clearHighlight = useCallback(() => {
    setMyHighlight((prev) => {
      if (prev) {
        setRemoteHighlights((prevHighlights) => prevHighlights.filter((h) => h.userId !== localUser.id));
        const msg: DataMessage = { type: 'clear-highlight', userId: localUser.id };
        const raw = JSON.stringify(msg);
        peersRef.current.forEach((_, peerId) => {
          sendToPeerOrQueue(peerId, raw);
        });
        return null;
      }
      return prev;
    });
  }, [localUser.id, sendToPeerOrQueue]);

  // Clean up all peer connections on unmount
  useEffect(() => {
    return () => {
      peersRef.current.forEach((peer) => peer.pc.close());
      peersRef.current.clear();
      pendingDataMessagesRef.current.clear();
    };
  }, []);

  return {
    localUser: { ...localUser, name: userName },
    connectedPeers,
    remoteHighlights,
    sendHighlight,
    clearHighlight,
  };
}
