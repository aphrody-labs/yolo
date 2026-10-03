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
  compute_benchmark_cancellable(iterations, || false)
    .expect("a benchmark that is never cancelled always completes")
}

/// Rounds between two cancellation checks.
const CANCEL_CHECK_INTERVAL: u32 = 1 << 20;

/// Same computation as [`compute_benchmark`], polling `cancelled` every
/// [`CANCEL_CHECK_INTERVAL`] rounds. Returns `None` when cancelled.
pub fn compute_benchmark_cancellable(
  iterations: u32,
  cancelled: impl Fn() -> bool,
) -> Option<BenchmarkResult> {
  let start = std::time::Instant::now();
  let mut counter: u64 = 0;
  for i in 0..iterations {
    if i % CANCEL_CHECK_INTERVAL == 0 && cancelled() {
      return None;
    }
    counter = counter.wrapping_add(i as u64).rotate_left(3);
  }
  let elapsed = start.elapsed().as_micros() as u64;

  Some(BenchmarkResult {
    message: format!("Computed {} rounds (checksum: {})", iterations, counter),
    latency_us: elapsed,
  })
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
  fn benchmark_can_be_cancelled() {
    assert!(compute_benchmark_cancellable(u32::MAX, || true).is_none());
    assert!(compute_benchmark_cancellable(10, || true).is_none());
    assert!(compute_benchmark_cancellable(0, || false).is_some());
  }

  #[test]
  fn test_benchmark() {
    let res = compute_benchmark(1000);
    assert!(res.message.contains("1000"));
  }
}
