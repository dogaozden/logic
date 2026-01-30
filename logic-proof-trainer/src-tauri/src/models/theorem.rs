use serde::{Deserialize, Serialize};
use uuid::Uuid;
use super::formula::Formula;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Difficulty {
    Easy,
    Medium,
    Hard,
    Expert,
}

impl Difficulty {
    pub fn display_name(&self) -> &'static str {
        match self {
            Difficulty::Easy => "Easy",
            Difficulty::Medium => "Medium",
            Difficulty::Hard => "Hard",
            Difficulty::Expert => "Expert",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Theme {
    ModusPonens,
    ModusTollens,
    HypotheticalSyllogism,
    DisjunctiveSyllogism,
    ConstructiveDilemma,
    Conjunction,
    Disjunction,
    DoubleNegation,
    Biconditional,
    ConditionalProof,
    IndirectProof,
    Equivalence,
    Mixed,
}

impl Theme {
    pub fn display_name(&self) -> &'static str {
        match self {
            Theme::ModusPonens => "Modus Ponens",
            Theme::ModusTollens => "Modus Tollens",
            Theme::HypotheticalSyllogism => "Hypothetical Syllogism",
            Theme::DisjunctiveSyllogism => "Disjunctive Syllogism",
            Theme::ConstructiveDilemma => "Constructive Dilemma",
            Theme::Conjunction => "Conjunction",
            Theme::Disjunction => "Disjunction",
            Theme::DoubleNegation => "Double Negation",
            Theme::Biconditional => "Biconditional",
            Theme::ConditionalProof => "Conditional Proof",
            Theme::IndirectProof => "Indirect Proof",
            Theme::Equivalence => "Equivalence",
            Theme::Mixed => "Mixed",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Theorem {
    pub id: String,
    pub premises: Vec<Formula>,
    pub conclusion: Formula,
    pub difficulty: Difficulty,
    pub theme: Option<Theme>,
    pub name: Option<String>,
    pub is_classic: bool,
}

impl Theorem {
    pub fn new(
        premises: Vec<Formula>,
        conclusion: Formula,
        difficulty: Difficulty,
        theme: Option<Theme>,
        name: Option<String>,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            premises,
            conclusion,
            difficulty,
            theme,
            name,
            is_classic: false,
        }
    }

    pub fn display_string(&self) -> String {
        if self.premises.is_empty() {
            format!("∴ {}", self.conclusion.display_string())
        } else {
            let premises_str = self
                .premises
                .iter()
                .map(|p| p.display_string())
                .collect::<Vec<_>>()
                .join(", ");
            format!("{} ∴ {}", premises_str, self.conclusion.display_string())
        }
    }
}

/// Classic theorems for training
pub fn get_classic_theorems() -> Vec<Theorem> {
    vec![
        // 1. Simple Modus Ponens
        Theorem {
            id: "classic-1".to_string(),
            premises: vec![
                Formula::parse("P -> Q").unwrap(),
                Formula::parse("P").unwrap(),
            ],
            conclusion: Formula::parse("Q").unwrap(),
            difficulty: Difficulty::Easy,
            theme: Some(Theme::ModusPonens),
            name: Some("Modus Ponens".to_string()),
            is_classic: true,
        },
        // 2. Modus Tollens
        Theorem {
            id: "classic-2".to_string(),
            premises: vec![
                Formula::parse("P -> Q").unwrap(),
                Formula::parse("~Q").unwrap(),
            ],
            conclusion: Formula::parse("~P").unwrap(),
            difficulty: Difficulty::Easy,
            theme: Some(Theme::ModusTollens),
            name: Some("Modus Tollens".to_string()),
            is_classic: true,
        },
        // 3. Hypothetical Syllogism
        Theorem {
            id: "classic-3".to_string(),
            premises: vec![
                Formula::parse("P -> Q").unwrap(),
                Formula::parse("Q -> R").unwrap(),
            ],
            conclusion: Formula::parse("P -> R").unwrap(),
            difficulty: Difficulty::Easy,
            theme: Some(Theme::HypotheticalSyllogism),
            name: Some("Hypothetical Syllogism".to_string()),
            is_classic: true,
        },
        // 4. Disjunctive Syllogism
        Theorem {
            id: "classic-4".to_string(),
            premises: vec![
                Formula::parse("P | Q").unwrap(),
                Formula::parse("~P").unwrap(),
            ],
            conclusion: Formula::parse("Q").unwrap(),
            difficulty: Difficulty::Easy,
            theme: Some(Theme::DisjunctiveSyllogism),
            name: Some("Disjunctive Syllogism".to_string()),
            is_classic: true,
        },
        // 5. Constructive Dilemma
        Theorem {
            id: "classic-5".to_string(),
            premises: vec![
                Formula::parse("(P -> Q) & (R -> S)").unwrap(),
                Formula::parse("P | R").unwrap(),
            ],
            conclusion: Formula::parse("Q | S").unwrap(),
            difficulty: Difficulty::Medium,
            theme: Some(Theme::ConstructiveDilemma),
            name: Some("Constructive Dilemma".to_string()),
            is_classic: true,
        },
        // 6. Law of Excluded Middle (requires indirect proof)
        Theorem {
            id: "classic-6".to_string(),
            premises: vec![],
            conclusion: Formula::parse("P | ~P").unwrap(),
            difficulty: Difficulty::Medium,
            theme: Some(Theme::IndirectProof),
            name: Some("Law of Excluded Middle".to_string()),
            is_classic: true,
        },
        // 7. Double Negation Elimination
        Theorem {
            id: "classic-7".to_string(),
            premises: vec![Formula::parse("~~P").unwrap()],
            conclusion: Formula::parse("P").unwrap(),
            difficulty: Difficulty::Easy,
            theme: Some(Theme::DoubleNegation),
            name: Some("Double Negation Elimination".to_string()),
            is_classic: true,
        },
        // 8. Contraposition
        Theorem {
            id: "classic-8".to_string(),
            premises: vec![Formula::parse("P -> Q").unwrap()],
            conclusion: Formula::parse("~Q -> ~P").unwrap(),
            difficulty: Difficulty::Medium,
            theme: Some(Theme::ConditionalProof),
            name: Some("Contraposition".to_string()),
            is_classic: true,
        },
        // 9. DeMorgan's Law (And to Or)
        Theorem {
            id: "classic-9".to_string(),
            premises: vec![Formula::parse("~(P & Q)").unwrap()],
            conclusion: Formula::parse("~P | ~Q").unwrap(),
            difficulty: Difficulty::Hard,
            theme: Some(Theme::Equivalence),
            name: Some("De Morgan (And to Or)".to_string()),
            is_classic: true,
        },
        // 10. DeMorgan's Law (Or to And)
        Theorem {
            id: "classic-10".to_string(),
            premises: vec![Formula::parse("~(P | Q)").unwrap()],
            conclusion: Formula::parse("~P & ~Q").unwrap(),
            difficulty: Difficulty::Hard,
            theme: Some(Theme::Equivalence),
            name: Some("De Morgan (Or to And)".to_string()),
            is_classic: true,
        },
        // 11. Material Implication
        Theorem {
            id: "classic-11".to_string(),
            premises: vec![Formula::parse("P -> Q").unwrap()],
            conclusion: Formula::parse("~P | Q").unwrap(),
            difficulty: Difficulty::Medium,
            theme: Some(Theme::Equivalence),
            name: Some("Material Implication".to_string()),
            is_classic: true,
        },
        // 12. Exportation
        Theorem {
            id: "classic-12".to_string(),
            premises: vec![Formula::parse("(P & Q) -> R").unwrap()],
            conclusion: Formula::parse("P -> (Q -> R)").unwrap(),
            difficulty: Difficulty::Hard,
            theme: Some(Theme::ConditionalProof),
            name: Some("Exportation".to_string()),
            is_classic: true,
        },
        // 13. Pierce's Law (requires indirect proof)
        Theorem {
            id: "classic-13".to_string(),
            premises: vec![],
            conclusion: Formula::parse("((P -> Q) -> P) -> P").unwrap(),
            difficulty: Difficulty::Expert,
            theme: Some(Theme::IndirectProof),
            name: Some("Peirce's Law".to_string()),
            is_classic: true,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classic_theorems_valid() {
        let classics = get_classic_theorems();
        assert_eq!(classics.len(), 13);
        for theorem in &classics {
            assert!(theorem.is_classic);
        }
    }

    #[test]
    fn test_display_string() {
        let theorem = &get_classic_theorems()[0];
        assert_eq!(theorem.display_string(), "P ⊃ Q, P ⊢ Q");
    }
}
