import { useEffect, useState } from 'react';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useProof } from '../../hooks/useProof';
import type { PortfolioEntry } from '../../types';
import { FitchBox } from '../ProofWorkspace/FitchBox';
import { FormulaDisplay } from '../FormulaDisplay';

interface PortfolioProps {
  onRetry?: () => void;
}

export const Portfolio: React.FC<PortfolioProps> = ({ onRetry }) => {
  const {
    entries,
    isLoading,
    error,
    selectedEntry,
    loadPortfolio,
    deleteEntry,
    updateNotes,
    renameEntry,
    selectEntry,
    clearError,
  } = usePortfolio();

  const { createProof } = useProof();

  const [notesInput, setNotesInput] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  useEffect(() => {
    loadPortfolio();
  }, [loadPortfolio]);

  useEffect(() => {
    if (selectedEntry) {
      setNotesInput(selectedEntry.notes || '');
    }
  }, [selectedEntry]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTime = (secs?: number) => {
    if (!secs) return '-';
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    if (mins > 0) {
      return `${mins}m ${remainingSecs}s`;
    }
    return `${remainingSecs}s`;
  };

  const handleSaveNotes = async () => {
    if (selectedEntry) {
      await updateNotes(selectedEntry.id, notesInput);
      setEditingNotes(false);
    }
  };

  const handleStartRename = () => {
    if (selectedEntry) {
      setNameInput(selectedEntry.proof.theorem.name || '');
      setIsEditingName(true);
    }
  };

  const handleSaveRename = async () => {
    if (selectedEntry && nameInput.trim()) {
      await renameEntry(selectedEntry.id, nameInput.trim());
    }
    setIsEditingName(false);
  };

  const handleCancelRename = () => {
    setIsEditingName(false);
    setNameInput('');
  };

  const handleDelete = async (entry: PortfolioEntry) => {
    if (confirm('Are you sure you want to delete this proof from your portfolio?')) {
      await deleteEntry(entry.id);
    }
  };

  const handleRetry = async (entry: PortfolioEntry) => {
    await createProof(entry.proof.theorem);
    onRetry?.();
  };

  if (isLoading && entries.length === 0) {
    return (
      <div className="portfolio-container">
        <div className="empty-state">Loading portfolio...</div>
      </div>
    );
  }

  return (
    <div className="portfolio-container">
      <div className="portfolio-header">
        <h2>My Portfolio</h2>
        <span className="portfolio-count">{entries.length} proofs completed</span>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={clearError} className="btn-icon">×</button>
        </div>
      )}

      <div className="portfolio-layout">
        {/* Entry List */}
        <div className="portfolio-list">
          {entries.length === 0 ? (
            <div className="empty-state">
              <h3>No proofs yet</h3>
              <p>Complete a proof to add it to your portfolio!</p>
            </div>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className={`portfolio-entry ${selectedEntry?.id === entry.id ? 'selected' : ''}`}
                onClick={() => selectEntry(entry)}
              >
                <div className="entry-header">
                  <span className="entry-name">
                    {entry.proof.theorem.name || 'Custom Proof'}
                  </span>
                  <span className="entry-date">{formatDate(entry.completed_at)}</span>
                </div>
                <div className="entry-formula">
                  {entry.proof.theorem.premises.length > 0 && (
                    <>
                      {entry.proof.theorem.premises.map((p, i) => (
                        <span key={i}>
                          <FormulaDisplay formula={p} />
                          {i < entry.proof.theorem.premises.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                      {' ∴ '}
                    </>
                  )}
                  <FormulaDisplay formula={entry.proof.theorem.conclusion} />
                </div>
                <div className="entry-stats">
                  <span>{entry.steps_count} steps</span>
                  <span>{formatTime(entry.time_spent_secs)}</span>
                  <span>{entry.hints_used} hints</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Entry Detail */}
        {selectedEntry && (
          <div className="portfolio-detail">
            <div className="detail-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isEditingName ? (
                  <>
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRename();
                        if (e.key === 'Escape') handleCancelRename();
                      }}
                      autoFocus
                      style={{
                        padding: '4px 8px',
                        fontSize: '1rem',
                        fontWeight: 600,
                        border: '1px solid var(--accent)',
                        borderRadius: '4px',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        outline: 'none',
                        minWidth: '150px',
                      }}
                      placeholder="Enter name..."
                    />
                    <button className="btn btn-primary btn-small" onClick={handleSaveRename}>
                      Save
                    </button>
                    <button className="btn btn-secondary btn-small" onClick={handleCancelRename}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <h3 style={{ cursor: 'pointer' }} onClick={handleStartRename} title="Click to rename">
                      {selectedEntry.proof.theorem.name || 'Custom Proof'}
                    </h3>
                    <button
                      className="btn-icon"
                      onClick={handleStartRename}
                      title="Rename"
                      style={{ fontSize: '0.75rem' }}
                    >
                      ✏️
                    </button>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => handleRetry(selectedEntry)}
                >
                  Retry
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleDelete(selectedEntry)}
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="detail-theorem">
              <div className="label">Theorem</div>
              <div className="formula">
                {selectedEntry.proof.theorem.premises.length > 0 && (
                  <>
                    {selectedEntry.proof.theorem.premises.map((p, i) => (
                      <span key={i}>
                        <FormulaDisplay formula={p} />
                        {i < selectedEntry.proof.theorem.premises.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                    {' ∴ '}
                  </>
                )}
                <FormulaDisplay formula={selectedEntry.proof.theorem.conclusion} />
              </div>
            </div>

            <div className="detail-stats">
              <div className="stat">
                <span className="stat-label">Completed</span>
                <span className="stat-value">{formatDate(selectedEntry.completed_at)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Steps</span>
                <span className="stat-value">{selectedEntry.steps_count}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Time</span>
                <span className="stat-value">{formatTime(selectedEntry.time_spent_secs)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Hints Used</span>
                <span className="stat-value">{selectedEntry.hints_used}</span>
              </div>
            </div>

            <div className="detail-proof">
              <div className="label">Solution</div>
              <FitchBox
                proof={selectedEntry.proof}
                readOnly={true}
              />
            </div>

            <div className="detail-notes">
              <div className="label">Notes</div>
              {editingNotes ? (
                <div className="notes-editor">
                  <textarea
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    placeholder="Add notes about this proof..."
                    rows={4}
                  />
                  <div className="notes-actions">
                    <button className="btn btn-primary" onClick={handleSaveNotes}>
                      Save
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setEditingNotes(false);
                        setNotesInput(selectedEntry.notes || '');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="notes-display" onClick={() => setEditingNotes(true)}>
                  {selectedEntry.notes || (
                    <span className="notes-placeholder">Click to add notes...</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
