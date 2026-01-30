import { TheoremList } from './components/TheoremList/TheoremList';
import { ProofWorkspace } from './components/ProofWorkspace/ProofWorkspace';
import './styles/main.css';

function App() {
  return (
    <div className="app-container">
      <TheoremList />
      <ProofWorkspace />
    </div>
  );
}

export default App;
