// Ultimate Tester desktop app: a native window over the same engine page the web version uses.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

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

fn main() {
    let slot = Arc::new(Mutex::new(None));
    watch_engine(slot.clone());
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Engine(slot))
        .build(tauri::generate_context!())
        .expect("failed to start Ultimate Tester")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                use tauri::Manager;
                if let Some(mut child) = app.state::<Engine>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
