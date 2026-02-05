// PropBench — LLM output parser
//
// Parses a complete proof text block (as returned by an LLM) into
// structured ParsedLine[] that can be fed to the Rust CLI validator.
//
// Handles:
//   - Line number stripping (1., Step 1:, 1), (1), etc.)
//   - Subproof indentation detection (spaces, tabs, explicit markers)
//   - Rule name variation mapping (40+ aliases → canonical names)
//   - Symbol variation normalization
//   - Conversion to the JSON format expected by `propbench validate`

import {
  Theorem,
  ParsedLine,
  ParseResult,
  ParseError,
} from "./config";

// ─── Canonical rule names ───────────────────────────────────────────────────

// The canonical names must match what the Rust CLI validator expects.

const INFERENCE_ALIASES: Record<string, string> = {
  // Modus Ponens
  mp: "MP",
  "modus ponens": "MP",
  "modusponens": "MP",
  modus: "MP",
  ponens: "MP",
  // Modus Tollens
  mt: "MT",
  "modus tollens": "MT",
  "modustollens": "MT",
  tollens: "MT",
  // Disjunctive Syllogism
  ds: "DS",
  "disjunctive syllogism": "DS",
  "disjunctivesyllogism": "DS",
  disj: "DS",
  disjsyl: "DS",
  // Simplification
  simp: "Simp",
  simplification: "Simp",
  simple: "Simp",
  // Conjunction
  conj: "Conj",
  conjunction: "Conj",
  and: "Conj",
  // Hypothetical Syllogism
  hs: "HS",
  "hypothetical syllogism": "HS",
  "hypotheticalsyllogism": "HS",
  hyp: "HS",
  hypo: "HS",
  syl: "HS",
  // Addition
  add: "Add",
  addition: "Add",
  or: "Add",
  // Constructive Dilemma
  cd: "CD",
  "constructive dilemma": "CD",
  "constructivedilemma": "CD",
  dil: "CD",
  dilemma: "CD",
  // Negation Elimination
  nege: "NegE",
  "negation elimination": "NegE",
  "negationelimination": "NegE",
  "neg elim": "NegE",
  "⊥i": "NegE",
  "⊥-intro": "NegE",
  "bottom intro": "NegE",
  contradiction: "NegE",
};

const EQUIVALENCE_ALIASES: Record<string, string> = {
  // Double Negation
  dn: "DN",
  "double negation": "DN",
  "doublenegation": "DN",
  "double neg": "DN",
  // DeMorgan's
  dem: "DeM",
  demorgan: "DeM",
  "de morgan": "DeM",
  "demorgans": "DeM",
  "de morgan's": "DeM",
  morgan: "DeM",
  dm: "DeM",
  // Commutation
  comm: "Comm",
  commutation: "Comm",
  com: "Comm",
  commute: "Comm",
  // Association
  assoc: "Assoc",
  association: "Assoc",
  associate: "Assoc",
  // Distribution
  dist: "Dist",
  distribution: "Dist",
  distrib: "Dist",
  distribute: "Dist",
  // Contraposition
  contra: "Contra",
  contraposition: "Contra",
  contrap: "Contra",
  contrapositive: "Contra",
  trans: "Contra",
  transposition: "Contra",
  // Implication
  impl: "Impl",
  implication: "Impl",
  imp: "Impl",
  "material implication": "Impl",
  // Exportation
  exp: "Exp",
  exportation: "Exp",
  export: "Exp",
  // Tautology
  taut: "Taut",
  tautology: "Taut",
  // Equivalence
  equiv: "Equiv",
  equivalence: "Equiv",
  eq: "Equiv",
  bicon: "Equiv",
  biconditional: "Equiv",
  "material equivalence": "Equiv",
};

const TECHNIQUE_ALIASES: Record<string, string> = {
  cp: "CP",
  "conditional proof": "CP",
  "conditionalproof": "CP",
  conditional: "CP",
  cond: "CP",
  ip: "IP",
  "indirect proof": "IP",
  "indirectproof": "IP",
  indirect: "IP",
  raa: "IP",
  "reductio ad absurdum": "IP",
  "reductio": "IP",
  "~i": "IP",
  ni: "IP",
  negintro: "IP",
  "negation introduction": "IP",
};

/**
 * Look up a rule/technique name and return its canonical form,
 * or null if not recognized.
 */
function canonicalizeRule(
  name: string
): { canonical: string; kind: "inference" | "equivalence" | "technique" } | null {
  const lower = name.toLowerCase().trim();
  if (TECHNIQUE_ALIASES[lower]) {
    return { canonical: TECHNIQUE_ALIASES[lower], kind: "technique" };
  }
  if (INFERENCE_ALIASES[lower]) {
    return { canonical: INFERENCE_ALIASES[lower], kind: "inference" };
  }
  if (EQUIVALENCE_ALIASES[lower]) {
    return { canonical: EQUIVALENCE_ALIASES[lower], kind: "equivalence" };
  }
  return null;
}

// ─── Symbol normalization ───────────────────────────────────────────────────

/**
 * Normalize symbol variations in a formula string to the canonical forms
 * accepted by the Rust parser.
 *
 * The Rust parser accepts many aliases, so we only normalize truly
 * unusual variants that models might produce.
 */
function normalizeFormula(formula: string): string {
  return formula
    // Normalize arrow-style implications
    .replace(/→/g, ">")
    .replace(/⊃/g, ">")
    .replace(/=>/g, ">")
    .replace(/->/g, ">")
    // Normalize disjunction
    .replace(/∨/g, "v")
    .replace(/\|\|/g, "v")
    // Normalize conjunction
    .replace(/·/g, ".")
    .replace(/∧/g, ".")
    .replace(/&&/g, ".")
    .replace(/\u2227/g, ".") // ∧
    // Normalize negation
    .replace(/¬/g, "~")
    .replace(/−/g, "~") // em-dash used as negation
    // Normalize biconditional
    .replace(/≡/g, "<>")
    .replace(/↔/g, "<>")
    .replace(/<=>/g, "<>")
    .replace(/<->/g, "<>")
    // Normalize contradiction
    .replace(/⊥/g, "#")
    .replace(/_\|_/g, "#")
    // Normalize whitespace
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Line number stripping ─────────────────────────────────────────────────

// Patterns to match line numbers at the start of a line:
//   "1."  "1)"  "(1)"  "Step 1:"  "Step 1."  "Line 1:"  "#1."  "#1"
const LINE_NUMBER_PATTERNS = [
  /^\((\d+)\)\s*/,       // (1)
  /^#(\d+)[.):]\s*/,     // #1. or #1) or #1:
  /^Step\s+(\d+)[.:]\s*/i, // Step 1: or Step 1.
  /^Line\s+(\d+)[.:]\s*/i, // Line 1: or Line 1.
  /^(\d+)\)\s*/,         // 1)
  /^(\d+)\.\s*/,         // 1.
  /^(\d+):\s*/,          // 1:
];

/**
 * Strip a line number prefix from a proof line.
 * Returns the extracted line number and the remaining text.
 */
function stripLineNumber(
  line: string
): { lineNumber: number | null; rest: string } {
  for (const pattern of LINE_NUMBER_PATTERNS) {
    const match = line.match(pattern);
    if (match) {
      return {
        lineNumber: parseInt(match[1], 10),
        rest: line.slice(match[0].length),
      };
    }
  }
  return { lineNumber: null, rest: line };
}

// ─── Indentation / depth detection ──────────────────────────────────────────

/**
 * Measure the indentation of a line (number of leading spaces/tabs).
 * Each tab counts as 2 spaces.
 */
function measureIndent(line: string): number {
  let indent = 0;
  for (const ch of line) {
    if (ch === " ") indent += 1;
    else if (ch === "\t") indent += 2;
    else break;
  }
  return indent;
}

/**
 * Detect explicit subproof markers like "|" or "│" at the start of a line.
 * Returns the depth (number of markers) and the remaining text.
 */
function stripSubproofMarkers(
  line: string
): { depth: number; rest: string } {
  let depth = 0;
  let rest = line;
  // Strip leading vertical bar markers
  while (/^\s*[|│]\s*/.test(rest)) {
    rest = rest.replace(/^\s*[|│]\s*/, "");
    depth++;
  }
  return { depth, rest };
}

// ─── Justification parsing ──────────────────────────────────────────────────

// Patterns for justification at the end of a line:
//   "Premise"
//   "Assumption (CP)" or "Assumption (IP)" or "Assume (CP)" or "Assume CP"
//   "MP 1,2" or "MP 1, 2" or "MP 1 2"
//   "CP 3-7" or "IP 4-9" or "CP 3–7" (en-dash)

interface ParsedJustification {
  justification: string; // canonical form: "Premise", "Assumption (CP)", "MP 1,2", "CP 3-7"
  formula: string;       // everything before the justification
}

/**
 * Parse a line (after line number stripping) into formula + justification.
 */
function parseJustification(text: string): ParsedJustification | null {
  const trimmed = text.trim();

  // Case 1: Just "Premise"
  const premiseMatch = trimmed.match(/^(.+?)\s+Premise$/i);
  if (premiseMatch) {
    return {
      justification: "Premise",
      formula: premiseMatch[1].trim(),
    };
  }

  // Case 2: "Assumption (CP)" or "Assumption (IP)" or "Assume (CP)" etc.
  const assumptionMatch = trimmed.match(
    /^(.+?)\s+(?:Assumption|Assume|Ass\.?)\s*\(?\s*(CP|IP)\s*\)?$/i
  );
  if (assumptionMatch) {
    const tech = canonicalizeRule(assumptionMatch[2]);
    if (tech) {
      return {
        justification: `Assumption (${tech.canonical})`,
        formula: assumptionMatch[1].trim(),
      };
    }
  }

  // Case 3: Subproof close: "CP 3-7" or "IP 4-9" at the end
  const subproofCloseMatch = trimmed.match(
    /^(.+?)\s+(CP|IP)\s+(\d+)\s*[-–]\s*(\d+)$/i
  );
  if (subproofCloseMatch) {
    const tech = canonicalizeRule(subproofCloseMatch[2]);
    if (tech) {
      const start = subproofCloseMatch[3];
      const end = subproofCloseMatch[4];
      return {
        justification: `${tech.canonical} ${start}-${end}`,
        formula: subproofCloseMatch[1].trim(),
      };
    }
  }

  // Case 4: Rule application: "RULE LINE_NUMBERS" at the end
  // Try to match the last word(s) as a rule name followed by line numbers,
  // or line numbers followed by a rule name.

  // Pattern A: "FORMULA RULE N,N,N" (rule then lines at end)
  const ruleFirstMatch = trimmed.match(
    /^(.+?)\s+([A-Za-z~⊥][A-Za-z .']*?)\s+(\d[\d,\s]*\d|\d)$/
  );
  if (ruleFirstMatch) {
    const formulaPart = ruleFirstMatch[1].trim();
    const rulePart = ruleFirstMatch[2].trim();
    const linesPart = ruleFirstMatch[3];
    const canon = canonicalizeRule(rulePart);
    if (canon && (canon.kind === "inference" || canon.kind === "equivalence")) {
      const lines = linesPart
        .split(/[\s,]+/)
        .map((s) => parseInt(s, 10))
        .filter((n) => !isNaN(n));
      return {
        justification: `${canon.canonical} ${lines.join(",")}`,
        formula: formulaPart,
      };
    }
  }

  // Pattern B: "FORMULA N,N RULE" (lines then rule at end)
  const linesFirstMatch = trimmed.match(
    /^(.+?)\s+(\d[\d,\s]*\d|\d)\s+([A-Za-z~⊥][A-Za-z .']*?)$/
  );
  if (linesFirstMatch) {
    const formulaPart = linesFirstMatch[1].trim();
    const linesPart = linesFirstMatch[2];
    const rulePart = linesFirstMatch[3].trim();
    const canon = canonicalizeRule(rulePart);
    if (canon && (canon.kind === "inference" || canon.kind === "equivalence")) {
      const lines = linesPart
        .split(/[\s,]+/)
        .map((s) => parseInt(s, 10))
        .filter((n) => !isNaN(n));
      return {
        justification: `${canon.canonical} ${lines.join(",")}`,
        formula: formulaPart,
      };
    }
  }

  // Pattern C: Just "RULE N" at end (common for equivalence rules on one line)
  const singleLineMatch = trimmed.match(
    /^(.+?)\s+([A-Za-z~⊥][A-Za-z .']*?)\s+(\d+)$/
  );
  if (singleLineMatch) {
    const formulaPart = singleLineMatch[1].trim();
    const rulePart = singleLineMatch[2].trim();
    const lineNum = singleLineMatch[3];
    const canon = canonicalizeRule(rulePart);
    if (canon && (canon.kind === "inference" || canon.kind === "equivalence")) {
      return {
        justification: `${canon.canonical} ${lineNum}`,
        formula: formulaPart,
      };
    }
  }

  return null;
}

// ─── Main parser ────────────────────────────────────────────────────────────

/**
 * Parse a raw LLM proof output into structured proof lines.
 *
 * @param rawOutput  The full text response from the LLM
 * @param theorem    The theorem being proved (used for context)
 * @returns          ParseResult with parsed lines, errors, and unparsed sections
 */
export function parseProof(rawOutput: string, theorem: Theorem): ParseResult {
  const lines: ParsedLine[] = [];
  const errors: ParseError[] = [];
  const unparsedSections: string[] = [];

  // Split into lines and filter out blanks / commentary
  const rawLines = rawOutput.split("\n");

  // Detect base indentation level from the first numbered line
  let baseIndent = 0;
  let indentUnit = 2; // default: 2 spaces per depth level
  let firstNumberedFound = false;

  // Pre-scan to detect indentation unit
  const indents: number[] = [];
  for (const raw of rawLines) {
    const stripped = raw.trimEnd();
    if (!stripped) continue;
    const { rest: afterMarkers } = stripSubproofMarkers(stripped);
    const { lineNumber } = stripLineNumber(afterMarkers.trimStart());
    if (lineNumber !== null) {
      const indent = measureIndent(stripped);
      indents.push(indent);
      if (!firstNumberedFound) {
        baseIndent = indent;
        firstNumberedFound = true;
      }
    }
  }

  // Determine indentation unit from the minimum non-zero difference
  if (indents.length > 1) {
    const uniqueIndents = [...new Set(indents)].sort((a, b) => a - b);
    if (uniqueIndents.length > 1) {
      const minDiff = uniqueIndents[1] - uniqueIndents[0];
      if (minDiff > 0) {
        indentUnit = minDiff;
      }
    }
  }

  let autoLineNumber = 1;
  let inProofBlock = false;

  for (const rawLine of rawLines) {
    const stripped = rawLine.trimEnd();

    // Skip empty lines
    if (!stripped.trim()) continue;

    // Skip common LLM commentary markers
    if (isCommentary(stripped.trim())) {
      if (inProofBlock) {
        // If we were in the proof, this might be trailing commentary
        continue;
      }
      unparsedSections.push(stripped);
      continue;
    }

    // Detect subproof markers (|, │)
    const { depth: markerDepth, rest: afterMarkers } =
      stripSubproofMarkers(stripped);

    // Measure indentation-based depth
    const indent = measureIndent(stripped);
    const indentDepth = Math.max(
      0,
      Math.round((indent - baseIndent) / indentUnit)
    );

    // Use marker depth if present, otherwise indentation depth
    const depth = markerDepth > 0 ? markerDepth : indentDepth;

    // Strip line number
    const { lineNumber, rest: afterLineNum } = stripLineNumber(
      afterMarkers.trimStart()
    );

    // If we can't find a line number AND the line doesn't look like proof
    // content, skip it
    if (lineNumber === null && !looksLikeProofLine(afterLineNum)) {
      unparsedSections.push(stripped);
      continue;
    }

    inProofBlock = true;

    // Parse the formula + justification
    const parsed = parseJustification(afterLineNum.trim());

    if (parsed) {
      const effectiveLineNum = lineNumber ?? autoLineNumber;
      lines.push({
        line_number: effectiveLineNum,
        formula: normalizeFormula(parsed.formula),
        justification: parsed.justification,
        depth,
        raw: rawLine,
      });
      autoLineNumber = effectiveLineNum + 1;
    } else {
      // Could not parse justification — record as error
      errors.push({
        line_number: lineNumber ?? autoLineNumber,
        raw: rawLine,
        message: `Could not parse justification from: "${afterLineNum.trim()}"`,
      });
      autoLineNumber = (lineNumber ?? autoLineNumber) + 1;
    }
  }

  return { lines, errors, unparsed_sections: unparsedSections };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Check if a line looks like LLM commentary rather than proof content.
 */
function isCommentary(line: string): boolean {
  const lower = line.toLowerCase();
  // Common LLM preamble/postscript patterns
  if (lower.startsWith("proof:")) return true;
  if (lower.startsWith("here is")) return true;
  if (lower.startsWith("here's")) return true;
  if (lower.startsWith("the proof")) return true;
  if (lower.startsWith("let me")) return true;
  if (lower.startsWith("i will")) return true;
  if (lower.startsWith("i'll")) return true;
  if (lower.startsWith("we need")) return true;
  if (lower.startsWith("we can")) return true;
  if (lower.startsWith("note:")) return true;
  if (lower.startsWith("note that")) return true;
  if (lower.startsWith("explanation")) return true;
  if (lower.startsWith("therefore")) return true;
  if (lower.startsWith("thus")) return true;
  if (lower.startsWith("qed")) return true;
  if (lower.startsWith("∎")) return true;
  if (lower.startsWith("//")) return true;
  if (lower.startsWith("/*")) return true;
  if (lower.startsWith("```")) return true;
  if (line.startsWith("─") || line.startsWith("—") || line.startsWith("---"))
    return true;
  return false;
}

/**
 * Check if a line looks like it could be proof content
 * (contains logical symbols, rule names, or line references).
 */
function looksLikeProofLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Contains logical symbols
  if (/[>v.~⊃∨·¬≡⊥∧→↔#]/.test(trimmed)) return true;
  // Contains a rule name
  if (/\b(MP|MT|DS|Simp|Conj|HS|Add|CD|NegE|DN|DeM|Comm|Assoc|Dist|Contra|Impl|Exp|Taut|Equiv|CP|IP|Premise|Assumption)\b/i.test(trimmed)) return true;
  // Contains uppercase single letters (atom names)
  if (/\b[A-Z]\b/.test(trimmed)) return true;
  return false;
}

// ─── CLI validation format ──────────────────────────────────────────────────

/**
 * Convert parsed proof lines into the JSON format expected by the
 * `propbench validate` CLI command.
 */
export function toValidationJSON(
  theorem: Theorem,
  parsed: ParseResult
): string {
  const proofLines = parsed.lines.map((line) => ({
    line_number: line.line_number,
    formula: line.formula,
    justification: line.justification,
    depth: line.depth,
  }));

  const payload = {
    theorem: {
      id: theorem.id,
      premises: theorem.premises,
      conclusion: theorem.conclusion,
      difficulty: theorem.difficulty,
      difficulty_value: theorem.difficulty_value,
    },
    proof: proofLines,
  };

  return JSON.stringify(payload, null, 2);
}
