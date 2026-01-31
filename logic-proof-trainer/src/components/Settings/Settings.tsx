import React from 'react';
import { useTheme } from '../../hooks/useTheme';

export const Settings: React.FC = () => {
  const { theme, toggleHighContrast } = useTheme();

  // Bracket colors based on theme
  const bracketColors = theme === 'high-contrast'
    ? [
        { depth: 1, color: '#00ccff', name: 'Cyan' },
        { depth: 2, color: '#ffcc00', name: 'Yellow' },
        { depth: 3, color: '#00ff99', name: 'Bright Green' },
        { depth: 4, color: '#ff66ff', name: 'Magenta' },
        { depth: 5, color: '#ff6600', name: 'Orange' },
      ]
    : [
        { depth: 1, color: '#0066cc', name: 'Blue' },
        { depth: 2, color: '#cc6600', name: 'Orange' },
        { depth: 3, color: '#009966', name: 'Teal' },
        { depth: 4, color: '#9933cc', name: 'Purple' },
        { depth: 5, color: '#cc3366', name: 'Magenta' },
      ];

  const bracketPairs = ['( )', '[ ]', '{ }', '( )', '[ ]'];

  return (
    <div className="settings-panel">
      <div className="settings-section">
        <h3 className="settings-section-title">Theme</h3>
        <div className="theme-options">
          <button
            className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
            onClick={() => theme !== 'dark' && toggleHighContrast()}
          >
            <span className="theme-icon">&#9680;</span>
            <span>Light Mode</span>
          </button>
          <button
            className={`theme-option ${theme === 'high-contrast' ? 'active' : ''}`}
            onClick={() => theme !== 'high-contrast' && toggleHighContrast()}
          >
            <span className="theme-icon">&#9681;</span>
            <span>High Contrast</span>
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Bracket Colors</h3>
        <p className="settings-description">
          Brackets are color-coded by nesting depth to help you read complex formulas.
        </p>
        <div className="bracket-legend">
          {bracketColors.map((item, index) => (
            <div key={item.depth} className="bracket-legend-item">
              <span className="bracket-depth">Depth {item.depth}:</span>
              <span
                className="bracket-sample"
                style={{ color: item.color, fontFamily: 'var(--font-mono)' }}
              >
                {bracketPairs[index]}
              </span>
              <span className="bracket-color-name">{item.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Example</h3>
        <div className="bracket-example">
          <span style={{ color: bracketColors[0].color }}>(</span>
          <span style={{ color: bracketColors[1].color }}>(</span>
          P <span style={{ fontFamily: 'var(--font-mono)' }}>&#8594;</span> Q
          <span style={{ color: bracketColors[1].color }}>)</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}> &#8743; </span>
          <span style={{ color: bracketColors[1].color }}>[</span>
          R <span style={{ fontFamily: 'var(--font-mono)' }}>&#8744;</span>
          <span style={{ color: bracketColors[2].color }}>(</span>
          S <span style={{ fontFamily: 'var(--font-mono)' }}>&#8594;</span> T
          <span style={{ color: bracketColors[2].color }}>)</span>
          <span style={{ color: bracketColors[1].color }}>]</span>
          <span style={{ color: bracketColors[0].color }}>)</span>
        </div>
      </div>
    </div>
  );
};
