use std::path::{Path, PathBuf};

use serde_json::json;

use super::cache::{load_slot_buffers, save_slot_buffers};
use super::config::build_config_buffer;
use super::constants::{frame_size, MAX_TOTAL_FRAMES};
use super::device::{read_config_from_device, run_upload_session, with_device};
use super::image::{extract_frames_from_file, gif_average_delay_ms, truncate_frame_lists};

pub struct UploadOptions {
    pub slot0_file: Option<PathBuf>,
    pub slot1_file: Option<PathBuf>,
    pub frame_duration: Option<u16>,
    pub image_index: u8,
    pub show_after: bool,
    pub slot_cache_dir: PathBuf,
}

pub fn upload_images<F>(options: UploadOptions, mut on_progress: F) -> Result<(), String>
where
    F: FnMut(u8, &str),
{
    let mut frames0 = options
        .slot0_file
        .as_ref()
        .map(|p| extract_frames_from_file(p))
        .transpose()?;
    let mut frames1 = options
        .slot1_file
        .as_ref()
        .map(|p| extract_frames_from_file(p))
        .transpose()?;

    let mut preserved0 = 1usize;
    let mut preserved1 = 1usize;
    if frames0.is_none() || frames1.is_none() {
        if let Ok(cfg) = with_device(read_config_from_device) {
            preserved0 = cfg[34] as usize;
            preserved1 = cfg[46] as usize;
        }
    }

    (frames0, frames1) = truncate_frame_lists(frames0, frames1, preserved0, preserved1);

    on_progress(0, "Processing images...");

    let mut frame_duration = options.frame_duration;
    if frame_duration.is_none() {
        let total = frames0.as_ref().map(|f| f.len()).unwrap_or(0)
            + frames1.as_ref().map(|f| f.len()).unwrap_or(0);
        if total > 2 {
            let gif_path = options
                .slot0_file
                .as_ref()
                .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("gif"))
                .or_else(|| {
                    options
                        .slot1_file
                        .as_ref()
                        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("gif"))
                });
            frame_duration = gif_path.and_then(|p| gif_average_delay_ms(p)).or(Some(100));
        }
    }

    on_progress(12, "Preparing image data...");

    let mut slot0_buffers = frames0.unwrap_or_default();
    let mut slot1_buffers = frames1.unwrap_or_default();
    let paths0 = options.slot0_file.is_some();
    let paths1 = options.slot1_file.is_some();

    if !paths0 && slot0_buffers.is_empty() {
        if let Some(cached) = load_slot_buffers(&options.slot_cache_dir, 0) {
            slot0_buffers = cached;
        }
    }
    if !paths1 && slot1_buffers.is_empty() {
        if let Some(cached) = load_slot_buffers(&options.slot_cache_dir, 1) {
            slot1_buffers = cached;
        }
    }

    let current = with_device(read_config_from_device)?;

    if slot0_buffers.is_empty() {
        if current[34] == 0 {
            slot0_buffers.push(vec![0u8; frame_size()]);
        } else {
            return Err(
                "Cannot update the other slot without slot 0 data. Select a file for slot 0 or upload it once before updating slot 1.".into(),
            );
        }
    }
    if slot1_buffers.is_empty() {
        if current[46] == 0 {
            slot1_buffers.push(vec![0u8; frame_size()]);
        } else {
            return Err(
                "Cannot update the other slot without slot 1 data. Select a file for slot 1 or upload it once before updating slot 0.".into(),
            );
        }
    }

    if slot0_buffers.len() + slot1_buffers.len() > MAX_TOTAL_FRAMES {
        return Err(format!(
            "Too many frames: {} (max {MAX_TOTAL_FRAMES})",
            slot0_buffers.len() + slot1_buffers.len()
        ));
    }

    let shown_image = if options.show_after {
        options.image_index + 1
    } else {
        0
    };

    let mut changes = json!({
        "showImage": shown_image,
        "image1Frames": slot0_buffers.len(),
        "image2Frames": slot1_buffers.len(),
        "time": true,
    });
    if let Some(ms) = frame_duration {
        changes["frameDuration"] = json!(ms);
    }

    let new_config = build_config_buffer(&current, &changes)?;
    let upload_data: Vec<u8> = slot0_buffers
        .iter()
        .chain(slot1_buffers.iter())
        .flat_map(|b| b.iter().copied())
        .collect();

    run_upload_session(new_config, &upload_data, |device_pct, status| {
        let pct = 20 + ((device_pct as u16 * 80) / 100);
        on_progress(pct.min(100) as u8, status);
    })?;

    on_progress(100, "Upload complete");

    if paths0 {
        save_slot_buffers(&options.slot_cache_dir, 0, &slot0_buffers)?;
    }
    if paths1 {
        save_slot_buffers(&options.slot_cache_dir, 1, &slot1_buffers)?;
    }

    Ok(())
}

pub fn upload_from_paths(
    slot0: Option<&Path>,
    slot1: Option<&Path>,
    frame_duration: Option<u16>,
    cache_dir: &Path,
    on_progress: impl FnMut(u8, &str),
) -> Result<(), String> {
    let image_index = if slot0.is_some() { 0 } else { 1 };
    upload_images(
        UploadOptions {
            slot0_file: slot0.map(PathBuf::from),
            slot1_file: slot1.map(PathBuf::from),
            frame_duration,
            image_index,
            show_after: true,
            slot_cache_dir: cache_dir.to_path_buf(),
        },
        on_progress,
    )
}
