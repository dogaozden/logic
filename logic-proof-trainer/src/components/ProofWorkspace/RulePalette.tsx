import React, { useState } from 'react';
import type { InferenceRule, EquivalenceRule, ProofTechnique } from '../../types';
import { inferenceRuleInfo, equivalenceRuleInfo, proofTechniqueInfo } from '../../types';

interface RulePaletteProps {
  selectedInferenceRule: InferenceRule | null;
  selectedEquivalenceRule: EquivalenceRule | null;
  selectedTechnique: ProofTechnique | null;
  onSelectInferenceRule: (rule: InferenceRule | null) => void;
  onSelectEquivalenceRule: (rule: EquivalenceRule | null) => void;
  onSelectTechnique: (technique: ProofTechnique | null) => void;
}

// Consolidated inference rules - no more left/right variants
const INFERENCE_CATEGORIES = {
  'Basic': ['modusPonens', 'modusTollens', 'hypotheticalSyllogism', 'disjunctiveSyllogism', 'constructiveDilemma'] as InferenceRule[],
  'Conjunction': ['conjunctionIntro', 'conjunctionElim'] as InferenceRule[],
  'Disjunction': ['disjunctionIntro', 'disjunctionElim'] as InferenceRule[],
  'Biconditional': ['biconditionalIntro', 'biconditionalElim'] as InferenceRule[],
  'Other': ['doubleNegation', 'reiteration'] as InferenceRule[],
};

// Consolidated equivalence rules - no more And/Or variants
const EQUIVALENCE_CATEGORIES = {
  'Structural': ['deMorgan', 'commutation', 'association', 'distribution'] as EquivalenceRule[],
  'Implication': ['contraposition', 'materialImplication', 'materialEquivalence', 'exportation'] as EquivalenceRule[],
  'Simplification': ['tautology', 'absorption', 'doubleNegation'] as EquivalenceRule[],
};

const TECHNIQUES: ProofTechnique[] = ['conditionalProof', 'indirectProof', 'negationIntroduction'];

export const RulePalette: React.FC<RulePaletteProps> = ({
  selectedInferenceRule,
  selectedEquivalenceRule,
  selectedTechnique,
  onSelectInferenceRule,
  onSelectEquivalenceRule,
  onSelectTechnique,
}) => {
  const [expandedInference, setExpandedInference] = useState<string | null>('Basic');
  const [expandedEquivalence, setExpandedEquivalence] = useState<string | null>(null);

  const handleInferenceClick = (rule: InferenceRule) => {
    if (selectedInferenceRule === rule) {
      onSelectInferenceRule(null);
    } else {
      onSelectInferenceRule(rule);
      onSelectEquivalenceRule(null);
      onSelectTechnique(null);
    }
  };

  const handleEquivalenceClick = (rule: EquivalenceRule) => {
    if (selectedEquivalenceRule === rule) {
      onSelectEquivalenceRule(null);
    } else {
      onSelectEquivalenceRule(rule);
      onSelectInferenceRule(null);
      onSelectTechnique(null);
    }
  };

  const handleTechniqueClick = (technique: ProofTechnique) => {
    if (selectedTechnique === technique) {
      onSelectTechnique(null);
    } else {
      onSelectTechnique(technique);
      onSelectInferenceRule(null);
      onSelectEquivalenceRule(null);
    }
  };

  return (
    <div className="rule-palette">
      <h3>Rules</h3>

      {/* Inference Rules */}
      <div className="rule-category">
        <div style={{ marginBottom: '8px', fontWeight: 500, fontSize: '0.875rem' }}>
          Inference Rules
        </div>
        {Object.entries(INFERENCE_CATEGORIES).map(([category, rules]) => (
          <div key={category} style={{ marginBottom: '8px' }}>
            <div
              className="rule-category-header"
              onClick={() => setExpandedInference(expandedInference === category ? null : category)}
            >
              <span>{category}</span>
              <span>{expandedInference === category ? '−' : '+'}</span>
            </div>
            {expandedInference === category && (
              <div className="rule-list">
                {rules.map((rule) => {
                  const info = inferenceRuleInfo[rule];
                  return (
                    <button
                      key={rule}
                      className={`rule-button ${selectedInferenceRule === rule ? 'selected' : ''}`}
                      onClick={() => handleInferenceClick(rule)}
                      title={info.symbol}
                    >
                      <div className="rule-button-content">
                        <div className="rule-header">
                          <span className="rule-abbreviation">{info.abbrev}</span>
                          <span className="rule-name">{info.name}</span>
                        </div>
                        <div className="rule-symbol">{info.symbol}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Equivalence Rules */}
      <div className="rule-category">
        <div style={{ marginBottom: '8px', fontWeight: 500, fontSize: '0.875rem' }}>
          Equivalence Rules
        </div>
        {Object.entries(EQUIVALENCE_CATEGORIES).map(([category, rules]) => (
          <div key={category} style={{ marginBottom: '8px' }}>
            <div
              className="rule-category-header"
              onClick={() => setExpandedEquivalence(expandedEquivalence === category ? null : category)}
            >
              <span>{category}</span>
              <span>{expandedEquivalence === category ? '−' : '+'}</span>
            </div>
            {expandedEquivalence === category && (
              <div className="rule-list">
                {rules.map((rule) => {
                  const info = equivalenceRuleInfo[rule];
                  return (
                    <button
                      key={rule}
                      className={`rule-button ${selectedEquivalenceRule === rule ? 'selected' : ''}`}
                      onClick={() => handleEquivalenceClick(rule)}
                      title={info.symbol}
                    >
                      <div className="rule-button-content">
                        <div className="rule-header">
                          <span className="rule-abbreviation">{info.abbrev}</span>
                          <span className="rule-name">{info.name}</span>
                        </div>
                        <div className="rule-symbol">{info.symbol}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Proof Techniques */}
      <div className="rule-category">
        <div style={{ marginBottom: '8px', fontWeight: 500, fontSize: '0.875rem' }}>
          Proof Techniques
        </div>
        <div className="rule-list">
          {TECHNIQUES.map((technique) => {
            const info = proofTechniqueInfo[technique];
            const symbolMap: Record<ProofTechnique, string> = {
              conditionalProof: 'Assume P... derive Q ∴ P ⊃ Q',
              indirectProof: 'Assume ~P... derive ⊥ ∴ P',
              negationIntroduction: 'Assume P... derive ⊥ ∴ ~P',
            };
            return (
              <button
                key={technique}
                className={`rule-button ${selectedTechnique === technique ? 'selected' : ''}`}
                onClick={() => handleTechniqueClick(technique)}
                title={symbolMap[technique]}
              >
                <div className="rule-button-content">
                  <div className="rule-header">
                    <span className="rule-abbreviation">{info.abbrev}</span>
                    <span className="rule-name">{info.name}</span>
                  </div>
                  <div className="rule-symbol">{symbolMap[technique]}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
