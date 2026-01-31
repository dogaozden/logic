import React from 'react';
import { Formula, formulaToString } from '../types';

interface FormulaDisplayProps {
  formula: Formula | string;
  className?: string;
  style?: React.CSSProperties;
}

export const FormulaDisplay: React.FC<FormulaDisplayProps> = ({ formula, className, style }) => {
  const text = typeof formula === 'string' ? formula : formulaToString(formula);

  const elements: JSX.Element[] = [];
  let depth = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '(' || char === '[' || char === '{') {
      const colorVar = `var(--bracket-${(depth % 5) + 1})`;
      elements.push(<span key={i} style={{ color: colorVar }}>{char}</span>);
      depth++;
    } else if (char === ')' || char === ']' || char === '}') {
      depth--;
      const colorVar = `var(--bracket-${(depth % 5) + 1})`;
      elements.push(<span key={i} style={{ color: colorVar }}>{char}</span>);
    } else {
      elements.push(<span key={i}>{char}</span>);
    }
  }

  return <span className={className} style={style}>{elements}</span>;
};
