import { useEffect, useState } from 'react';
import { usePortfolio } from '../../hooks/usePortfolio';
import { formulaToString, justificationToString } from '../../types';
import type { PortfolioEntry } from '../../types';

export const Portfolio: React.FC = () => {
  const {
    entries,
    isLoading,
    error,
    selectedEntry,
    loadPortfolio,
    deleteEntry,
    updateNotes,
    selectEntry,
    clearError,
  } = usePortfolio();

  const [notesInput, setNotesInput] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);

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

  const handleDelete = async (entry: PortfolioEntry) => {
    if (confirm('Are you sure you want to delete this proof from your portfolio?')) {
      await deleteEntry(entry.id);
    }
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
                          {formulaToString(p)}
                          {i < entry.proof.theorem.premises.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                      {' ∴ '}
                    </>
                  )}
                  {formulaToString(entry.proof.theorem.conclusion)}
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
              <h3>{selectedEntry.proof.theorem.name || 'Custom Proof'}</h3>
              <button
                className="btn btn-secondary"
                onClick={() => handleDelete(selectedEntry)}
              >
                Delete
              </button>
            </div>

            <div className="detail-theorem">
              <div className="label">Theorem</div>
              <div className="formula">
                {selectedEntry.proof.theorem.premises.length > 0 && (
                  <>
                    {selectedEntry.proof.theorem.premises.map((p, i) => (
                      <span key={i}>
                        {formulaToString(p)}
                        {i < selectedEntry.proof.theorem.premises.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                    {' ∴ '}
                  </>
                )}
                {formulaToString(selectedEntry.proof.theorem.conclusion)}
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
              <div className="proof-lines">
                {selectedEntry.proof.lines.map((line) => (
                  <div key={line.id} className="proof-line-display" data-depth={line.depth}>
                    <span className="line-number">{line.line_number}.</span>
                    <span className="formula">{formulaToString(line.formula)}</span>
                    <span className="justification">{justificationToString(line.justification)}</span>
                  </div>
                ))}
              </div>
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
