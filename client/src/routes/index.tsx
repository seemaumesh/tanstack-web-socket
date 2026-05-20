import { useWebRTC } from '../hooks/useWebRTC';
import { Document } from '../components/Document';
import { UserList } from '../components/UserList';

export function IndexPage() {
  const { localUser, connectedPeers, remoteHighlights, sendHighlight, clearHighlight } = useWebRTC();

  return (
    <div className="page-layout">
      <aside className="sidebar">
        <UserList localUser={localUser} peers={connectedPeers} />
      </aside>
      <section className="document-area">
        <Document
          remoteHighlights={remoteHighlights}
          onHighlight={sendHighlight}
          onClearHighlight={clearHighlight}
        />
      </section>
    </div>
  );
}
