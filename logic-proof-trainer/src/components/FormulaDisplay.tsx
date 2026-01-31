import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Formula, formulaToString } from '../types';
import { useTheme } from '../hooks/useTheme';

interface FormulaDisplayProps {
  formula: Formula | string;
  className?: string;
  style?: React.CSSProperties;
}

interface BracketPair {
  openIndex: number;
  closeIndex: number;
  depth: number;       // Line depth (only counts {})
  visualDepth: number; // Visual depth for coloring (counts all brackets)
}

export const FormulaDisplay: React.FC<FormulaDisplayProps> = ({ formula, className, style }) => {
  const { coloredBrackets, showBracketLines } = useTheme();
  const text = typeof formula === 'string' ? formula : formulaToString(formula);
  const containerRef = useRef<HTMLSpanElement>(null);
  const bracketRefs = useRef<Map<number, HTMLSpanElement>>(new Map());
  const [bracketPositions, setBracketPositions] = useState<{ pairs: BracketPair[], positions: Map<number, DOMRect> } | null>(null);

  // Parse bracket pairs using stack algorithm
  // Only track { } for line rendering - skip ( ) and [ ] entirely
  const parseBracketPairs = useCallback((): BracketPair[] => {
    const pairs: BracketPair[] = [];
    const lineStack: { index: number; lineDepth: number; visualDepth: number }[] = [];
    let lineDepth = 0;   // Depth counter for line-eligible brackets only ({})
    let visualDepth = 0; // Depth counter for ALL brackets (for color matching)

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '{') {
        // Track curly brackets for lines
        lineStack.push({ index: i, lineDepth, visualDepth });
        lineDepth++;
        visualDepth++;
      } else if (char === '}') {
        lineDepth--;
        visualDepth--;
        const opening = lineStack.pop();
        if (opening !== undefined) {
          pairs.push({
            openIndex: opening.index,
            closeIndex: i,
            depth: opening.lineDepth,
            visualDepth: opening.visualDepth,
          });
        }
      } else if (char === '(' || char === '[') {
        // Track visual depth for parentheses and square brackets (for color matching) but don't create lines
        visualDepth++;
      } else if (char === ')' || char === ']') {
        visualDepth--;
      }
    }
    return pairs;
  }, [text]);

  // Measure bracket positions
  const measurePositions = useCallback(() => {
    if (!containerRef.current || !showBracketLines || !coloredBrackets) {
      setBracketPositions(null);
      return;
    }

    const pairs = parseBracketPairs();
    const positions = new Map<number, DOMRect>();
    const containerRect = containerRef.current.getBoundingClientRect();

    bracketRefs.current.forEach((span, index) => {
      if (span) {
        const char = text[index];
        // Validate that the index points to an actual curly bracket in the current text
        // This guards against stale refs from previous formula renders
        // Only {} get lines, so only validate those
        if (char === '{' || char === '}') {
          const rect = span.getBoundingClientRect();
          // Store position relative to container
          positions.set(index, new DOMRect(
            rect.left - containerRect.left,
            rect.top - containerRect.top,
            rect.width,
            rect.height
          ));
        }
      }
    });

    setBracketPositions({ pairs, positions });
  }, [parseBracketPairs, showBracketLines, coloredBrackets, text]);

  // Set up ResizeObserver and measure on mount/changes
  useEffect(() => {
    if (!showBracketLines || !coloredBrackets) {
      setBracketPositions(null);
      return;
    }

    // Initial measurement after a small delay to ensure DOM is ready
    const timeoutId = setTimeout(measurePositions, 0);

    // Set up ResizeObserver
    const observer = new ResizeObserver(measurePositions);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    // Also observe window resize
    window.addEventListener('resize', measurePositions);

    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
      window.removeEventListener('resize', measurePositions);
    };
  }, [measurePositions, showBracketLines, coloredBrackets, text]);


  // Coloring scheme:
  // () = NEVER colored
  // [] = ALWAYS color 1 (blue in light mode, cyan in high contrast)
  // {} = depth-based (depth 0 = color 2, depth 1 = color 3, etc.)
  const getColorForCurly = (depth: number): string => {
    // Start at color 2 (color 1 is reserved for [])
    // Cycle through colors 2-5 (4 colors)
    return `var(--bracket-${(depth % 4) + 2})`;
  };

  // Clear refs at start of render to ensure no stale entries from previous formulas
  bracketRefs.current.clear();

  // Build elements with refs for brackets
  const elements: JSX.Element[] = [];
  // Track depth for ONLY {} brackets
  let curlyDepth = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '(' || char === ')') {
      // Parentheses are NEVER colored
      elements.push(<span key={i}>{char}</span>);
    } else if (char === '[' || char === ']') {
      // Square brackets are ALWAYS color 1 (no ref needed - no lines for [])
      const colorVar = coloredBrackets ? 'var(--bracket-1)' : undefined;
      elements.push(
        <span key={i} style={{ color: colorVar }}>
          {char}
        </span>
      );
    } else if (char === '{') {
      // Opening curly: color based on current depth, then increment
      const colorVar = coloredBrackets ? getColorForCurly(curlyDepth) : undefined;
      elements.push(
        <span
          key={i}
          ref={(el) => {
            if (el) bracketRefs.current.set(i, el);
            else bracketRefs.current.delete(i);
          }}
          style={{ color: colorVar }}
        >
          {char}
        </span>
      );
      curlyDepth++;
    } else if (char === '}') {
      // Closing curly: decrement first, then color with that depth
      curlyDepth--;
      const colorVar = coloredBrackets ? getColorForCurly(curlyDepth) : undefined;
      elements.push(
        <span
          key={i}
          ref={(el) => {
            if (el) bracketRefs.current.set(i, el);
            else bracketRefs.current.delete(i);
          }}
          style={{ color: colorVar }}
        >
          {char}
        </span>
      );
    } else {
      elements.push(<span key={i}>{char}</span>);
    }
  }

  // Separate pairs by placement: alternate top/bottom based on depth
  // depth 0 (outermost line-eligible bracket) -> below
  // depth 1 -> above
  // depth 2 -> below, etc.
  const abovePairs = bracketPositions?.pairs.filter(p => p.depth % 2 === 1) ?? [];
  const belowPairs = bracketPositions?.pairs.filter(p => p.depth % 2 === 0) ?? [];

  // Calculate max depth overall for visual styling
  const maxDepth = bracketPositions?.pairs.reduce((max, p) => Math.max(max, p.depth), 0) ?? 0;

  // Helper to get color index for SVG lines (matches inline coloring)
  // {} = depth-based using colors 2-5
  const getColorIndexForPair = (pair: BracketPair) => {
    // For {}, use colors 2-5 based on depth
    return (pair.depth % 4) + 2;
  };

  // Calculate heights for each SVG layer
  // For above: depths 1, 3, 5... -> map to levels 0, 1, 2...
  // For below: depths 0, 2, 4... -> map to levels 0, 1, 2...
  const lineSpacing = 8; // pixels between each depth level
  const maxAboveLevel = abovePairs.length > 0 ? Math.max(...abovePairs.map(p => Math.floor(p.depth / 2))) : -1;
  const maxBelowLevel = belowPairs.length > 0 ? Math.max(...belowPairs.map(p => Math.floor(p.depth / 2))) : -1;
  const aboveSvgHeight = (maxAboveLevel + 1) * lineSpacing + 2;
  const belowSvgHeight = (maxBelowLevel + 1) * lineSpacing + 2;

  // Calculate stroke width and opacity based on depth (outer = thicker, more visible)
  const getStrokeWidth = (depth: number) => 1 + (maxDepth - depth) * 0.3;
  const getOpacity = (depth: number) => 0.5 + (maxDepth - depth) * 0.1;

  // Render SVG paths for bracket lines above the formula
  const renderAboveLines = () => {
    if (!bracketPositions || !showBracketLines || !coloredBrackets || abovePairs.length === 0) return null;

    const { positions } = bracketPositions;

    return (
      <svg
        className="bracket-lines-svg bracket-lines-above"
        style={{
          position: 'absolute',
          left: 0,
          bottom: '100%',
          width: '100%',
          height: aboveSvgHeight,
          pointerEvents: 'none',
          overflow: 'visible',
        }}
      >
        {abovePairs.map((pair, idx) => {
          const openRect = positions.get(pair.openIndex);
          const closeRect = positions.get(pair.closeIndex);
          if (!openRect || !closeRect) return null;

          // Calculate x positions (center of each bracket)
          const x1 = openRect.left + openRect.width / 2;
          const x2 = closeRect.left + closeRect.width / 2;

          // Map depth to level: 1->0, 3->1, 5->2, etc.
          const level = Math.floor(pair.depth / 2);
          // Y position from bottom of SVG (closer levels are closer to text)
          const y = aboveSvgHeight - (level + 1) * lineSpacing;

          // Inverted U-shape: start at bottom, go up, across, down
          const path = `M ${x1} ${aboveSvgHeight} L ${x1} ${y} L ${x2} ${y} L ${x2} ${aboveSvgHeight}`;

          const colorIndex = getColorIndexForPair(pair);
          if (colorIndex === 0) return null; // Skip if no color

          return (
            <path
              key={idx}
              d={path}
              fill="none"
              stroke={`var(--bracket-${colorIndex})`}
              strokeWidth={getStrokeWidth(pair.depth)}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={getOpacity(pair.depth)}
            />
          );
        })}
      </svg>
    );
  };

  // Render SVG paths for bracket lines below the formula
  const renderBelowLines = () => {
    if (!bracketPositions || !showBracketLines || !coloredBrackets || belowPairs.length === 0) return null;

    const { positions } = bracketPositions;

    return (
      <svg
        className="bracket-lines-svg bracket-lines-below"
        style={{
          position: 'absolute',
          left: 0,
          top: '100%',
          width: '100%',
          height: belowSvgHeight,
          pointerEvents: 'none',
          overflow: 'visible',
        }}
      >
        {belowPairs.map((pair, idx) => {
          const openRect = positions.get(pair.openIndex);
          const closeRect = positions.get(pair.closeIndex);
          if (!openRect || !closeRect) return null;

          // Calculate x positions (center of each bracket)
          const x1 = openRect.left + openRect.width / 2;
          const x2 = closeRect.left + closeRect.width / 2;

          // Map depth to level: 0->0, 2->1, 4->2, etc.
          const level = Math.floor(pair.depth / 2);
          // Y position from top (closer levels are closer to text)
          const y = (level + 1) * lineSpacing;

          // U-shaped path: down from left, across, up to right
          const path = `M ${x1} 0 L ${x1} ${y} L ${x2} ${y} L ${x2} 0`;

          const colorIndex = getColorIndexForPair(pair);
          if (colorIndex === 0) return null; // Skip if no color

          return (
            <path
              key={idx}
              d={path}
              fill="none"
              stroke={`var(--bracket-${colorIndex})`}
              strokeWidth={getStrokeWidth(pair.depth)}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={getOpacity(pair.depth)}
            />
          );
        })}
      </svg>
    );
  };

  const showLines = showBracketLines && coloredBrackets && bracketPositions;
  const hasAboveLines = showLines && abovePairs.length > 0;
  const hasBelowLines = showLines && belowPairs.length > 0;

  return (
    <span
      ref={containerRef}
      className={className}
      style={{
        ...style,
        position: 'relative',
        display: 'inline-block',
        paddingTop: hasAboveLines ? aboveSvgHeight : undefined,
        paddingBottom: hasBelowLines ? belowSvgHeight : undefined,
      }}
    >
      {elements}
      {renderAboveLines()}
      {renderBelowLines()}
    </span>
  );
};
