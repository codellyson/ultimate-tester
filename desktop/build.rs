fn main() {
    // App commands the engine page may call; each gets an allow-<name> permission for the capability.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&["open_settings", "set_menu_state", "engine_status"])),
    )
    .expect("failed to run tauri build script");
}
