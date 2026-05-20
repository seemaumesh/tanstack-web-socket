import '@testing-library/jest-dom';

// ---------------------------------------------------------------------------
// FakeDataChannel — stands in for RTCDataChannel
// ---------------------------------------------------------------------------
export class FakeDataChannel {
  readyState: RTCDataChannelState = 'connecting';
  id: number | null = 0;
  label: string;
  onopen: ((e: Event) => void) | null = null;
  onclose: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;

  readonly sent: string[] = [];

  constructor(label: string) {
    this.label = label;
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 'closing';
    this.onclose?.(new Event('close'));
    this.readyState = 'closed';
  }

  /** Test helper — simulate channel becoming open */
  simulateOpen() {
    this.readyState = 'open';
    this.onopen?.(new Event('open'));
  }

  /** Test helper — simulate an incoming data-channel message */
  simulateMessage(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }));
  }

  /** Parsed view of every sent frame */
  sentParsed<T = unknown>(): T[] {
    return this.sent.map((s) => JSON.parse(s) as T);
  }
}

// ---------------------------------------------------------------------------
// FakePeerConnection — stands in for RTCPeerConnection
// ---------------------------------------------------------------------------
export class FakePeerConnection {
  static instances: FakePeerConnection[] = [];

  connectionState: RTCPeerConnectionState = 'new';
  signalingState: RTCSignalingState = 'stable';
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;

  onicecandidate: ((e: RTCPeerConnectionIceEvent) => void) | null = null;
  onconnectionstatechange: ((e: Event) => void) | null = null;
  ondatachannel: ((e: RTCDataChannelEvent) => void) | null = null;

  /** The data channel created by createDataChannel (negotiated) */
  channel: FakeDataChannel | null = null;

  constructor(_config?: RTCConfiguration) {
    FakePeerConnection.instances.push(this);
  }

  createDataChannel(label: string, _opts?: RTCDataChannelInit): FakeDataChannel {
    this.channel = new FakeDataChannel(label);
    return this.channel;
  }

  createOffer(_opts?: RTCOfferOptions): Promise<RTCSessionDescriptionInit> {
    return Promise.resolve({ type: 'offer', sdp: 'mock-offer-sdp' });
  }

  createAnswer(_opts?: RTCAnswerOptions): Promise<RTCSessionDescriptionInit> {
    return Promise.resolve({ type: 'answer', sdp: 'mock-answer-sdp' });
  }

  setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = desc;
    this.signalingState =
      desc.type === 'offer' ? 'have-local-offer' : 'stable';
    return Promise.resolve();
  }

  setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = desc;
    this.signalingState =
      desc.type === 'offer' ? 'have-remote-offer' : 'stable';
    return Promise.resolve();
  }

  addIceCandidate(_candidate: RTCIceCandidateInit): Promise<void> {
    return Promise.resolve();
  }

  close() {
    this.connectionState = 'closed';
    this.onconnectionstatechange?.(new Event('connectionstatechange'));
  }

  /** Test helper — simulate ICE / DTLS connection completing */
  simulateConnected() {
    this.connectionState = 'connected';
    this.onconnectionstatechange?.(new Event('connectionstatechange'));
  }
}

// ---------------------------------------------------------------------------
// FakeWebSocket — stands in for WebSocket (used by useSignaling)
// ---------------------------------------------------------------------------
export class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: FakeWebSocket[] = [];

  readyState: number = FakeWebSocket.CONNECTING;
  url: string;

  onopen: ((e: Event) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;

  readonly sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSING;
    this.onclose?.(new CloseEvent('close', { code: 1000 }));
    this.readyState = FakeWebSocket.CLOSED;
  }

  /** Test helper — simulate server accepting the connection */
  simulateOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  /** Test helper — simulate an incoming signaling message from the server */
  simulateMessage(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }));
  }

  /** Parsed view of every sent frame */
  sentParsed<T = unknown>(): T[] {
    return this.sent.map((s) => JSON.parse(s) as T);
  }
}

// ---------------------------------------------------------------------------
// Install globals before each test, reset after
// ---------------------------------------------------------------------------
beforeEach(() => {
  FakePeerConnection.instances = [];
  FakeWebSocket.instances = [];

  vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
  vi.stubGlobal('WebSocket', FakeWebSocket);

  // Provide a deterministic local user so getStoredUser() never calls prompt()
  const testUser = JSON.stringify({ id: 'local-user', name: 'Tester', color: '#123456' });
  vi.spyOn(window.sessionStorage, 'getItem').mockReturnValue(testUser);
  vi.spyOn(window.sessionStorage, 'setItem').mockReturnValue(undefined);

  vi.stubGlobal('prompt', vi.fn().mockReturnValue('Tester'));

  // Deterministic UUIDs
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn().mockReturnValue('test-uuid-1234'),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
