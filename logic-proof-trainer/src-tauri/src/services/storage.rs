use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use crate::models::{Proof, Theorem, UserStatistics};

/// Data structure for export/import
#[derive(Serialize, Deserialize)]
pub struct ExportData {
    pub proofs: Vec<Proof>,
    pub custom_theorems: Vec<Theorem>,
    pub statistics: UserStatistics,
}

/// Storage service for persisting data to disk
pub struct StorageService {
    data_dir: PathBuf,
}

#[derive(Debug)]
pub struct StorageError(pub String);

impl std::fmt::Display for StorageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Storage error: {}", self.0)
    }
}

impl std::error::Error for StorageError {}

impl From<std::io::Error> for StorageError {
    fn from(err: std::io::Error) -> Self {
        StorageError(err.to_string())
    }
}

impl From<serde_json::Error> for StorageError {
    fn from(err: serde_json::Error) -> Self {
        StorageError(err.to_string())
    }
}

impl StorageService {
    pub fn new() -> Result<Self, StorageError> {
        let data_dir = dirs::data_dir()
            .ok_or_else(|| StorageError("Could not find data directory".to_string()))?
            .join("LogicProofTrainer");

        // Create directories if they don't exist
        fs::create_dir_all(&data_dir)?;
        fs::create_dir_all(data_dir.join("proofs"))?;
        fs::create_dir_all(data_dir.join("theorems"))?;

        Ok(Self { data_dir })
    }

    fn proofs_dir(&self) -> PathBuf {
        self.data_dir.join("proofs")
    }

    fn theorems_dir(&self) -> PathBuf {
        self.data_dir.join("theorems")
    }

    fn statistics_file(&self) -> PathBuf {
        self.data_dir.join("statistics.json")
    }

    // Proof operations

    pub fn save_proof(&self, proof: &Proof) -> Result<(), StorageError> {
        let path = self.proofs_dir().join(format!("{}.json", proof.id));
        let json = serde_json::to_string_pretty(proof)?;
        fs::write(path, json)?;
        Ok(())
    }

    pub fn load_proof(&self, id: &str) -> Result<Proof, StorageError> {
        let path = self.proofs_dir().join(format!("{}.json", id));
        let json = fs::read_to_string(path)?;
        let proof: Proof = serde_json::from_str(&json)?;
        Ok(proof)
    }

    pub fn load_all_proofs(&self) -> Result<Vec<Proof>, StorageError> {
        let mut proofs = Vec::new();

        for entry in fs::read_dir(self.proofs_dir())? {
            let entry = entry?;
            let path = entry.path();

            if path.extension().map_or(false, |ext| ext == "json") {
                if let Ok(json) = fs::read_to_string(&path) {
                    if let Ok(proof) = serde_json::from_str::<Proof>(&json) {
                        proofs.push(proof);
                    }
                }
            }
        }

        Ok(proofs)
    }

    pub fn delete_proof(&self, id: &str) -> Result<(), StorageError> {
        let path = self.proofs_dir().join(format!("{}.json", id));
        if path.exists() {
            fs::remove_file(path)?;
        }
        Ok(())
    }

    // Custom theorem operations

    pub fn save_custom_theorem(&self, theorem: &Theorem) -> Result<(), StorageError> {
        let path = self.theorems_dir().join(format!("{}.json", theorem.id));
        let json = serde_json::to_string_pretty(theorem)?;
        fs::write(path, json)?;
        Ok(())
    }

    pub fn load_custom_theorem(&self, id: &str) -> Result<Theorem, StorageError> {
        let path = self.theorems_dir().join(format!("{}.json", id));
        let json = fs::read_to_string(path)?;
        let theorem: Theorem = serde_json::from_str(&json)?;
        Ok(theorem)
    }

    pub fn load_all_custom_theorems(&self) -> Result<Vec<Theorem>, StorageError> {
        let mut theorems = Vec::new();

        for entry in fs::read_dir(self.theorems_dir())? {
            let entry = entry?;
            let path = entry.path();

            if path.extension().map_or(false, |ext| ext == "json") {
                if let Ok(json) = fs::read_to_string(&path) {
                    if let Ok(theorem) = serde_json::from_str::<Theorem>(&json) {
                        theorems.push(theorem);
                    }
                }
            }
        }

        Ok(theorems)
    }

    pub fn delete_custom_theorem(&self, id: &str) -> Result<(), StorageError> {
        let path = self.theorems_dir().join(format!("{}.json", id));
        if path.exists() {
            fs::remove_file(path)?;
        }
        Ok(())
    }

    // Statistics operations

    pub fn save_statistics(&self, stats: &UserStatistics) -> Result<(), StorageError> {
        let json = serde_json::to_string_pretty(stats)?;
        fs::write(self.statistics_file(), json)?;
        Ok(())
    }

    pub fn load_statistics(&self) -> Result<UserStatistics, StorageError> {
        let path = self.statistics_file();
        if !path.exists() {
            return Ok(UserStatistics::default());
        }

        let json = fs::read_to_string(path)?;
        let stats: UserStatistics = serde_json::from_str(&json)?;
        Ok(stats)
    }

    // Export/Import operations

    pub fn export_all(&self) -> Result<String, StorageError> {
        let data = ExportData {
            proofs: self.load_all_proofs()?,
            custom_theorems: self.load_all_custom_theorems()?,
            statistics: self.load_statistics()?,
        };

        let json = serde_json::to_string_pretty(&data)?;
        Ok(json)
    }

    pub fn import_all(&self, json: &str) -> Result<(), StorageError> {
        let data: ExportData = serde_json::from_str(json)?;

        for proof in &data.proofs {
            self.save_proof(proof)?;
        }

        for theorem in &data.custom_theorems {
            self.save_custom_theorem(theorem)?;
        }

        self.save_statistics(&data.statistics)?;

        Ok(())
    }
}

impl Default for StorageService {
    fn default() -> Self {
        Self::new().expect("Failed to initialize storage service")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Formula, theorem::Difficulty};
    use tempfile::tempdir;

    fn create_test_storage() -> StorageService {
        let temp = tempdir().unwrap();
        StorageService {
            data_dir: temp.into_path(),
        }
    }

    #[test]
    fn test_save_and_load_proof() {
        let storage = create_test_storage();
        fs::create_dir_all(storage.proofs_dir()).unwrap();

        let theorem = Theorem::new(
            vec![Formula::parse("P").unwrap()],
            Formula::parse("P").unwrap(),
            Difficulty::Easy,
            None,
            None,
        );
        let proof = Proof::new(theorem);
        let id = proof.id.clone();

        storage.save_proof(&proof).unwrap();
        let loaded = storage.load_proof(&id).unwrap();

        assert_eq!(loaded.id, id);
    }

    #[test]
    fn test_statistics() {
        let storage = create_test_storage();

        let mut stats = UserStatistics::new();
        stats.total_proofs_attempted = 10;
        stats.total_proofs_completed = 7;

        storage.save_statistics(&stats).unwrap();
        let loaded = storage.load_statistics().unwrap();

        assert_eq!(loaded.total_proofs_attempted, 10);
        assert_eq!(loaded.total_proofs_completed, 7);
    }
}
