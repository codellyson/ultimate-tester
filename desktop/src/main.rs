// Ultimate Tester desktop app: a native window over the same engine page the web version uses.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

struct Engine(Arc<Mutex<Option<Child>>>);

fn engine_up() -> bool {
    TcpStream::connect_timeout(&"127.0.0.1:4600".parse().unwrap(), Duration::from_millis(300)).is_ok()
}

// Starts the Node engine. A login shell gives it the user's PATH, which a GUI app on macOS does not get.
fn spawn_engine() -> Option<Child> {
    let cli = option_env!("ULTIMATE_TESTER_CLI")
        .map(String::from)
        .unwrap_or_else(|| format!("{}/../bin/ultimate-tester.js", env!("CARGO_MANIFEST_DIR")));
    Command::new("/bin/zsh")
        .args(["-lc", &format!("exec node {:?} serve", cli)])
        .spawn()
        .ok()
}

// Keeps an engine running for as long as the app is open: one that was already up may stop
// (another copy quitting, a restart), and then the app starts its own.
fn watch_engine(slot: Arc<Mutex<Option<Child>>>) {
    thread::spawn(move || loop {
        if !engine_up() {
            let mut child = slot.lock().unwrap();
            let ours_alive = child.as_mut().map(|c| matches!(c.try_wait(), Ok(None))).unwrap_or(false);
            if !ours_alive {
                *child = spawn_engine();
            }
        }
        thread::sleep(Duration::from_secs(2));
    });
}

// The menu bar: every app command lives here, so it can be found without knowing ⌘K.
// Custom items go to the page as a "menu" event with the item's id; the page does the work.
fn build_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let item = |id: &str, text: &str, accel: Option<&str>| MenuItem::with_id(app, id, text, true, accel);
    let sep = || PredefinedMenuItem::separator(app);
    let about = AboutMetadata { comments: Some("Tess tests your app the way a person would, every time it changes.".into()), ..Default::default() };
    Menu::with_items(app, &[
        &Submenu::with_items(app, "Ultimate Tester", true, &[
            &PredefinedMenuItem::about(app, Some("About Ultimate Tester"), Some(about))?,
            &sep()?,
            &item("settings", "Settings…", Some("CmdOrCtrl+,"))?,
            &sep()?,
            &PredefinedMenuItem::services(app, None)?,
            &sep()?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &sep()?,
            &PredefinedMenuItem::quit(app, None)?,
        ])?,
        &Submenu::with_items(app, "File", true, &[
            &item("new-test", "New Test…", Some("CmdOrCtrl+N"))?,
            &item("add-app", "Add App…", Some("CmdOrCtrl+O"))?,
            &sep()?,
            &PredefinedMenuItem::close_window(app, None)?,
        ])?,
        &Submenu::with_items(app, "Edit", true, &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &sep()?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ])?,
        &Submenu::with_items(app, "Test", true, &[
            &item("rerun", "Run Again", Some("CmdOrCtrl+R"))?,
            &item("stop", "Stop", Some("CmdOrCtrl+."))?,
        ])?,
        &Submenu::with_items(app, "View", true, &[
            &item("toggle-sidebar", "Toggle Sidebar", Some("Ctrl+CmdOrCtrl+S"))?,
            &sep()?,
            &item("show-checks", "Checks", Some("Alt+CmdOrCtrl+1"))?,
            &item("show-log", "Log", Some("Alt+CmdOrCtrl+2"))?,
            &sep()?,
            &item("commands", "Commands…", Some("CmdOrCtrl+K"))?,
            &sep()?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ])?,
        &Submenu::with_items(app, "Window", true, &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
        ])?,
        &Submenu::with_items(app, "Help", true, &[
            &item("getting-started", "Getting Started", None)?,
        ])?,
    ])
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn main() {
    let slot = Arc::new(Mutex::new(None));
    watch_engine(slot.clone());
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().with_denylist(&["settings"]).build()) // Settings opens at its own size every time
        .manage(Engine(slot))
        .menu(build_menu)
        .on_menu_event(|app, event| {
            let id = event.id().0.as_str();
            // Menu commands act on the main window, so bring it back if it was closed.
            show_main(app);
            let _ = app.emit_to("main", "menu", id.to_string());
        })
        .on_window_event(|window, event| {
            // Closing the main window hides it: tests keep running and results still arrive.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to start Ultimate Tester")
        .run(|app, event| match event {
            RunEvent::Reopen { .. } => show_main(app),
            RunEvent::Exit => {
                if let Some(mut child) = app.state::<Engine>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
            _ => {}
        });
}
