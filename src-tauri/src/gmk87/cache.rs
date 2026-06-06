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

pub fn save_slot_buffers(cache_dir: &Path, slot_index: u8, buffers: &[Vec<u8>]) -> Result<(), String> {
    fs::create_dir_all(cache_dir).map_err(|e| e.to_string())?;
    let meta_file = cache_dir.join("meta.json");

    let mut meta: serde_json::Value = if meta_file.exists() {
        serde_json::from_str(&fs::read_to_string(&meta_file).map_err(|e| e.to_string())?)
            .unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    meta[format!("slot{slot_index}")] = serde_json::json!({ "frames": buffers.len() });

    let combined: Vec<u8> = buffers.iter().flat_map(|b| b.iter().copied()).collect();
    fs::write(cache_dir.join(format!("slot{slot_index}.bin")), combined).map_err(|e| e.to_string())?;
    fs::write(&meta_file, meta.to_string()).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn default_cache_dir() -> PathBuf {
    directories::ProjectDirs::from("com.codedgar", "Codedgar", "gmk87-configurator")
        .map(|d| d.data_dir().join("slot-cache"))
        .unwrap_or_else(|| PathBuf::from(".gmk87/slot-cache"))
}
