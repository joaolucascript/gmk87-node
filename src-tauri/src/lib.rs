mod gmk87;

use gmk87::cache::default_cache_dir;
use gmk87::config::DeviceConfig;
use gmk87::device::{configure_lighting, get_keyboard_info, read_config, sync_time};
use gmk87::upload::upload_from_paths;
use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

#[derive(Serialize)]
struct DeviceInfoResponse {
    manufacturer: String,
    product: String,
    #[serde(rename = "vendorId")]
    vendor_id: u16,
    #[serde(rename = "productId")]
    product_id: u16,
    interface: i32,
    #[serde(rename = "usagePage")]
    usage_page: u16,
}

#[derive(Serialize, Clone)]
struct UploadProgress {
    percent: u8,
    status: String,
}

#[derive(serde::Deserialize)]
struct UploadImageArgs {
    #[serde(rename = "slot0File", default)]
    slot0_file: Option<String>,
    #[serde(rename = "slot1File", default)]
    slot1_file: Option<String>,
    #[serde(rename = "frameDuration", default)]
    frame_duration: Option<u16>,
}

#[tauri::command]
fn keyboard_get_info() -> Result<DeviceInfoResponse, String> {
    let info = get_keyboard_info()?;
    Ok(DeviceInfoResponse {
        manufacturer: info.manufacturer,
        product: info.product,
        vendor_id: info.vendor_id,
        product_id: info.product_id,
        interface: info.interface,
        usage_page: info.usage_page,
    })
}

#[tauri::command]
fn keyboard_read_config() -> Result<DeviceConfig, String> {
    read_config()
}

#[tauri::command]
fn keyboard_upload_image(app: AppHandle, args: UploadImageArgs) -> Result<(), String> {
    let slot0 = args.slot0_file.as_ref().map(PathBuf::from);
    let slot1 = args.slot1_file.as_ref().map(PathBuf::from);
    let cache = default_cache_dir();

    upload_from_paths(
        slot0.as_deref(),
        slot1.as_deref(),
        args.frame_duration,
        &cache,
        |percent, status| {
            let _ = app.emit(
                "upload:progress",
                UploadProgress {
                    percent,
                    status: status.to_string(),
                },
            );
        },
    )
}

#[tauri::command]
fn keyboard_set_lighting(changes: Value) -> Result<(), String> {
    configure_lighting(changes)
}

#[tauri::command]
fn keyboard_apply_preset(preset_name: String) -> Result<(), String> {
    let presets_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("presets.json");
    let data: Value =
        serde_json::from_str(&std::fs::read_to_string(&presets_path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    let preset = data["presets"][&preset_name]
        .as_object()
        .ok_or_else(|| format!("Preset \"{preset_name}\" not found"))?;
    let config = preset
        .get("config")
        .cloned()
        .ok_or_else(|| format!("Preset \"{preset_name}\" has no config"))?;
    configure_lighting(config)
}

#[tauri::command]
fn keyboard_get_presets() -> Result<Value, String> {
    let presets_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("presets.json");
    let data: Value =
        serde_json::from_str(&std::fs::read_to_string(&presets_path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    Ok(data["presets"].clone())
}

#[tauri::command]
fn keyboard_show_slot(slot: u8) -> Result<(), String> {
    configure_lighting(serde_json::json!({ "showImage": slot }))
}

#[tauri::command]
fn keyboard_sync_time() -> Result<(), String> {
    sync_time()
}

#[tauri::command]
fn app_get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            keyboard_get_info,
            keyboard_read_config,
            keyboard_upload_image,
            keyboard_set_lighting,
            keyboard_apply_preset,
            keyboard_get_presets,
            keyboard_show_slot,
            keyboard_sync_time,
            app_get_version,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
