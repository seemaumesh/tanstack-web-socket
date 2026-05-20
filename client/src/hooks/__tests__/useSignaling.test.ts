import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSignaling, type SignalingHandlers } from '../useSignaling';
import { FakeWebSocket } from '../../test-setup';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function latestWS(): FakeWebSocket {
  const ws = FakeWebSocket.instances.at(-1);
  if (!ws) throw new Error('No FakeWebSocket created yet');
  return ws;
}

function makeHandlers(overrides: Partial<SignalingHandlers> = {}): SignalingHandlers {
  return {
    onPeers: vi.fn(),
    onPeerJoined: vi.fn(),
    onPeerLeft: vi.fn(),
    onOffer: vi.fn(),
    onAnswer: vi.fn(),
    onIceCandidate: vi.fn(),
    ...overrides,
  };
}

function renderSignaling(handlers: SignalingHandlers) {
  return renderHook(() =>
    useSignaling('local-user', 'Tester', '#123456', handlers)
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSignaling', () => {
  describe('connection setup', () => {
    it('opens a WebSocket to the signal endpoint', () => {
      renderSignaling(makeHandlers());
      expect(FakeWebSocket.instances).toHaveLength(1);
      expect(latestWS().url).toMatch(/\/signal$/);
    });

    it('sends a join message immediately when the socket opens', () => {
      renderSignaling(makeHandlers());
      act(() => latestWS().simulateOpen());

      const [first] = latestWS().sentParsed<Record<string, unknown>>();
      expect(first).toEqual({
        type: 'join',
        userId: 'local-user',
        userName: 'Tester',
        color: '#123456',
      });
    });
  });

  describe('outbound message queue', () => {
    it('queues messages sent before the socket is open', () => {
      const { result } = renderSignaling(makeHandlers());

      act(() =>
        result.current.send({
          type: 'ice-candidate',
          from: 'local-user',
          to: 'peer-1',
          candidate: { candidate: 'a', sdpMid: '0', sdpMLineIndex: 0 },
        })
      );

      // Not yet sent — socket still CONNECTING
      expect(latestWS().sent).toHaveLength(0);
    });

    it('flushes queued messages after the join is sent on open', () => {
      const { result } = renderSignaling(makeHandlers());

      act(() =>
        result.current.send({
          type: 'ice-candidate',
          from: 'local-user',
          to: 'peer-1',
          candidate: { candidate: 'a', sdpMid: '0', sdpMLineIndex: 0 },
        })
      );

      act(() => latestWS().simulateOpen());

      const frames = latestWS().sentParsed<Record<string, unknown>>();
      expect(frames).toHaveLength(2);
      expect(frames[0].type).toBe('join');        // join first
      expect(frames[1].type).toBe('ice-candidate'); // then queued message
    });

    it('sends immediately when the socket is already open', () => {
      const { result } = renderSignaling(makeHandlers());
      act(() => latestWS().simulateOpen());

      const before = latestWS().sent.length;
      act(() =>
        result.current.send({
          type: 'offer',
          from: 'local-user',
          to: 'peer-1',
          sdp: { type: 'offer', sdp: 'x' },
        })
      );

      expect(latestWS().sent.length).toBe(before + 1);
    });
  });

  describe('incoming message routing', () => {
    it('routes peers → onPeers', () => {
      const handlers = makeHandlers();
      renderSignaling(handlers);
      act(() => latestWS().simulateOpen());

      act(() =>
        latestWS().simulateMessage({
          type: 'peers',
          peers: [{ id: 'p1', name: 'Alice', color: '#aaa' }],
        })
      );

      expect(handlers.onPeers).toHaveBeenCalledWith([
        { id: 'p1', name: 'Alice', color: '#aaa' },
      ]);
    });

    it('routes peer-joined → onPeerJoined', () => {
      const handlers = makeHandlers();
      renderSignaling(handlers);
      act(() => latestWS().simulateOpen());

      act(() =>
        latestWS().simulateMessage({
          type: 'peer-joined',
          userId: 'p2',
          userName: 'Bob',
          color: '#bbb',
        })
      );

      expect(handlers.onPeerJoined).toHaveBeenCalledWith('p2', 'Bob', '#bbb');
    });

    it('routes peer-left → onPeerLeft', () => {
      const handlers = makeHandlers();
      renderSignaling(handlers);
      act(() => latestWS().simulateOpen());

      act(() => latestWS().simulateMessage({ type: 'peer-left', userId: 'p2' }));

      expect(handlers.onPeerLeft).toHaveBeenCalledWith('p2');
    });

    it('routes offer → onOffer', () => {
      const handlers = makeHandlers();
      renderSignaling(handlers);
      act(() => latestWS().simulateOpen());

      const sdp: RTCSessionDescriptionInit = { type: 'offer', sdp: 'mock-sdp' };
      act(() =>
        latestWS().simulateMessage({ type: 'offer', from: 'p1', to: 'local-user', sdp })
      );

      expect(handlers.onOffer).toHaveBeenCalledWith('p1', sdp);
    });

    it('routes answer → onAnswer', () => {
      const handlers = makeHandlers();
      renderSignaling(handlers);
      act(() => latestWS().simulateOpen());

      const sdp: RTCSessionDescriptionInit = { type: 'answer', sdp: 'mock-sdp' };
      act(() =>
        latestWS().simulateMessage({ type: 'answer', from: 'p1', to: 'local-user', sdp })
      );

      expect(handlers.onAnswer).toHaveBeenCalledWith('p1', sdp);
    });

    it('routes ice-candidate → onIceCandidate', () => {
      const handlers = makeHandlers();
      renderSignaling(handlers);
      act(() => latestWS().simulateOpen());

      const candidate: RTCIceCandidateInit = { candidate: 'c', sdpMid: '0', sdpMLineIndex: 0 };
      act(() =>
        latestWS().simulateMessage({
          type: 'ice-candidate',
          from: 'p1',
          to: 'local-user',
          candidate,
        })
      );

      expect(handlers.onIceCandidate).toHaveBeenCalledWith('p1', candidate);
    });

    it('silently ignores malformed JSON', () => {
      const handlers = makeHandlers();
      renderSignaling(handlers);
      act(() => latestWS().simulateOpen());

      // Simulate raw (non-JSON) message
      act(() => {
        const ws = latestWS();
        ws.onmessage?.(new MessageEvent('message', { data: 'not-json' }));
      });

      expect(handlers.onPeers).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('closes the socket on unmount when OPEN', () => {
      const { unmount } = renderSignaling(makeHandlers());
      act(() => latestWS().simulateOpen());

      const ws = latestWS();
      unmount();

      expect(ws.readyState).toBe(FakeWebSocket.CLOSED);
    });

    it('does not call close() when socket is still CONNECTING on unmount', () => {
      const { unmount } = renderSignaling(makeHandlers());

      const ws = latestWS();
      // readyState is CONNECTING — do not close
      const closeSpy = vi.spyOn(ws, 'close');

      unmount();

      expect(closeSpy).not.toHaveBeenCalled();
    });
  });
});
