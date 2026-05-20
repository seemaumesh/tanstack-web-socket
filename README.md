# TanStack Document Collaboration

Real-time collaborative document highlighting using **WebRTC P2P DataChannels** and a lightweight **WebSocket signaling server**.

## How it works

1. Users open the app and enter a display name
2. Each user connects to the signaling server (WebSocket) to exchange WebRTC handshake messages
3. A direct **RTCDataChannel** is established between every pair of peers (full mesh)
4. When a user selects text, the highlight is sent **peer-to-peer** — the server never sees it
5. All connected users see each other's highlights in real time with unique colors

## Stack

- **Client**: Vite + React + TypeScript + TanStack Router + TanStack Query
- **Server**: Node.js + Express + `ws` (signaling only)
- **P2P**: WebRTC `RTCPeerConnection` + `RTCDataChannel`

## Getting started

```bash
# Install dependencies
pnpm install

# Start signaling server (port 3001)
pnpm dev:server

# Start client dev server (port 5173)
pnpm dev:client
```

Open two browser tabs at `http://localhost:5173` to test real-time highlight sync.
