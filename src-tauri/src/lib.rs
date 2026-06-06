mod gmk87;

use gmk87::cache::default_cache_dir;
use gmk87::config::DeviceConfig;
use gmk87::device::{configure_lighting, get_keyboard_info, read_config, sync_time};
use gmk87::upload::upload_from_paths;
use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, WebviewWindow};

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

#[derive(Serialize, Clone)]
struct UploadFinished {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
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
fn keyboard_upload_image(
    app: AppHandle,
    slot0_file: Option<String>,
    slot1_file: Option<String>,
    frame_duration: Option<u16>,
) -> Result<(), String> {
    let slot0 = slot0_file.map(PathBuf::from);
    let slot1 = slot1_file.map(PathBuf::from);
    let cache = default_cache_dir();

    std::thread::spawn(move || {
        let result = upload_from_paths(
            slot0.as_deref(),
            slot1.as_deref(),
            frame_duration,
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
        );

        let finished = match result {
            Ok(()) => UploadFinished {
                success: true,
                error: None,
            },
            Err(e) => UploadFinished {
                success: false,
                error: Some(e),
            },
        };
        let _ = app.emit("upload:finished", finished);
    });

    Ok(())
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

#[derive(Serialize)]
struct WindowBounds {
    width: f64,
    height: f64,
    center_x: f64,
    center_y: f64,
    chrome_w: f64,
    chrome_h: f64,
}

#[derive(Serialize)]
struct WindowCenter {
    center_x: f64,
    center_y: f64,
}

#[tauri::command]
fn window_get_bounds(window: WebviewWindow) -> Result<WindowBounds, String> {
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let inner = window.inner_size().map_err(|e| e.to_string())?;
    let outer = window.outer_size().map_err(|e| e.to_string())?;
    let pos = window.outer_position().map_err(|e| e.to_string())?;

    Ok(WindowBounds {
        width: inner.width as f64 / scale,
        height: inner.height as f64 / scale,
        center_x: pos.x as f64 / scale + outer.width as f64 / scale / 2.0,
        center_y: pos.y as f64 / scale + outer.height as f64 / scale / 2.0,
        chrome_w: (outer.width as f64 - inner.width as f64) / scale,
        chrome_h: (outer.height as f64 - inner.height as f64) / scale,
    })
}

#[tauri::command]
fn window_get_monitor_center(window: WebviewWindow) -> Result<WindowCenter, String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No monitor found".to_string())?;
    let scale = monitor.scale_factor();
    let size = monitor.size();
    let pos = monitor.position();
    Ok(WindowCenter {
        center_x: pos.x as f64 / scale + size.width as f64 / scale / 2.0,
        center_y: pos.y as f64 / scale + size.height as f64 / scale / 2.0,
    })
}

#[tauri::command]
fn window_set_center_size(
    window: WebviewWindow,
    width: f64,
    height: f64,
    center_x: f64,
    center_y: f64,
    _chrome_w: f64,
    _chrome_h: f64,
) -> Result<(), String> {
    use tauri::{LogicalPosition, LogicalSize, Position, Size};

    window
        .set_size(Size::Logical(LogicalSize::new(width, height)))
        .map_err(|e| e.to_string())?;

    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let outer = window.outer_size().map_err(|e| e.to_string())?;
    let outer_w = outer.width as f64 / scale;
    let outer_h = outer.height as f64 / scale;
    let x = (center_x - outer_w / 2.0).round();
    let y = (center_y - outer_h / 2.0).round();
    window
        .set_position(Position::Logical(LogicalPosition::new(x, y)))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn window_set_inner_size(window: WebviewWindow, width: f64, height: f64) -> Result<(), String> {
    use tauri::{LogicalSize, Size};

    window
        .set_size(Size::Logical(LogicalSize::new(width, height)))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn window_set_min_inner_size(
    window: WebviewWindow,
    width: f64,
    height: f64,
) -> Result<(), String> {
    use tauri::{LogicalSize, Size};

    window
        .set_min_size(Some(Size::Logical(LogicalSize::new(width, height))))
        .map_err(|e| e.to_string())?;
    Ok(())
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
            window_get_bounds,
            window_get_monitor_center,
            window_set_center_size,
            window_set_inner_size,
            window_set_min_inner_size,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
