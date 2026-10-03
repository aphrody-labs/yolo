use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemStats {
    pub os: String,
    pub arch: String,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkResult {
    pub message: String,
    pub latency_us: u64,
}

pub fn current_system_stats() -> SystemStats {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    SystemStats {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        timestamp_ms: now,
    }
}

pub fn compute_benchmark(iterations: u32) -> BenchmarkResult {
    let start = std::time::Instant::now();
    let mut counter: u64 = 0;
    for i in 0..iterations {
        counter = counter.wrapping_add(i as u64).rotate_left(3);
    }
    let elapsed = start.elapsed().as_micros() as u64;

    BenchmarkResult {
        message: format!("Computed {} rounds (checksum: {})", iterations, counter),
        latency_us: elapsed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_system_stats() {
        let stats = current_system_stats();
        assert!(!stats.os.is_empty());
        assert!(!stats.arch.is_empty());
        assert!(stats.timestamp_ms > 0);
    }

    #[test]
    fn test_benchmark() {
        let res = compute_benchmark(1000);
        assert!(res.message.contains("1000"));
    }
}
