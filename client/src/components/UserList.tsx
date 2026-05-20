import type { PeerInfo } from '../types';

interface Props {
  localUser: { id: string; name: string; color: string };
  peers: PeerInfo[];
}

function UserBadge({ name, color, isLocal }: { name: string; color: string; isLocal?: boolean }) {
  return (
    <div className="user-badge">
      <span className="user-dot" style={{ backgroundColor: color }} />
      <span className="user-name">
        {name || 'Anonymous'}
        {isLocal && <span className="user-you"> (you)</span>}
      </span>
    </div>
  );
}

export function UserList({ localUser, peers }: Props) {
  const total = peers.length + 1;

  return (
    <div className="user-list">
      <h2 className="user-list-title">
        Users
        <span className="user-count">{total}</span>
      </h2>

      <UserBadge name={localUser.name} color={localUser.color} isLocal />

      {peers.length === 0 ? (
        <p className="user-list-empty">Waiting for others to join…</p>
      ) : (
        peers.map((p) => <UserBadge key={p.id} name={p.name} color={p.color} />)
      )}

      <div className="user-list-hint">
        <p>Open another tab to collaborate</p>
      </div>
    </div>
  );
}
