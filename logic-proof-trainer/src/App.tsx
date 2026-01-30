import { useState } from 'react';
import { TheoremList } from './components/TheoremList/TheoremList';
import { ProofWorkspace } from './components/ProofWorkspace/ProofWorkspace';
import { Portfolio } from './components/Portfolio/Portfolio';
import './styles/main.css';

type View = 'theorems' | 'portfolio';

function App() {
  const [view, setView] = useState<View>('theorems');

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="sidebar-nav">
          <button
            className={`nav-tab ${view === 'theorems' ? 'active' : ''}`}
            onClick={() => setView('theorems')}
          >
            Theorems
          </button>
          <button
            className={`nav-tab ${view === 'portfolio' ? 'active' : ''}`}
            onClick={() => setView('portfolio')}
          >
            Portfolio
          </button>
        </div>
        {view === 'theorems' && <TheoremList />}
      </div>
      {view === 'theorems' ? <ProofWorkspace /> : <Portfolio />}
    </div>
  );
}

export default App;
