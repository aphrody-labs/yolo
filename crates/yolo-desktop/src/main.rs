// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // Wayland & WSL low-level display pipeline tuning:
  // Ensures hardware composition doesn't crash on DMA-BUF protocols or NVIDIA/WSL drivers
  #[cfg(target_os = "linux")]
  {
    // In Rust 2024 / modern std, set_var is unsafe due to multi-threaded environment safety.
    // We set these at the very beginning of main() before spawning threads or initializing WebKitGTK.
    unsafe {
      if std::env::var("__NV_DISABLE_EXPLICIT_SYNC").is_err() {
        std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1");
      }
      if std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_err() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
      }
    }
  }

  yolo_desktop_lib::run()
}
