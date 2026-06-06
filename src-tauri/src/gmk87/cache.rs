use std::fs;
use std::path::{Path, PathBuf};

use super::constants::frame_size;

pub fn load_slot_buffers(cache_dir: &Path, slot_index: u8) -> Option<Vec<Vec<u8>>> {
    let meta_file = cache_dir.join("meta.json");
    let bin_file = cache_dir.join(format!("slot{slot_index}.bin"));
    if !meta_file.exists() || !bin_file.exists() {
        return None;
    }

    let meta: serde_json::Value = serde_json::from_str(&fs::read_to_string(&meta_file).ok()?).ok()?;
    let frame_count = meta[format!("slot{slot_index}")]["frames"].as_u64()? as usize;
    let frame_size = frame_size();
    let data = fs::read(&bin_file).ok()?;
    if data.len() != frame_count * frame_size {
        return None;
    }

    let mut buffers = Vec::with_capacity(frame_count);
    for i in 0..frame_count {
        buffers.push(data[i * frame_size..(i + 1) * frame_size].to_vec());
    }
    Some(buffers)
}

pub fn load_slot_source(cache_dir: &Path, slot_index: u8) -> Option<PathBuf> {
    let meta_file = cache_dir.join("meta.json");
    if !meta_file.exists() {
        return None;
    }
    let meta: serde_json::Value = serde_json::from_str(&fs::read_to_string(&meta_file).ok()?).ok()?;
    meta[format!("slot{slot_index}")]
        .get("source")
        .and_then(|v| v.as_str())
        .filter(|p| Path::new(p).is_file())
        .map(PathBuf::from)
}

pub fn load_slot_buffers_any(slot_index: u8) -> Option<Vec<Vec<u8>>> {
    for dir in cache_dirs() {
        if let Some(buffers) = load_slot_buffers(&dir, slot_index) {
            return Some(buffers);
        }
    }
    None
}

pub fn load_slot_source_any(slot_index: u8) -> Option<PathBuf> {
    for dir in cache_dirs() {
        if let Some(path) = load_slot_source(&dir, slot_index) {
            return Some(path);
        }
    }
    None
}

pub fn save_slot_buffers(
    cache_dir: &Path,
    slot_index: u8,
    buffers: &[Vec<u8>],
    source: Option<&Path>,
) -> Result<(), String> {
    fs::create_dir_all(cache_dir).map_err(|e| e.to_string())?;
    let meta_file = cache_dir.join("meta.json");

    let mut meta: serde_json::Value = if meta_file.exists() {
        serde_json::from_str(&fs::read_to_string(&meta_file).map_err(|e| e.to_string())?)
            .unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let mut slot_meta = serde_json::json!({ "frames": buffers.len() });
    if let Some(src) = source {
        slot_meta["source"] = serde_json::json!(src.to_string_lossy());
    } else if let Some(existing) = meta.get(format!("slot{slot_index}")).and_then(|v| v.get("source")) {
        slot_meta["source"] = existing.clone();
    }

    meta[format!("slot{slot_index}")] = slot_meta;

    let combined: Vec<u8> = buffers.iter().flat_map(|b| b.iter().copied()).collect();
    fs::write(cache_dir.join(format!("slot{slot_index}.bin")), combined).map_err(|e| e.to_string())?;
    fs::write(&meta_file, meta.to_string()).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn default_cache_dir() -> PathBuf {
    cache_dirs()
        .into_iter()
        .next()
        .unwrap_or_else(|| PathBuf::from(".gmk87/slot-cache"))
}

pub fn cache_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let mut seen = std::collections::HashSet::new();

    let mut push = |path: PathBuf| {
        if seen.insert(path.clone()) {
            dirs.push(path);
        }
    };

    if let Some(proj) = directories::ProjectDirs::from("com.codedgar", "Codedgar", "gmk87-configurator") {
        push(proj.data_dir().join("slot-cache"));
    }

    push(PathBuf::from(".gmk87/slot-cache"));

    if let Ok(appdata) = std::env::var("APPDATA") {
        let base = PathBuf::from(appdata);
        push(base.join("Codedgar").join("gmk87-configurator").join("slot-cache"));
        push(base.join("GMK87 Configurator").join("slot-cache"));
        push(base.join("gmk87-node").join("slot-cache"));
        push(base.join("gmk87-hid-uploader").join("slot-cache"));
    }

    if let Some(home) = directories::UserDirs::new().map(|u| u.home_dir().to_path_buf()) {
        push(home.join(".gmk87").join("slot-cache"));
    }

    dirs
}
