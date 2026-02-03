import React, { useState } from 'react';
import { useTheorems, CURATED_EXAMPLES } from '../../hooks/useTheorems';
import { useProof } from '../../hooks/useProof';
import type { Difficulty } from '../../types';
import { difficultyColor } from '../../types';
import { FormulaDisplay } from '../FormulaDisplay';
import { CustomTheoremModal } from './CustomTheoremModal';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

// Unified difficulty mode - either preset or custom value
type DifficultyMode =
  | { type: 'preset'; value: Difficulty }
  | { type: 'custom'; value: number };

export const TheoremList: React.FC = () => {
  const { generateTheorem, generateTheoremWithValue, selectTheorem } = useTheorems();
  const { createProof } = useProof();

  const [difficultyMode, setDifficultyMode] = useState<DifficultyMode | null>(null);
  const [customInputValue, setCustomInputValue] = useState<string>('50');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);

  const handleCardClick = (difficulty: Difficulty) => {
    setDifficultyMode({ type: 'preset', value: difficulty });
  };

  const handleCustomInputChange = (value: string) => {
    setCustomInputValue(value);
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 1 && numValue <= 100) {
      setDifficultyMode({ type: 'custom', value: numValue });
    }
  };

  const handleCustomInputFocus = () => {
    const numValue = parseInt(customInputValue, 10);
    if (!isNaN(numValue) && numValue >= 1 && numValue <= 100) {
      setDifficultyMode({ type: 'custom', value: numValue });
    }
  };

  const handleGenerateNew = async () => {
    if (!difficultyMode) return;

    setIsGenerating(true);
    try {
      let theorem;
      if (difficultyMode.type === 'preset') {
        theorem = await generateTheorem(difficultyMode.value);
      } else {
        theorem = await generateTheoremWithValue(difficultyMode.value);
      }
      selectTheorem(theorem);
      await createProof(theorem);
    } finally {
      setIsGenerating(false);
    }
  };

  const isPresetSelected = (difficulty: Difficulty) =>
    difficultyMode?.type === 'preset' && difficultyMode.value === difficulty;

  const isCustomSelected = difficultyMode?.type === 'custom';

  return (
    <>
      <div className="theorem-list-header">
        <h2>Theorems</h2>
      </div>

      {/* Stacked Difficulty Cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {DIFFICULTIES.map((difficulty) => {
          const example = CURATED_EXAMPLES[difficulty];
          const isSelected = isPresetSelected(difficulty);
          const color = difficultyColor(difficulty);

          return (
            <div
              key={difficulty}
              onClick={() => handleCardClick(difficulty)}
              style={{
                padding: '12px',
                background: isSelected ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                borderRadius: '8px',
                border: `2px solid ${isSelected ? color : 'var(--border)'}`,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {/* Card Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: isSelected ? color : 'var(--text-primary)',
                  textTransform: 'capitalize',
                }}>
                  {difficulty}
                </span>
                <span
                  style={{
                    fontSize: '0.65rem',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: color,
                    color: 'white',
                  }}
                >
                  {example.theorem.name}
                </span>
              </div>

              {/* Formula */}
              <div style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
                {example.theorem.premises.length > 0 && (
                  <>
                    {example.theorem.premises.map((p, i) => (
                      <React.Fragment key={i}>
                        <FormulaDisplay formula={p} />
                        {i < example.theorem.premises.length - 1 ? ', ' : ''}
                      </React.Fragment>
                    ))}
                    {' ∴ '}
                  </>
                )}
                {example.theorem.premises.length === 0 && '∴ '}
                <FormulaDisplay formula={example.theorem.conclusion} />
              </div>

              {/* Description */}
              <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: 0 }}>
                {example.description}
              </p>
            </div>
          );
        })}
      </div>

      {/* Custom Difficulty Input + Action Buttons at Bottom */}
      <div style={{ padding: '12px', borderTop: '1px solid var(--border)' }}>
        {/* Custom difficulty input */}
        <div style={{ marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Custom difficulty:
            </span>
            <input
              type="number"
              min="1"
              max="100"
              value={customInputValue}
              onChange={(e) => handleCustomInputChange(e.target.value)}
              onFocus={handleCustomInputFocus}
              style={{
                width: '60px',
                padding: '4px 8px',
                fontSize: '0.8rem',
                border: `2px solid ${isCustomSelected ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: '4px',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
              }}
              placeholder="1-100"
              title="Custom difficulty (1-100)"
            />
          </div>
          <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', margin: 0 }}>
            1-25 easy · 26-45 medium · 46-70 hard · 71-100 expert
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
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

      {/* Custom Theorem Modal */}
      <CustomTheoremModal
        isOpen={showCustomModal}
        onClose={() => setShowCustomModal(false)}
        onCreated={() => {
          setShowCustomModal(false);
        }}
      />
    </>
  );
};
