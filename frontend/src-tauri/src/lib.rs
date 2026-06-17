use std::process::Command;
use std::path::PathBuf;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // --- Logger (Debug only) ---
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // --- Start Python Backend ---
            let app_data_dir = app.path().app_data_dir()
                .expect("Failed to get app data dir");
            
            let app_data_str = app_data_dir.to_str()
                .expect("Invalid path string");

            let backend_path = if cfg!(debug_assertions) {
                // DEV MODE: Look in the src-tauri/bin folder
                PathBuf::from("bin/main.exe")
            } else {
                // RELEASE/INSTALLED MODE: Look next to the installed exe
                let exe_dir = std::env::current_exe()
                    .expect("Failed to get exe path")
                    .parent()
                    .expect("Failed to get parent directory")
                    .to_path_buf();
                exe_dir.join("bin").join("main.exe")
            };

            Command::new(backend_path)
                .arg(app_data_str)
                .spawn()
                .expect("Backend failed to start");

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}