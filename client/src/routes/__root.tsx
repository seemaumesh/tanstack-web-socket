import { Outlet } from '@tanstack/react-router';

export function RootLayout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-logo">📝 Collab Docs</span>
        <span className="app-subtitle">Real-time P2P highlighting</span>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
