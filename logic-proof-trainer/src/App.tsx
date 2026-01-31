import { useState, useEffect } from 'react';
import { TheoremList } from './components/TheoremList/TheoremList';
import { ProofWorkspace } from './components/ProofWorkspace/ProofWorkspace';
import { Portfolio } from './components/Portfolio/Portfolio';
import { Settings } from './components/Settings/Settings';
import { useTheme } from './hooks/useTheme';
import './styles/main.css';

type View = 'theorems' | 'portfolio' | 'settings';

function App() {
  const [view, setView] = useState<View>('theorems');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { theme } = useTheme();

  // Initialize theme on mount
  useEffect(() => {
    if (theme !== 'dark') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, []);

  return (
    <div className="app-container">
      <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-nav">
          <button
            className={`nav-tab ${view === 'theorems' ? 'active' : ''}`}
            onClick={() => setView('theorems')}
            title="Theorems"
          >
            {sidebarCollapsed ? '📐' : 'Theorems'}
          </button>
          <button
            className={`nav-tab ${view === 'portfolio' ? 'active' : ''}`}
            onClick={() => setView('portfolio')}
            title="Portfolio"
          >
            {sidebarCollapsed ? '📁' : 'Portfolio'}
          </button>
          <button
            className={`nav-tab ${view === 'settings' ? 'active' : ''}`}
            onClick={() => setView('settings')}
            title="Settings"
          >
            {sidebarCollapsed ? '⚙️' : 'Settings'}
          </button>
        </div>
        <div className={`sidebar-content ${sidebarCollapsed ? 'hidden' : ''}`}>
          {view === 'theorems' && <TheoremList />}
          {view === 'settings' && <Settings />}
        </div>
        {/* Toggle inside sidebar when expanded */}
        {!sidebarCollapsed && (
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed(true)}
            title="Collapse sidebar"
          >
            ‹
          </button>
        )}
      </div>
      {/* Toggle at fixed position when collapsed */}
      {sidebarCollapsed && (
        <button
          className="sidebar-toggle-collapsed"
          onClick={() => setSidebarCollapsed(false)}
          title="Expand sidebar"
        >
          ›
        </button>
      )}
      {view === 'theorems' || view === 'settings' ? (
        <ProofWorkspace />
      ) : (
        <Portfolio onRetry={() => setView('theorems')} />
      )}
    </div>
  );
}

export default App;
