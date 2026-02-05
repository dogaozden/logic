use clap::{Parser, Subcommand};
use logic_proof_trainer_lib::models::{
    Formula, Proof, Justification,
    theorem::{Difficulty, Theorem},
    rules::{InferenceRule, EquivalenceRule, ProofTechnique},
};
use logic_proof_trainer_lib::services::{TheoremGenerator, ProofVerifier};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

// ─── CLI argument parsing ───────────────────────────────────────────────────

#[derive(Parser)]
#[command(name = "propbench")]
#[command(about = "PropBench — LLM benchmark for propositional logic proof efficiency")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Generate a benchmark theorem set
    Generate {
        /// Number of theorems to generate
        #[arg(short, long, default_value_t = 100)]
        count: usize,

        /// Difficulty distribution as "N:tier,N:tier,..."
        /// e.g. "30:easy,30:medium,20:hard,15:expert,5:nightmare"
        #[arg(short, long, default_value = "30:easy,30:medium,20:hard,15:expert,5:nightmare")]
        difficulty_distribution: String,

        /// Output file path
        #[arg(short, long, default_value = "theorems.json")]
        output: PathBuf,
    },

    /// Validate a proof against a theorem
    Validate {
        /// Path to theorem JSON file (single theorem object)
        #[arg(long)]
        theorem: PathBuf,

        /// Path to proof JSON file (array of proof lines)
        #[arg(long)]
        proof: PathBuf,
    },
}

// ─── Output types ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
struct BenchTheorem {
    id: String,
    premises: Vec<String>,
    conclusion: String,
    difficulty: String,
    difficulty_value: u8,
}

impl From<&Theorem> for BenchTheorem {
    fn from(t: &Theorem) -> Self {
        BenchTheorem {
            id: t.id.clone(),
            premises: t.premises.iter().map(|f| f.ascii_string()).collect(),
            conclusion: t.conclusion.ascii_string(),
            difficulty: difficulty_label(t.difficulty_value),
            difficulty_value: t.difficulty_value,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct ValidateInput {
    line_number: usize,
    formula: String,
    justification: String,
    depth: usize,
}

#[derive(Debug, Serialize)]
struct ValidateOutput {
    valid: bool,
    line_count: usize,
    errors: Vec<String>,
}

// ─── Difficulty helpers ─────────────────────────────────────────────────────

fn difficulty_label(value: u8) -> String {
    match value {
        1..=25 => "Easy".to_string(),
        26..=45 => "Medium".to_string(),
        46..=70 => "Hard".to_string(),
        71..=85 => "Expert".to_string(),
        86..=95 => "Nightmare".to_string(),
        _ => "Marathon".to_string(),
    }
}

fn parse_difficulty_distribution(spec: &str) -> Result<Vec<(usize, u8, u8)>, String> {
    // Parse "30:easy,30:medium,20:hard,15:expert,5:nightmare"
    // Returns Vec of (count, min_difficulty, max_difficulty)
    let mut result = Vec::new();
    for part in spec.split(',') {
        let parts: Vec<&str> = part.trim().split(':').collect();
        if parts.len() != 2 {
            return Err(format!("Invalid distribution part: '{}'. Expected 'N:tier'.", part));
        }
        let count: usize = parts[0].trim().parse()
            .map_err(|_| format!("Invalid count: '{}'", parts[0]))?;
        let (min, max) = match parts[1].trim().to_lowercase().as_str() {
            "easy" => (1u8, 25u8),
            "medium" => (26, 45),
            "hard" => (46, 70),
            "expert" => (71, 85),
            "nightmare" => (86, 95),
            "marathon" => (96, 100),
            other => return Err(format!("Unknown difficulty tier: '{}'. Use easy/medium/hard/expert/nightmare/marathon.", other)),
        };
        result.push((count, min, max));
    }
    Ok(result)
}

// ─── Generate command ───────────────────────────────────────────────────────

fn cmd_generate(count: usize, distribution_spec: &str, output: &PathBuf) -> Result<(), String> {
    let distribution = parse_difficulty_distribution(distribution_spec)?;

    // Validate that distribution sums to count
    let total: usize = distribution.iter().map(|(c, _, _)| c).sum();
    if total != count {
        return Err(format!(
            "Distribution sums to {} but --count is {}. They must match.",
            total, count
        ));
    }

    let mut rng = rand::thread_rng();
    let mut theorems: Vec<BenchTheorem> = Vec::with_capacity(count);
    let mut theorem_id = 1usize;

    for (tier_count, min_val, max_val) in &distribution {
        let tier_name = difficulty_label(*min_val);
        eprintln!("Generating {} {} theorems (difficulty {}-{})...", tier_count, tier_name, min_val, max_val);

        for _ in 0..*tier_count {
            let difficulty_value = rng.gen_range(*min_val..=*max_val);
            let generator = TheoremGenerator::with_difficulty_value(difficulty_value);
            let theorem = generator.generate_with_value(difficulty_value);

            let mut bench = BenchTheorem::from(&theorem);
            bench.id = format!("v1-{:03}", theorem_id);
            theorems.push(bench);
            theorem_id += 1;
        }
    }

    // Create parent directories if needed
    if let Some(parent) = output.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create output directory: {}", e))?;
        }
    }

    let json = serde_json::to_string_pretty(&theorems)
        .map_err(|e| format!("JSON serialization error: {}", e))?;
    fs::write(output, &json)
        .map_err(|e| format!("Failed to write output file: {}", e))?;

    eprintln!("Wrote {} theorems to {}", theorems.len(), output.display());
    Ok(())
}

// ─── Validate command ───────────────────────────────────────────────────────

fn cmd_validate(theorem_path: &PathBuf, proof_path: &PathBuf) -> Result<(), String> {
    // Read theorem
    let theorem_json = fs::read_to_string(theorem_path)
        .map_err(|e| format!("Failed to read theorem file: {}", e))?;
    let bench_theorem: BenchTheorem = serde_json::from_str(&theorem_json)
        .map_err(|e| format!("Failed to parse theorem JSON: {}", e))?;

    // Parse theorem formulas
    let premises: Vec<Formula> = bench_theorem.premises.iter()
        .map(|p| Formula::parse(p).map_err(|e| format!("Invalid premise '{}': {}", p, e)))
        .collect::<Result<Vec<_>, _>>()?;

    let conclusion = Formula::parse(&bench_theorem.conclusion)
        .map_err(|e| format!("Invalid conclusion '{}': {}", bench_theorem.conclusion, e))?;

    let difficulty = match bench_theorem.difficulty_value {
        1..=25 => Difficulty::Easy,
        26..=45 => Difficulty::Medium,
        46..=70 => Difficulty::Hard,
        _ => Difficulty::Expert,
    };

    let theorem = Theorem::with_difficulty_value(
        premises,
        conclusion,
        difficulty,
        bench_theorem.difficulty_value,
        None,
        None,
    );

    // Read proof lines
    let proof_json = fs::read_to_string(proof_path)
        .map_err(|e| format!("Failed to read proof file: {}", e))?;
    let input_lines: Vec<ValidateInput> = serde_json::from_str(&proof_json)
        .map_err(|e| format!("Failed to parse proof JSON: {}", e))?;

    // Build the proof by replaying each line
    let mut proof = Proof::new(theorem);
    let mut errors: Vec<String> = Vec::new();

    for input_line in &input_lines {
        let formula = match Formula::parse(&input_line.formula) {
            Ok(f) => f,
            Err(e) => {
                errors.push(format!("Line {}: Invalid formula '{}': {}", input_line.line_number, input_line.formula, e));
                continue;
            }
        };

        let justification = match parse_justification(&input_line.justification) {
            Ok(j) => j,
            Err(e) => {
                errors.push(format!("Line {}: Invalid justification '{}': {}", input_line.line_number, input_line.justification, e));
                continue;
            }
        };

        // Handle different justification types
        match &justification {
            Justification::Assumption { technique } => {
                proof.open_subproof(formula, *technique);
            }
            Justification::SubproofConclusion { technique, .. } => {
                let closed = proof.close_subproof(formula.clone(), *technique).is_some();
                if closed {
                    let last_idx = proof.lines.len() - 1;
                    let line = &proof.lines[last_idx];
                    let result = ProofVerifier::verify_line(line, &proof);
                    proof.lines[last_idx].is_valid = result.is_valid;
                    proof.lines[last_idx].validation_message = result.message.clone();
                    if !result.is_valid {
                        errors.push(format!("Line {}: {}", input_line.line_number,
                            result.message.unwrap_or_else(|| "Invalid".to_string())));
                    }
                } else {
                    errors.push(format!("Line {}: No open subproof to close", input_line.line_number));
                }
            }
            _ => {
                proof.add_line(formula, justification);
                let last_idx = proof.lines.len() - 1;
                let line = &proof.lines[last_idx];
                let result = ProofVerifier::verify_line(line, &proof);
                proof.lines[last_idx].is_valid = result.is_valid;
                proof.lines[last_idx].validation_message = result.message.clone();
                if !result.is_valid {
                    errors.push(format!("Line {}: {}", input_line.line_number,
                        result.message.unwrap_or_else(|| "Invalid".to_string())));
                }
            }
        }
    }

    // Check completeness
    proof.check_complete();

    let non_premise_lines = proof.lines.len().saturating_sub(proof.theorem.premises.len());
    let output = ValidateOutput {
        valid: proof.is_complete && errors.is_empty(),
        line_count: non_premise_lines,
        errors,
    };

    let json = serde_json::to_string_pretty(&output)
        .map_err(|e| format!("JSON serialization error: {}", e))?;
    println!("{}", json);
    Ok(())
}

// ─── Justification parsing ──────────────────────────────────────────────────

fn parse_justification(s: &str) -> Result<Justification, String> {
    let s = s.trim();

    // Premise
    if s.eq_ignore_ascii_case("premise") || s.eq_ignore_ascii_case("pr") {
        return Ok(Justification::Premise);
    }

    // Assumption (CP) or Assumption (IP)
    if s.to_lowercase().starts_with("assumption") || s.to_lowercase().starts_with("assume") {
        let technique = if s.to_uppercase().contains("IP") {
            ProofTechnique::IndirectProof
        } else {
            ProofTechnique::ConditionalProof
        };
        return Ok(Justification::Assumption { technique });
    }

    // Subproof conclusion: "CP 3-7" or "IP 3-7"
    if let Some(rest) = strip_prefix_ci(s, "CP") {
        if let Some((start, end)) = parse_line_range(rest.trim()) {
            return Ok(Justification::SubproofConclusion {
                technique: ProofTechnique::ConditionalProof,
                subproof_start: start,
                subproof_end: end,
            });
        }
    }
    if let Some(rest) = strip_prefix_ci(s, "IP") {
        if let Some((start, end)) = parse_line_range(rest.trim()) {
            return Ok(Justification::SubproofConclusion {
                technique: ProofTechnique::IndirectProof,
                subproof_start: start,
                subproof_end: end,
            });
        }
    }

    // Inference rules: "MP 1,2" or "Simp 3"
    let inference_rules: &[(&str, InferenceRule)] = &[
        ("MP", InferenceRule::ModusPonens),
        ("MT", InferenceRule::ModusTollens),
        ("DS", InferenceRule::DisjunctiveSyllogism),
        ("HS", InferenceRule::HypotheticalSyllogism),
        ("Simp", InferenceRule::Simplification),
        ("Conj", InferenceRule::Conjunction),
        ("Add", InferenceRule::Addition),
        ("CD", InferenceRule::ConstructiveDilemma),
        ("NegE", InferenceRule::Contradiction),
    ];

    for (abbrev, rule) in inference_rules {
        if let Some(rest) = strip_prefix_ci(s, abbrev) {
            let rest = rest.trim();
            if rest.is_empty() {
                return Err(format!("Missing line numbers for {}", abbrev));
            }
            let lines = parse_line_numbers(rest)?;
            return Ok(Justification::Inference { rule: *rule, lines });
        }
    }

    // Equivalence rules: "DN 3" or "DeM 5"
    let equiv_rules: &[(&str, EquivalenceRule)] = &[
        ("DN", EquivalenceRule::DoubleNegation),
        ("DeM", EquivalenceRule::DeMorgan),
        ("Comm", EquivalenceRule::Commutation),
        ("Assoc", EquivalenceRule::Association),
        ("Dist", EquivalenceRule::Distribution),
        ("Contra", EquivalenceRule::Contraposition),
        ("Impl", EquivalenceRule::Implication),
        ("Exp", EquivalenceRule::Exportation),
        ("Taut", EquivalenceRule::Tautology),
        ("Equiv", EquivalenceRule::Equivalence),
    ];

    for (abbrev, rule) in equiv_rules {
        if let Some(rest) = strip_prefix_ci(s, abbrev) {
            let rest = rest.trim();
            if rest.is_empty() {
                return Err(format!("Missing line number for {}", abbrev));
            }
            let line: usize = rest.parse()
                .map_err(|_| format!("Invalid line number for {}: '{}'", abbrev, rest))?;
            return Ok(Justification::Equivalence { rule: *rule, line });
        }
    }

    Err(format!("Unrecognized justification: '{}'", s))
}

fn strip_prefix_ci<'a>(s: &'a str, prefix: &str) -> Option<&'a str> {
    let s_lower = s.to_lowercase();
    let prefix_lower = prefix.to_lowercase();
    if s_lower.starts_with(&prefix_lower) {
        let rest = &s[prefix.len()..];
        // Must be followed by whitespace, digit, or end of string
        if rest.is_empty() || rest.starts_with(char::is_whitespace) || rest.starts_with(char::is_numeric) {
            Some(rest)
        } else {
            None
        }
    } else {
        None
    }
}

fn parse_line_numbers(s: &str) -> Result<Vec<usize>, String> {
    let s = s.trim();
    s.split(|c: char| c == ',' || c.is_whitespace())
        .filter(|p| !p.is_empty())
        .map(|p| p.trim().parse::<usize>().map_err(|_| format!("Invalid line number: '{}'", p)))
        .collect()
}

fn parse_line_range(s: &str) -> Option<(usize, usize)> {
    let parts: Vec<&str> = s.split('-').collect();
    if parts.len() == 2 {
        let start = parts[0].trim().parse::<usize>().ok()?;
        let end = parts[1].trim().parse::<usize>().ok()?;
        Some((start, end))
    } else {
        None
    }
}

// ─── Main ───────────────────────────────────────────────────────────────────

fn main() {
    let cli = Cli::parse();

    let result = match cli.command {
        Commands::Generate { count, difficulty_distribution, output } => {
            cmd_generate(count, &difficulty_distribution, &output)
        }
        Commands::Validate { theorem, proof } => {
            cmd_validate(&theorem, &proof)
        }
    };

    if let Err(e) = result {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}
