// ScaleUp for macOS: one native window on the live app. Everything the web
// app does (the AI calls, saving to the library, updates) keeps working
// because it is the same site; the window gives it a Dock icon, its own menu
// bar entry and the microphone permission prompt.
//
// Sign-in with Google or Apple can't happen inside the window — both refuse
// embedded web views — so it goes through the system browser:
//   1. The page navigates to the sign-in URL; this window cancels that
//      navigation and opens the URL in Safari/Chrome instead. Any other
//      off-site link opens there too.
//   2. After signing in, Supabase sends the browser to
//      /desktop-auth.html#access_token=…, which bounces to
//      scaleup://auth#access_token=….
//   3. macOS hands that link back here; the window is brought forward and the
//      tokens are passed to the page (window.__scaleupDesktopAuth), which
//      starts the session.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{webview::Color, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;

const APP_URL: &str = "https://guitar-app-zeta.vercel.app";
const APP_HOST: &str = "guitar-app-zeta.vercel.app";

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(APP_URL.parse().unwrap()))
                .title("ScaleUp")
                .inner_size(1360.0, 880.0)
                .min_inner_size(960.0, 640.0)
                .center()
                .background_color(Color(0xEC, 0xEA, 0xE3, 0xFF))
                // Lets the page know it runs in the Mac app (sign-in returns here).
                .initialization_script("window.__SCALEUP_DESKTOP__ = true;")
                .on_navigation(|url| {
                    let ours = url.host_str() == Some(APP_HOST);
                    let inert = matches!(url.scheme(), "about" | "blob" | "data");
                    if ours || inert {
                        return true;
                    }
                    // Sign-in pages and outside links open in the browser.
                    let _ = tauri_plugin_opener::open_url(url.as_str(), None::<&str>);
                    false
                })
                .build()?;

            // scaleup://auth#access_token=… — the browser returning a sign-in.
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let Some(win) = handle.get_webview_window("main") else { return };
                for url in event.urls() {
                    if url.scheme() != "scaleup" || url.host_str() != Some("auth") {
                        continue;
                    }
                    let fragment = url.fragment().unwrap_or("");
                    let query = url.query().unwrap_or("");
                    let payload = serde_json::json!({ "hash": fragment, "query": query }).to_string();
                    let _ = win.eval(format!(
                        "window.__scaleupDesktopAuth && window.__scaleupDesktopAuth({payload});"
                    ));
                    let _ = win.unminimize();
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            });

            let _ = window;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ScaleUp");
}
