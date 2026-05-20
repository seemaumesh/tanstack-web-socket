import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const app = express();
app.use(express.json());

// ── CORS for local dev ───────────────────────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

// ── Document content ─────────────────────────────────────────────────────────
const DOCUMENT = {
  id: 'doc-1',
  title: 'The Future of Collaborative Software',
  paragraphs: [
    {
      id: 'p1',
      text: 'Collaboration has always been at the heart of human progress. From ancient scribes copying manuscripts side by side, to modern teams simultaneously editing documents in the cloud, the tools we use to work together shape the quality of our ideas.',
    },
    {
      id: 'p2',
      text: 'Real-time collaboration introduces unique technical challenges. When two people edit the same sentence at the same moment, the system must reconcile their intentions gracefully — without data loss, without jarring conflicts, and without making either contributor feel like a second-class citizen.',
    },
    {
      id: 'p3',
      text: 'WebRTC changes the equation fundamentally. Instead of routing every keystroke through a central server, peers communicate directly with one another. This reduces latency, improves privacy, and eliminates the server as a single point of failure for the data plane.',
    },
    {
      id: 'p4',
      text: 'Highlighting is one of the simplest yet most expressive forms of collaboration. A colored underline says: "I noticed this." It invites discussion without demanding it. It leaves a breadcrumb for future readers and signals attention to the present ones.',
    },
    {
      id: 'p5',
      text: 'Building great collaborative tools requires empathy as much as engineering. Every design decision — from the color palette of user cursors to the debounce delay on selection events — affects whether users feel present with each other or isolated behind glass.',
    },
  ],
};

app.get('/api/document', (_req, res) => {
  res.json(DOCUMENT);
});

// ── WebSocket signaling server ────────────────────────────────────────────────
interface Peer {
  id: string;
  name: string;
  color: string;
  ws: WebSocket;
}

const peers = new Map<string, Peer>();

interface SdpInit {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
}

interface IceCandidateInit {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

type SignalMessage =
  | { type: 'join'; userId: string; userName: string; color: string }
  | { type: 'offer'; from: string; to: string; sdp: SdpInit }
  | { type: 'answer'; from: string; to: string; sdp: SdpInit }
  | { type: 'ice-candidate'; from: string; to: string; candidate: IceCandidateInit }
  | { type: 'leave'; userId: string };

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/signal' });

wss.on('connection', (ws) => {
  let myId = '';

  ws.on('message', (raw) => {
    let msg: SignalMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'join') {
      myId = msg.userId;
      peers.set(myId, { id: myId, name: msg.userName, color: msg.color, ws });

      // Send the new peer a list of existing peers so it can initiate offers
      const existingPeers = [...peers.values()]
        .filter((p) => p.id !== myId)
        .map((p) => ({ id: p.id, name: p.name, color: p.color }));

      ws.send(JSON.stringify({ type: 'peers', peers: existingPeers }));

      // Notify existing peers that someone new joined
      peers.forEach((peer) => {
        if (peer.id !== myId && peer.ws.readyState === WebSocket.OPEN) {
          peer.ws.send(
            JSON.stringify({ type: 'peer-joined', userId: myId, userName: msg.userName, color: msg.color })
          );
        }
      });
      return;
    }

    // Relay offer / answer / ice-candidate to the target peer
    if (msg.type === 'offer' || msg.type === 'answer' || msg.type === 'ice-candidate') {
      const target = peers.get(msg.to);
      if (target && target.ws.readyState === WebSocket.OPEN) {
        target.ws.send(JSON.stringify(msg));
      }
      return;
    }
  });

  ws.on('close', () => {
    if (!myId) return;
    peers.delete(myId);
    peers.forEach((peer) => {
      if (peer.ws.readyState === WebSocket.OPEN) {
        peer.ws.send(JSON.stringify({ type: 'peer-left', userId: myId }));
      }
    });
  });
});

const PORT = process.env.PORT ?? 3001;
server.listen(PORT, () => {
  console.log(`Signaling server listening on http://localhost:${PORT}`);
});
