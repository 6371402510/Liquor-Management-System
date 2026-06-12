// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
use std::path::PathBuf;
use tauri::Manager; // Required to access app paths

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // 1. Get the OS AppData directory for this app
            let app_data_dir = app.path().app_data_dir()
                .expect("Failed to get app data dir");
            
            let app_data_str = app_data_dir.to_str()
                .expect("Invalid path string");

            // 2. Determine where the backend executable is
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

            // 3. Start the backend, PASSING the AppData path as an argument
            Command::new(backend_path)
                .arg(app_data_str) // <--- This passes the path to Python's sys.argv[1]
                .spawn()
                .expect("Backend failed to start");

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}