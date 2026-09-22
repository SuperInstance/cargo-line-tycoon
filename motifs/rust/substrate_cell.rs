// The substrate cell motif in Rust — zero-cost abstractions.
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

#[derive(Debug, Clone)]
pub struct SubstrateCell {
    pub id: String,
    pub prev_hash: String, // hex
    pub conversation_id: String,
    pub source: String,
    pub state: serde_json::Value,
}

impl SubstrateCell {
    pub fn hash(&self) -> String {
        // FNV-1a 64-bit, matches fleet canary
        let mut h: u64 = 0xcbf29ce484222325;
        let canonical = format!(
            "{}|{}|{}|{}|{}",
            self.id, self.conversation_id, self.prev_hash, self.source, self.state
        );
        for byte in canonical.as_bytes() {
            h ^= *byte as u64;
            h = h.wrapping_mul(0x100000001b3);
        }
        format!("0x{:016x}", h)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_canary() {
        // The canonical FNV-1a canary for "café Δ 日本語" must match
        let s = "café Δ 日本語";
        let mut h: u64 = 0xcbf29ce484222325;
        for byte in s.as_bytes() {
            h ^= byte as u64;
            h = h.wrapping_mul(0x100000001b3);
        }
        assert_eq!(h, 0x024a555471370b18d, "FNV-1a canary must match fleet pin");
    }
    
    #[test]
    fn test_cell_hash() {
        let cell = SubstrateCell {
            id: "test-cell".to_string(),
            prev_hash: "0x0000000000000000".to_string(),
            conversation_id: "default".to_string(),
            source: "test".to_string(),
            state: serde_json::json!({"key": "value"}),
        };
        let h = cell.hash();
        assert!(h.starts_with("0x"));
        assert_eq!(h.len(), 18); // 0x + 16 hex chars
    }
}
