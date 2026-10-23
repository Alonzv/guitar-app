// ScaleUp for macOS: one native window on the live app. Everything the web
// app does (sign-in, the AI calls, saving to the library, updates) keeps
// working because it is the same site; the window only gives it a Dock icon,
// its own menu bar entry and the microphone permission prompt.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running ScaleUp");
}
