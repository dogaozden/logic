import React, { useEffect, useState } from 'react';
import { useTheorems } from '../../hooks/useTheorems';
import { useProof } from '../../hooks/useProof';
import type { Theorem, Difficulty } from '../../types';
import { formulaToString, difficultyColor } from '../../types';

type FilterType = 'all' | 'classic' | 'custom' | Difficulty;

export const TheoremList: React.FC = () => {
  const {
    classicTheorems,
    customTheorems,
    selectedTheorem,
    loadClassicTheorems,
    loadCustomTheorems,
    generateTheorem,
    selectTheorem,
  } = useTheorems();

  const { createProof, proof } = useProof();
  const [filter, setFilter] = useState<FilterType>('all');
  const [isGenerating, setIsGenerating] = useState(false);

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
    setIsGenerating(true);
    try {
      const theorem = await generateTheorem(difficulty);
      selectTheorem(theorem);
    } finally {
      setIsGenerating(false);
    }
  };

  const theoremDisplayString = (theorem: Theorem): string => {
    const premises = theorem.premises.map((p) => formulaToString(p)).join(', ');
    const conclusion = formulaToString(theorem.conclusion);
    if (premises) {
      return `${premises} ∴ ${conclusion}`;
    }
    return `∴ ${conclusion}`;
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
            <span className="formula-preview">{theoremDisplayString(theorem)}</span>
          </div>
        ))}
      </div>

      <div style={{ padding: '12px', borderTop: '1px solid var(--border)' }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
          Generate Random:
        </p>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {(['easy', 'medium', 'hard', 'expert'] as Difficulty[]).map((d) => (
            <button
              key={d}
              className="btn btn-secondary"
              onClick={() => handleGenerate(d)}
              disabled={isGenerating}
              style={{ fontSize: '0.75rem', padding: '4px 8px' }}
            >
              {d}
            </button>
          ))}
        </div>
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
