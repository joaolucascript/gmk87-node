use std::path::{Path, PathBuf};

use serde_json::json;

use super::cache::{
    load_slot_buffers, load_slot_buffers_any, load_slot_source_any, save_slot_buffers,
};
use super::config::build_config_buffer;
use super::constants::{frame_size, MAX_TOTAL_FRAMES};
use super::device::{
    read_config_from_device, read_slot_buffers_from_device, run_upload_session, with_device,
};
use super::image::{
    extract_frames_from_file_with_progress, gif_average_delay_ms, truncate_frame_lists,
};

pub struct UploadOptions {
    pub slot0_file: Option<PathBuf>,
    pub slot1_file: Option<PathBuf>,
    pub frame_duration: Option<u16>,
    pub image_index: u8,
    pub show_after: bool,
    pub slot_cache_dir: PathBuf,
}

fn restore_slot_buffers(
    slot_index: u8,
    frame_count: usize,
    cache_dir: &Path,
    on_progress: &mut dyn FnMut(u8, &str),
) -> Result<Vec<Vec<u8>>, String> {
    if frame_count == 0 {
        return Ok(vec![vec![0u8; frame_size()]]);
    }

    if let Some(cached) = load_slot_buffers(cache_dir, slot_index)
        .or_else(|| load_slot_buffers_any(slot_index))
    {
        if cached.len() == frame_count {
            return Ok(cached);
        }
    }

    if let Some(source) = load_slot_source_any(slot_index) {
        on_progress(12, &format!("Restoring slot {slot_index} from saved file…"));
        let frames = extract_frames_from_file_with_progress(&source, |local, msg| {
            let pct = 12 + ((local as u16 * 6) / 100);
            on_progress(pct.min(18) as u8, msg);
        })?;
        if frames.len() == frame_count {
            save_slot_buffers(cache_dir, slot_index, &frames, Some(&source))?;
            return Ok(frames);
        }
    }

    on_progress(12, &format!("Reading slot {slot_index} from device…"));
    let start_byte = 0u32;

    let buffers = with_device(|device| {
        read_slot_buffers_from_device(device, start_byte, frame_count, |pct, status| {
            let overall = 12 + ((pct as u16 * 8) / 100);
            on_progress(overall.min(20) as u8, status);
        })
    })?;

    save_slot_buffers(cache_dir, slot_index, &buffers, None)?;
    Ok(buffers)
}

const DECODE_PROGRESS_MIN: u8 = 1;
const DECODE_PROGRESS_MAX: u8 = 10;

fn decode_progress_range(decode_index: usize, decode_count: usize) -> (u16, u16) {
    let span = (DECODE_PROGRESS_MAX - DECODE_PROGRESS_MIN) as u16;
    let count = decode_count.max(1) as u16;
    let start = DECODE_PROGRESS_MIN as u16 + (decode_index as u16 * span) / count;
    let end = if decode_index + 1 >= decode_count {
        DECODE_PROGRESS_MAX as u16
    } else {
        DECODE_PROGRESS_MIN as u16 + ((decode_index + 1) as u16 * span) / count
    };
    (start, end.max(start + 1))
}

fn map_decode_progress<F>(
    decode_index: usize,
    decode_count: usize,
    local_pct: u8,
    msg: &str,
    on_progress: &mut F,
) where
    F: FnMut(u8, &str),
{
    let (start, end) = decode_progress_range(decode_index, decode_count);
    let range = end - start;
    let pct = start + ((local_pct as u16 * range) / 100);
    on_progress(pct.min(end) as u8, msg);
}

pub fn upload_images<F>(options: UploadOptions, mut on_progress: F) -> Result<(), String>
where
    F: FnMut(u8, &str),
{
    on_progress(0, "Processing images…");

    let decode_count = usize::from(options.slot0_file.is_some())
        + usize::from(options.slot1_file.is_some());
    let decode_count = decode_count.max(1);

    let mut frames0 = options
        .slot0_file
        .as_ref()
        .map(|p| {
            extract_frames_from_file_with_progress(p, |local, msg| {
                map_decode_progress(0, decode_count, local, &msg, &mut on_progress);
            })
        })
        .transpose()?;
    let mut frames1 = options
        .slot1_file
        .as_ref()
        .map(|p| {
            let decode_index = usize::from(options.slot0_file.is_some());
            extract_frames_from_file_with_progress(p, |local, msg| {
                map_decode_progress(decode_index, decode_count, local, &msg, &mut on_progress);
            })
        })
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

    on_progress(12, "Preparing image data…");

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

    let mut slot0_buffers = frames0.unwrap_or_default();
    let mut slot1_buffers = frames1.unwrap_or_default();
    let paths0 = options.slot0_file.is_some();
    let paths1 = options.slot1_file.is_some();
    let cache_dir = &options.slot_cache_dir;

    let current = with_device(read_config_from_device)?;
    let device_frames0 = current[34] as usize;
    let device_frames1 = current[46] as usize;

    if !paths0 && slot0_buffers.is_empty() && device_frames0 > 0 {
        slot0_buffers = restore_slot_buffers(0, device_frames0, cache_dir, &mut on_progress)?;
    }
    if !paths1 && slot1_buffers.is_empty() && device_frames1 > 0 {
        let start_byte = (slot0_buffers.len() * frame_size()) as u32;
        on_progress(12, "Reading slot 1 from device…");
        slot1_buffers = with_device(|device| {
            read_slot_buffers_from_device(device, start_byte, device_frames1, |pct, status| {
                let overall = 12 + ((pct as u16 * 8) / 100);
                on_progress(overall.min(20) as u8, status);
            })
        })?;
        save_slot_buffers(cache_dir, 1, &slot1_buffers, None)?;
    }

    if slot0_buffers.is_empty() {
        if device_frames0 == 0 {
            slot0_buffers.push(vec![0u8; frame_size()]);
        } else {
            return Err(
                "Could not preserve slot 0. Select the same GIF/image for slot 0, or upload both slots together once.".into(),
            );
        }
    }
    if slot1_buffers.is_empty() {
        if device_frames1 == 0 {
            slot1_buffers.push(vec![0u8; frame_size()]);
        } else {
            return Err(
                "Could not preserve slot 1. Select a file for slot 1, or upload both slots together once.".into(),
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
        save_slot_buffers(
            cache_dir,
            0,
            &slot0_buffers,
            options.slot0_file.as_deref(),
        )?;
    }
    if paths1 {
        save_slot_buffers(
            cache_dir,
            1,
            &slot1_buffers,
            options.slot1_file.as_deref(),
        )?;
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
