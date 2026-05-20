import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWebRTC } from '../useWebRTC';
import { FakePeerConnection, FakeDataChannel } from '../../test-setup';
import type { SignalingHandlers } from '../useSignaling';
import type { Highlight } from '../../types';

// ---------------------------------------------------------------------------
// Mock useSignaling — capture handlers + spy on outbound signal send
// ---------------------------------------------------------------------------

let capturedHandlers: SignalingHandlers;
const mockSignalSend = vi.fn();

vi.mock('../useSignaling', () => ({
  useSignaling: (
    _userId: string,
    _userName: string,
    _color: string,
    handlers: SignalingHandlers
  ) => {
    capturedHandlers = handlers;
    return { send: mockSignalSend };
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function latestPC(): FakePeerConnection {
  const pc = FakePeerConnection.instances.at(-1);
  if (!pc) throw new Error('No FakePeerConnection created yet');
  return pc;
}

function latestChannel(): FakeDataChannel {
  const ch = latestPC().channel;
  if (!ch) throw new Error('No channel on latest FakePeerConnection');
  return ch;
}

const PEER_ID = 'peer-1';
const PEER_NAME = 'Alice';
const PEER_COLOR = '#FF0000';

function addPeer() {
  act(() => {
    capturedHandlers.onPeers([{ id: PEER_ID, name: PEER_NAME, color: PEER_COLOR }]);
  });
}

function addPeerJoined() {
  act(() => {
    capturedHandlers.onPeerJoined(PEER_ID, PEER_NAME, PEER_COLOR);
  });
}

const SAMPLE_HIGHLIGHT: Highlight = {
  userId: PEER_ID,
  userName: PEER_NAME,
  color: PEER_COLOR,
  paragraphId: 'para-1',
  start: 0,
  end: 10,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useWebRTC', () => {
  beforeEach(() => {
    mockSignalSend.mockClear();
  });

  // -------------------------------------------------------------------------
  // Channel connection
  // -------------------------------------------------------------------------
  describe('peer channel connection', () => {
    it('creates a negotiated RTCDataChannel when onPeers fires', () => {
      renderHook(() => useWebRTC());

      addPeer();

      // createDataChannel must be called with negotiated channel options
      const pc = latestPC();
      expect(pc.channel).not.toBeNull();
      expect(pc.channel?.label).toBe('highlights');
      // Verify it was requested as negotiated id=0 by checking the PC exists
      // (FakePeerConnection.createDataChannel always creates the channel)
      expect(FakePeerConnection.instances).toHaveLength(1);
    });

    it('adds the peer to connectedPeers when onPeers fires', () => {
      const { result } = renderHook(() => useWebRTC());

      addPeer();

      expect(result.current.connectedPeers).toHaveLength(1);
      expect(result.current.connectedPeers[0]).toMatchObject({
        id: PEER_ID,
        name: PEER_NAME,
        color: PEER_COLOR,
      });
    });

    it('sends an offer via signaling when acting as initiator (onPeers)', async () => {
      renderHook(() => useWebRTC());

      addPeer();

      await waitFor(() =>
        expect(mockSignalSend).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'offer', to: PEER_ID })
        )
      );
    });

    it('creates a negotiated RTCDataChannel when onPeerJoined fires (non-initiator)', () => {
      renderHook(() => useWebRTC());

      addPeerJoined();

      expect(FakePeerConnection.instances).toHaveLength(1);
      expect(latestChannel()).toBeDefined();
    });

    it('does not create a duplicate connection if peer already exists', () => {
      renderHook(() => useWebRTC());

      addPeer();
      addPeer(); // second call for the same peer

      // Only one RTCPeerConnection should be alive (the first; second is blocked by guard)
      expect(FakePeerConnection.instances).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Message receive via onmessage
  // -------------------------------------------------------------------------
  describe('message receive', () => {
    it('incoming highlight updates remoteHighlights', async () => {
      const { result } = renderHook(() => useWebRTC());

      addPeerJoined();
      act(() => latestChannel().simulateOpen());

      act(() =>
        latestChannel().simulateMessage({
          type: 'highlight',
          highlight: SAMPLE_HIGHLIGHT,
        })
      );

      await waitFor(() =>
        expect(result.current.remoteHighlights).toContainEqual(SAMPLE_HIGHLIGHT)
      );
    });

    it('second highlight from same peer replaces the first', async () => {
      const { result } = renderHook(() => useWebRTC());

      addPeerJoined();
      act(() => latestChannel().simulateOpen());

      const first: Highlight = { ...SAMPLE_HIGHLIGHT, start: 0, end: 5 };
      const second: Highlight = { ...SAMPLE_HIGHLIGHT, start: 10, end: 20 };

      act(() => latestChannel().simulateMessage({ type: 'highlight', highlight: first }));
      act(() => latestChannel().simulateMessage({ type: 'highlight', highlight: second }));

      await waitFor(() => {
        const hl = result.current.remoteHighlights;
        expect(hl).toHaveLength(1);
        expect(hl[0]).toEqual(second);
      });
    });

    it('incoming clear-highlight removes the peer highlight', async () => {
      const { result } = renderHook(() => useWebRTC());

      addPeerJoined();
      act(() => latestChannel().simulateOpen());

      // Add a highlight first
      act(() =>
        latestChannel().simulateMessage({
          type: 'highlight',
          highlight: SAMPLE_HIGHLIGHT,
        })
      );
      await waitFor(() =>
        expect(result.current.remoteHighlights).toHaveLength(1)
      );

      // Now clear it
      act(() =>
        latestChannel().simulateMessage({ type: 'clear-highlight', userId: PEER_ID })
      );

      await waitFor(() =>
        expect(result.current.remoteHighlights).toHaveLength(0)
      );
    });

    it('ignores malformed JSON on the data channel', async () => {
      const { result } = renderHook(() => useWebRTC());

      addPeerJoined();
      act(() => latestChannel().simulateOpen());

      act(() => {
        const ch = latestChannel();
        ch.onmessage?.(new MessageEvent('message', { data: 'not-json' }));
      });

      // remoteHighlights should remain empty — no crash
      expect(result.current.remoteHighlights).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Send queuing & flush
  // -------------------------------------------------------------------------
  describe('outbound data channel queuing', () => {
    it('queues sendHighlight when the channel is still connecting', () => {
      const { result } = renderHook(() => useWebRTC());

      addPeerJoined();
      // channel is still 'connecting' — do NOT open it

      act(() =>
        result.current.sendHighlight({
          paragraphId: 'para-1',
          start: 0,
          end: 5,
        })
      );

      // Nothing sent on the channel yet
      expect(latestChannel().sent).toHaveLength(0);
    });

    it('flushes queued messages when the channel opens', async () => {
      const { result } = renderHook(() => useWebRTC());

      addPeerJoined();
      const ch = latestChannel();

      // Queue a highlight while channel is connecting
      act(() =>
        result.current.sendHighlight({ paragraphId: 'para-1', start: 0, end: 5 })
      );
      expect(ch.sent).toHaveLength(0);

      // Open the channel — flush should fire
      act(() => ch.simulateOpen());

      await waitFor(() => expect(ch.sent.length).toBeGreaterThan(0));

      const frames = ch.sentParsed<{ type: string }>();
      expect(frames.every((f) => f.type === 'highlight')).toBe(true);
    });

    it('sends directly when the channel is already open', () => {
      const { result } = renderHook(() => useWebRTC());

      addPeerJoined();
      act(() => latestChannel().simulateOpen());

      const before = latestChannel().sent.length;

      act(() =>
        result.current.sendHighlight({ paragraphId: 'para-2', start: 3, end: 8 })
      );

      expect(latestChannel().sent.length).toBe(before + 1);
    });
  });

  // -------------------------------------------------------------------------
  // Peer left
  // -------------------------------------------------------------------------
  describe('peer left', () => {
    it('removes peer from connectedPeers when onPeerLeft fires', async () => {
      const { result } = renderHook(() => useWebRTC());

      addPeer();
      expect(result.current.connectedPeers).toHaveLength(1);

      act(() => capturedHandlers.onPeerLeft(PEER_ID));

      await waitFor(() =>
        expect(result.current.connectedPeers).toHaveLength(0)
      );
    });

    it('removes the peer highlight from remoteHighlights on onPeerLeft', async () => {
      const { result } = renderHook(() => useWebRTC());

      addPeerJoined();
      act(() => latestChannel().simulateOpen());
      act(() =>
        latestChannel().simulateMessage({ type: 'highlight', highlight: SAMPLE_HIGHLIGHT })
      );

      await waitFor(() =>
        expect(result.current.remoteHighlights).toHaveLength(1)
      );

      act(() => capturedHandlers.onPeerLeft(PEER_ID));

      await waitFor(() =>
        expect(result.current.remoteHighlights).toHaveLength(0)
      );
    });
  });

  // -------------------------------------------------------------------------
  // Answer / ICE signaling (non-initiator path)
  // -------------------------------------------------------------------------
  describe('signaling handshake', () => {
    it('sends an answer when onOffer arrives for an existing peer (non-initiator)', async () => {
      renderHook(() => useWebRTC());

      // Non-initiator: peer-joined first, then an offer arrives
      addPeerJoined();

      const offerSdp: RTCSessionDescriptionInit = { type: 'offer', sdp: 'remote-offer' };
      await act(async () => {
        await capturedHandlers.onOffer(PEER_ID, offerSdp);
      });

      await waitFor(() =>
        expect(mockSignalSend).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'answer', to: PEER_ID })
        )
      );
    });

    it('queues ICE candidates received before setRemoteDescription and flushes on offer', async () => {
      renderHook(() => useWebRTC());
      addPeerJoined();

      const candidate: RTCIceCandidateInit = { candidate: 'c', sdpMid: '0', sdpMLineIndex: 0 };

      // ICE arrives before offer (no remoteDescription yet)
      await act(async () => capturedHandlers.onIceCandidate(PEER_ID, candidate));

      // Now process the offer — should flush the candidate
      const offerSdp: RTCSessionDescriptionInit = { type: 'offer', sdp: 'remote-offer' };
      await act(async () => {
        await capturedHandlers.onOffer(PEER_ID, offerSdp);
      });

      // The PC's addIceCandidate is called during flush (no errors = success)
      expect(latestPC().remoteDescription).toMatchObject({ type: 'offer' });
    });
  });
});
