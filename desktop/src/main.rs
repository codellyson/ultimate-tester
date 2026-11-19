// Ultimate Tester desktop app: a native window over the same engine page the web version uses.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::net::TcpStream;
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

struct Engine(Arc<Mutex<Option<Child>>>);
// Whether any app has a test running, as the page last reported it.
struct Testing(AtomicBool);
// Whether either window has an unsaved profile edit open.
struct Draft(AtomicBool);

#[tauri::command]
fn set_draft(app: tauri::AppHandle, dirty: bool) {
    app.state::<Draft>().0.store(dirty, Ordering::Relaxed);
}

// Who is on port 4600: our engine (its /health names it), something else, or nothing.
// Only our engine is trusted: the window loads it and it gets the app's native permissions.
#[derive(PartialEq)]
enum Port { Ours, Other, Free }

fn engine_port() -> Port {
    let Ok(mut s) = TcpStream::connect_timeout(&"127.0.0.1:4600".parse().unwrap(), Duration::from_millis(300)) else { return Port::Free };
    let _ = s.set_read_timeout(Some(Duration::from_millis(800)));
    let _ = s.write_all(b"GET /health HTTP/1.0\r\nHost: localhost:4600\r\n\r\n");
    let mut body = String::new();
    let _ = s.read_to_string(&mut body);
    if body.contains("\"service\":\"ultimate-tester\"") { Port::Ours } else { Port::Other }
}

// Set when the shell could not find `node` (exit 127): the engine can never start, so the launch page says why.
static NO_NODE: AtomicBool = AtomicBool::new(false);

// Asked by the launch page before it opens the engine.
#[tauri::command]
fn engine_status() -> &'static str {
    match engine_port() {
        Port::Ours => "ours",
        Port::Other => "other",
        Port::Free if NO_NODE.load(Ordering::Relaxed) => "no-node",
        Port::Free => "starting",
    }
}

// Starts the Node engine through the user's own shell, interactive and login (-ilc), so it gets the same
// PATH as their Terminal: nvm, fnm and volta set Node up in .zshrc, which a login-only shell skips.
fn spawn_engine(cli: &str) -> Option<Child> {
    let shell = std::env::var("SHELL").ok().filter(|s| s.starts_with('/')).unwrap_or_else(|| "/bin/zsh".into());
    Command::new(shell)
        .args(["-ilc", &format!("exec node {:?} serve", cli)])
        .stdin(std::process::Stdio::null())
        .spawn()
        .ok()
}

// Keeps an engine running for as long as the app is open: one that was already up may stop
// (another copy quitting, a restart), and then the app starts its own.
fn watch_engine(slot: Arc<Mutex<Option<Child>>>, cli: String) {
    thread::spawn(move || loop {
        // Start ours only when the port is free; never fight another program for it.
        if engine_port() == Port::Free {
            let mut child = slot.lock().unwrap();
            let exited = child.as_mut().and_then(|c| c.try_wait().ok().flatten());
            if exited.and_then(|s| s.code()) == Some(127) { NO_NODE.store(true, Ordering::Relaxed) }
            let ours_alive = child.is_some() && exited.is_none();
            if !ours_alive {
                *child = spawn_engine(&cli);
            }
        }
        thread::sleep(Duration::from_secs(2));
    });
}

// Menu items whose state follows the page: what can be done right now, and the latest tests.
struct MenuHandles {
    new_test: MenuItem<tauri::Wry>,
    rerun: MenuItem<tauri::Wry>,
    stop: MenuItem<tauri::Wry>,
    sidebar: MenuItem<tauri::Wry>,
    recent: Vec<MenuItem<tauri::Wry>>,
}

// The menu bar: every app command lives here, so it can be found without knowing ⌘K.
// Custom items go to the page as a "menu" event with the item's id; the page does the work.
fn build_menu(app: &tauri::AppHandle) -> tauri::Result<(Menu<tauri::Wry>, MenuHandles)> {
    let item = |id: &str, text: &str, accel: Option<&str>| MenuItem::with_id(app, id, text, true, accel);
    let off = |id: &str, text: &str, accel: Option<&str>| MenuItem::with_id(app, id, text, false, accel);
    let sep = || PredefinedMenuItem::separator(app);
    let about = AboutMetadata { comments: Some("Tess tests your app the way a person would, every time it changes.".into()), ..Default::default() };
    let h = MenuHandles {
        new_test: off("new-test", "New Test…", Some("CmdOrCtrl+N"))?,
        rerun: off("rerun", "Run Again", Some("CmdOrCtrl+R"))?,
        stop: off("stop", "Stop", Some("CmdOrCtrl+."))?,
        sidebar: item("toggle-sidebar", "Hide Sidebar", Some("Ctrl+CmdOrCtrl+S"))?,
        recent: (1..=4).map(|i| off(&format!("recent-{i}"), "No test yet", Some(&format!("CmdOrCtrl+{i}")))).collect::<tauri::Result<_>>()?,
    };
    let menu = Menu::with_items(app, &[
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
            &h.new_test,
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
        &Submenu::with_items(app, "Test", true, &[&h.rerun, &h.stop, &sep()?, &item("copy-report", "Copy Report for Claude Code", Some("Shift+CmdOrCtrl+C"))?])?,
        &Submenu::with_items(app, "View", true, &[
            &h.sidebar,
            &sep()?,
            &item("show-checks", "Checks", Some("Alt+CmdOrCtrl+1"))?,
            &item("show-log", "Log", Some("Alt+CmdOrCtrl+2"))?,
            &sep()?,
            &h.recent[0], &h.recent[1], &h.recent[2], &h.recent[3],
            &sep()?,
            &item("commands", "Commands…", Some("CmdOrCtrl+K"))?,
            &sep()?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ])?,
        &Submenu::with_items(app, "Window", true, &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &sep()?,
            // Brings the main window back after it was closed (any menu command shows it).
            &item("main-window", "Ultimate Tester", Some("CmdOrCtrl+0"))?,
        ])?,
        &Submenu::with_items(app, "Help", true, &[
            &item("getting-started", "Getting Started", None)?,
        ])?,
    ])?;
    Ok((menu, h))
}

// The page reports what can be done right now; unavailable commands are greyed out, as on any Mac app.
#[tauri::command]
fn set_menu_state(app: tauri::AppHandle, new_test: bool, rerun: bool, stop: bool, sidebar_shown: bool, sidebar_available: bool, recent: Vec<String>, testing: bool) {
    app.state::<Testing>().0.store(testing, Ordering::Relaxed);
    let Some(h) = app.try_state::<MenuHandles>() else { return };
    let _ = h.new_test.set_enabled(new_test);
    let _ = h.rerun.set_enabled(rerun);
    let _ = h.stop.set_enabled(stop);
    let _ = h.sidebar.set_text(if sidebar_shown { "Hide Sidebar" } else { "Show Sidebar" });
    let _ = h.sidebar.set_enabled(sidebar_available);
    for (i, it) in h.recent.iter().enumerate() {
        match recent.get(i) {
            Some(title) => { let _ = it.set_text(title); let _ = it.set_enabled(true); }
            None => { let _ = it.set_text(if i == 0 { "No test yet" } else { "—" }); let _ = it.set_enabled(false); }
        }
    }
}

// Settings is its own window (⌘,). It is built hidden at launch, so its page is loaded before
// anyone opens it (a window created later sometimes came up blank); closing it only hides it.
fn build_settings(app: &tauri::AppHandle) -> tauri::Result<()> {
    tauri::WebviewWindowBuilder::new(app, "settings", tauri::WebviewUrl::App("index.html?view=setup&window=settings".into()))
        .title("Settings")
        .theme(Some(tauri::Theme::Light))
        .inner_size(820.0, 720.0)
        .min_inner_size(640.0, 480.0)
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .traffic_light_position(tauri::LogicalPosition::new(16.0, 24.0))
        .visible(false)
        .build()
        .map(|_| ())
}

#[tauri::command]
async fn open_settings(app: tauri::AppHandle, app_id: String) -> Result<(), String> {
    if app.get_webview_window("settings").is_none() {
        build_settings(&app).map_err(|e| e.to_string())?;
    }
    let w = app.get_webview_window("settings").ok_or("Settings window missing")?;
    // The Settings page switches to the app the main window is showing.
    let _ = app.emit_to("settings", "settings-app", app_id);
    let _ = w.show();
    let _ = w.set_focus();
    Ok(())
}

// The main window's size and position, kept in logical points so a display with different scaling
// can't grow or shrink it (the window-state plugin did: 1240 → 3600 px across launches).
fn frame_file(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("main-window.txt"))
}

fn save_frame(window: &tauri::Window) {
    let (Ok(size), Ok(pos), Ok(scale)) = (window.inner_size(), window.outer_position(), window.scale_factor()) else { return };
    if window.is_minimized().unwrap_or(false) || window.is_fullscreen().unwrap_or(false) { return; }
    let (size, pos) = (size.to_logical::<f64>(scale), pos.to_logical::<f64>(scale));
    if let Some(f) = frame_file(window.app_handle()) {
        let _ = std::fs::create_dir_all(f.parent().unwrap());
        let _ = std::fs::write(f, format!("{} {} {} {}", size.width, size.height, pos.x, pos.y));
    }
}

fn restore_frame(app: &tauri::AppHandle) {
    let (Some(f), Some(w)) = (frame_file(app), app.get_webview_window("main")) else { return };
    let Ok(text) = std::fs::read_to_string(f) else { return };
    let v: Vec<f64> = text.split_whitespace().filter_map(|n| n.parse().ok()).collect();
    let [width, height, x, y] = v[..] else { return };
    if width < 900.0 || height < 560.0 { return; }
    let _ = w.set_size(tauri::LogicalSize::new(width, height));
    // Only put it back where a display still is; otherwise leave the default position.
    let on_screen = app.available_monitors().unwrap_or_default().iter().any(|m| {
        let (p, s) = (m.position().to_logical::<f64>(m.scale_factor()), m.size().to_logical::<f64>(m.scale_factor()));
        x + 100.0 > p.x && x < p.x + s.width - 100.0 && y >= p.y - 10.0 && y < p.y + s.height - 100.0
    });
    if on_screen { let _ = w.set_position(tauri::LogicalPosition::new(x, y)); }
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
    let watched = slot.clone();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Engine(slot))
        .manage(Testing(AtomicBool::new(false)))
        .manage(Draft(AtomicBool::new(false)))
        .invoke_handler(tauri::generate_handler![open_settings, set_menu_state, engine_status, set_draft])
        .setup(move |app| {
            // The engine shipped inside the app; a dev build without it runs the repo's copy.
            let cli = app.path().resource_dir().ok()
                .map(|d| d.join("engine/bin/ultimate-tester.js"))
                .filter(|p| p.exists())
                .map(|p| p.to_string_lossy().into_owned())
                .or_else(|| option_env!("ULTIMATE_TESTER_CLI").map(String::from))
                .unwrap_or_else(|| format!("{}/../bin/ultimate-tester.js", env!("CARGO_MANIFEST_DIR")));
            watch_engine(watched.clone(), cli);
            let (menu, handles) = build_menu(app.handle())?;
            app.set_menu(menu)?;
            app.manage(handles);
            build_settings(app.handle())?;
            restore_frame(app.handle());
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().0.as_str();
            // Menu commands act on the main window, so bring it back if it was closed
            // (except Settings…, which opens its own window and shouldn't flash the main one forward).
            if id != "settings" { show_main(app); }
            let _ = app.emit_to("main", "menu", id.to_string());
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::Resized(_) | WindowEvent::Moved(_)) && window.label() == "main" {
                save_frame(window);
            }
            // Closing a window hides it: tests keep running, results still arrive, Settings stays loaded.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" || window.label() == "settings" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to start Ultimate Tester")
        .run(|app, event| match event {
            RunEvent::Reopen { .. } => show_main(app),
            // Quitting (⌘Q) mid-test: say what happens rather than quit silently. Tests run on their own,
            // so they finish anyway; only the window and its notifications go away.
            // Quitting (⌘Q) with something to lose asks first, "keep" being the default (Return):
            // an unsaved profile edit would be lost; a running test finishes in the background without a notification.
            RunEvent::ExitRequested { api, code: None, .. }
                if app.state::<Draft>().0.load(Ordering::Relaxed) || app.state::<Testing>().0.load(Ordering::Relaxed) =>
            {
                use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
                api.prevent_exit();
                let handle = app.clone();
                let (title, message, keep) = if app.state::<Draft>().0.load(Ordering::Relaxed) {
                    ("Quit and discard your edit?", "You have unsaved changes to how Tess tests this app. Quitting throws them away.", "Keep Editing")
                } else {
                    ("Quit while Tess is testing?", "Tess is still testing. If you quit, the test finishes in the background and its result is here next time you open Ultimate Tester, but you won't get a notification.", "Keep Open")
                };
                app.dialog()
                    .message(message)
                    .title(title)
                    .buttons(MessageDialogButtons::OkCancelCustom(keep.into(), "Quit".into()))
                    .show(move |stay| if !stay { handle.exit(0) });
            }
            RunEvent::Exit => {
                if let Some(mut child) = app.state::<Engine>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
            _ => {}
        });
}
