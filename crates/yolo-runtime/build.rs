use std::process::Command;

fn run(program: &str, args: &[&str]) -> String {
  Command::new(program)
    .args(args)
    .output()
    .ok()
    .filter(|o| o.status.success())
    .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    .filter(|s| !s.is_empty())
    .unwrap_or_else(|| "unknown".to_string())
}

fn main() {
  let rustc = std::env::var("RUSTC").unwrap_or_else(|_| "rustc".to_string());
  println!(
    "cargo:rustc-env=YOLO_RUNTIME_RUSTC={}",
    run(&rustc, &["--version"])
  );
  println!(
    "cargo:rustc-env=YOLO_RUNTIME_TARGET={}",
    std::env::var("TARGET").unwrap_or_else(|_| "unknown".to_string())
  );
  println!(
    "cargo:rustc-env=YOLO_RUNTIME_GIT_REV={}",
    run("git", &["rev-parse", "--short=12", "HEAD"])
  );
  println!("cargo:rerun-if-changed=build.rs");
  println!("cargo:rerun-if-changed=../../.git/HEAD");
}
