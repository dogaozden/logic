import React, { useEffect, useState } from 'react';
import { useTheorems } from '../../hooks/useTheorems';
import { useProof } from '../../hooks/useProof';
import type { Theorem, Difficulty } from '../../types';
import { difficultyColor } from '../../types';
import { FormulaDisplay } from '../FormulaDisplay';
import { CustomTheoremModal } from './CustomTheoremModal';

type FilterType = 'all' | 'classic' | 'custom' | Difficulty;

// Unified difficulty mode - either preset or custom value
type DifficultyMode =
  | { type: 'preset'; value: Difficulty }
  | { type: 'custom'; value: number };

export const TheoremList: React.FC = () => {
  const {
    classicTheorems,
    customTheorems,
    selectedTheorem,
    loadClassicTheorems,
    loadCustomTheorems,
    generateTheorem,
    generateTheoremWithValue,
    selectTheorem,
  } = useTheorems();

  const { createProof } = useProof();
  const [filter, setFilter] = useState<FilterType>('all');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);

  // Unified state: either preset difficulty or custom value (mutually exclusive)
  const [difficultyMode, setDifficultyMode] = useState<DifficultyMode | null>(null);
  // Separate input value for the custom field (allows typing without immediate mode switch)
  const [customInputValue, setCustomInputValue] = useState<string>('50');

  useEffect(() => {
    loadClassicTheorems();
    loadCustomTheorems();
  }, []);

  const allTheorems = [...classicTheorems, ...customTheorems];

  const filteredTheorems = allTheorems.filter((t) => {
    if (filter === 'all') return true;
    if (filter === 'classic') return t.is_classic;
    if (filter === 'custom') return !t.is_classic;
    return t.difficulty === filter;
  });

  const handleSelectTheorem = (theorem: Theorem) => {
    selectTheorem(theorem);
  };

  const handleStartProof = async () => {
    if (selectedTheorem) {
      await createProof(selectedTheorem);
    }
  };

  // Selecting a preset difficulty (clears custom)
  const handlePresetClick = (difficulty: Difficulty) => {
    setDifficultyMode({ type: 'preset', value: difficulty });
  };

  // Entering custom value switches to custom mode
  const handleCustomInputChange = (value: string) => {
    setCustomInputValue(value);
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 1 && numValue <= 100) {
      setDifficultyMode({ type: 'custom', value: numValue });
    }
  };

  // Focus on custom input switches to custom mode
  const handleCustomInputFocus = () => {
    const numValue = parseInt(customInputValue, 10);
    if (!isNaN(numValue) && numValue >= 1 && numValue <= 100) {
      setDifficultyMode({ type: 'custom', value: numValue });
    }
  };

  // Single Generate New handler - uses current difficultyMode
  const handleGenerateNew = async () => {
    if (!difficultyMode) return;

    setIsGenerating(true);
    try {
      let theorem: Theorem;
      if (difficultyMode.type === 'preset') {
        theorem = await generateTheorem(difficultyMode.value);
      } else {
        theorem = await generateTheoremWithValue(difficultyMode.value);
      }
      selectTheorem(theorem);
    } finally {
      setIsGenerating(false);
    }
  };

  const theoremDisplayElement = (theorem: Theorem): JSX.Element => {
    const premises = theorem.premises.map((p, i) => (
      <React.Fragment key={i}>
        <FormulaDisplay formula={p} />
        {i < theorem.premises.length - 1 ? ', ' : ''}
      </React.Fragment>
    ));
    return (
      <>
        {premises.length > 0 && <>{premises} ∴ </>}
        <FormulaDisplay formula={theorem.conclusion} />
      </>
    );
  };

  // Helper to check if a preset is selected
  const isPresetSelected = (difficulty: Difficulty) =>
    difficultyMode?.type === 'preset' && difficultyMode.value === difficulty;

  // Helper to check if custom mode is active
  const isCustomSelected = difficultyMode?.type === 'custom';

  return (
    <>
      <div className="theorem-list-header">
        <h2>Theorems</h2>
      </div>

      <div className="filter-tabs">
        <button
          className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <button
          className={`filter-tab ${filter === 'classic' ? 'active' : ''}`}
          onClick={() => setFilter('classic')}
        >
          Classic
        </button>
        <button
          className={`filter-tab ${filter === 'easy' ? 'active' : ''}`}
          onClick={() => setFilter('easy')}
        >
          Easy
        </button>
        <button
          className={`filter-tab ${filter === 'medium' ? 'active' : ''}`}
          onClick={() => setFilter('medium')}
        >
          Medium
        </button>
        <button
          className={`filter-tab ${filter === 'hard' ? 'active' : ''}`}
          onClick={() => setFilter('hard')}
        >
          Hard
        </button>
      </div>

      <div className="theorem-list">
        {filteredTheorems.map((theorem) => (
          <div
            key={theorem.id}
            className={`theorem-row ${selectedTheorem?.id === theorem.id ? 'selected' : ''}`}
            onClick={() => handleSelectTheorem(theorem)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="name">{theorem.name || 'Unnamed Theorem'}</span>
              <span
                className="difficulty-badge"
                style={{ backgroundColor: difficultyColor(theorem.difficulty) }}
              >
                {theorem.difficulty}
              </span>
            </div>
            <span className="formula-preview">{theoremDisplayElement(theorem)}</span>
          </div>
        ))}
      </div>

      {/* Difficulty Selection Section */}
      <div style={{ padding: '12px', borderTop: '1px solid var(--border)' }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
          Select Difficulty:
        </p>

        {/* Preset difficulty buttons + Custom input - all in one row */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' }}>
          {(['easy', 'medium', 'hard', 'expert'] as Difficulty[]).map((d) => (
            <button
              key={d}
              className={`btn ${isPresetSelected(d) ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handlePresetClick(d)}
              style={{ fontSize: '0.75rem', padding: '4px 8px' }}
            >
              {d}
            </button>
          ))}

          {/* Custom input inline */}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginLeft: '4px' }}>
            <input
              type="number"
              min="1"
              max="100"
              value={customInputValue}
              onChange={(e) => handleCustomInputChange(e.target.value)}
              onFocus={handleCustomInputFocus}
              style={{
                width: '50px',
                padding: '4px 6px',
                fontSize: '0.75rem',
                border: `2px solid ${isCustomSelected ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: '4px',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
              }}
              placeholder="1-100"
              title="Custom difficulty (1-100)"
            />
          </div>
        </div>

        {/* Difficulty scale hint */}
        <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
          1-25 easy · 26-45 medium · 46-70 hard · 71-100 expert
        </p>

        {/* Generate New and Custom buttons */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <button
            className="btn btn-primary"
            onClick={handleGenerateNew}
            disabled={!difficultyMode || isGenerating}
            style={{ flex: 1 }}
          >
            {isGenerating ? 'Generating...' : 'Generate New'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowCustomModal(true)}
            style={{ flexShrink: 0 }}
          >
            Custom
          </button>
        </div>
      </div>

      {/* Start Proof button - visible whenever a theorem is selected */}
      {selectedTheorem && (
        <div className="action-bar">
          <button className="btn btn-primary" onClick={handleStartProof} style={{ flex: 1 }}>
            Start Proof
          </button>
        </div>
      )}

      {/* Custom Theorem Modal */}
      <CustomTheoremModal
        isOpen={showCustomModal}
        onClose={() => setShowCustomModal(false)}
        onCreated={() => {
          // Theorem is already selected and saved by the modal
          // Just close the modal
          setShowCustomModal(false);
        }}
      />
    </>
  );
};
