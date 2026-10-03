use yolo_core::{SystemStats, current_system_stats};

#[tauri::command]
fn system_stats() -> SystemStats {
  current_system_stats()
}

#[tauri::command]
fn greet(name: &str) -> String {
  format!("Hello, {name}! (Tauri 3, Aphrody fork)")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![greet, system_stats])
    .run(tauri::generate_context!())
    .expect("error while running the tauri application");
}
