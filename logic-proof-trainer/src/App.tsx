import { useState, useEffect } from 'react';
import { TheoremList } from './components/TheoremList/TheoremList';
import { ProofWorkspace } from './components/ProofWorkspace/ProofWorkspace';
import { Portfolio } from './components/Portfolio/Portfolio';
import { useTheme } from './hooks/useTheme';
import './styles/main.css';

type View = 'theorems' | 'portfolio';

function App() {
  const [view, setView] = useState<View>('theorems');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { theme, toggleHighContrast } = useTheme();

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
        </div>
        <div className={`sidebar-content ${sidebarCollapsed ? 'hidden' : ''}`}>
          {view === 'theorems' && <TheoremList />}
        </div>
      </div>
      <button
        className="sidebar-toggle"
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {sidebarCollapsed ? '›' : '‹'}
      </button>
      <button
        className="theme-toggle"
        onClick={toggleHighContrast}
        title={theme === 'dark' ? 'Switch to high contrast' : 'Switch to dark theme'}
      >
        {theme === 'dark' ? '◐' : '◑'}
      </button>
      {view === 'theorems' ? <ProofWorkspace /> : <Portfolio onRetry={() => setView('theorems')} />}
    </div>
  );
}

export default App;
