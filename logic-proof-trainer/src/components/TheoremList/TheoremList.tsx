import React, { useEffect, useState } from 'react';
import { useTheorems } from '../../hooks/useTheorems';
import { useProof } from '../../hooks/useProof';
import type { Theorem, Difficulty } from '../../types';
import { difficultyColor } from '../../types';
import { FormulaDisplay } from '../FormulaDisplay';

type FilterType = 'all' | 'classic' | 'custom' | Difficulty;

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

  const { createProof, proof } = useProof();
  const [filter, setFilter] = useState<FilterType>('all');
  const [isGenerating, setIsGenerating] = useState(false);
  const [customDifficulty, setCustomDifficulty] = useState<string>('50');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty | null>(null);

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

  const handleGenerate = async (difficulty: Difficulty) => {
    setSelectedDifficulty(difficulty);
    setIsGenerating(true);
    try {
      const theorem = await generateTheorem(difficulty);
      selectTheorem(theorem);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateCustom = async () => {
    const value = parseInt(customDifficulty, 10);
    if (isNaN(value) || value < 1 || value > 100) {
      return;
    }
    setIsGenerating(true);
    try {
      const theorem = await generateTheoremWithValue(value);
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

      <div style={{ padding: '12px', borderTop: '1px solid var(--border)' }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
          Generate Random:
        </p>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
          {(['easy', 'medium', 'hard', 'expert'] as Difficulty[]).map((d) => (
            <button
              key={d}
              className={`btn ${selectedDifficulty === d ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleGenerate(d)}
              disabled={isGenerating}
              style={{ fontSize: '0.75rem', padding: '4px 8px' }}
            >
              {d}
            </button>
          ))}
          <button
            className={`btn ${showCustomInput ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowCustomInput(!showCustomInput)}
            style={{ fontSize: '0.75rem', padding: '4px 8px' }}
            title="Enter custom difficulty (1-100)"
          >
            #
          </button>
        </div>
        {showCustomInput && (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <input
              type="number"
              min="1"
              max="100"
              value={customDifficulty}
              onChange={(e) => setCustomDifficulty(e.target.value)}
              style={{
                width: '60px',
                padding: '4px 8px',
                fontSize: '0.75rem',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
              }}
              placeholder="1-100"
            />
            <button
              className="btn btn-primary"
              onClick={handleGenerateCustom}
              disabled={isGenerating}
              style={{ fontSize: '0.75rem', padding: '4px 8px' }}
            >
              Go
            </button>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
              (1-25 easy, 26-45 med, 46-70 hard, 71-100 expert)
            </span>
          </div>
        )}
      </div>

      {selectedTheorem && !proof && (
        <div className="action-bar">
          <button className="btn btn-primary" onClick={handleStartProof} style={{ flex: 1 }}>
            Start Proof
          </button>
        </div>
      )}
    </>
  );
};
