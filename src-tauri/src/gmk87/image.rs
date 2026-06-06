use std::path::Path;

use image::codecs::gif::GifDecoder;
use image::imageops::FilterType;
use image::{AnimationDecoder, DynamicImage, ImageReader, RgbaImage};
use std::fs::File;
use std::io::BufReader;

use super::constants::{DISPLAY_HEIGHT, DISPLAY_WIDTH, MAX_TOTAL_FRAMES, frame_size};
use super::util::to_rgb565;

pub fn build_raw_image_data(img: &DynamicImage) -> Vec<u8> {
    let resized = if img.width() != DISPLAY_WIDTH || img.height() != DISPLAY_HEIGHT {
        img.resize_exact(DISPLAY_WIDTH, DISPLAY_HEIGHT, FilterType::Lanczos3)
    } else {
        img.clone()
    };

    let size = frame_size();
    let mut frame_buffer = vec![0u8; size];
    let rgba = resized.to_rgba8();
    let mut idx = 0;

    for pixel in rgba.pixels() {
        let rgb565 = to_rgb565(pixel[0], pixel[1], pixel[2]);
        frame_buffer[idx] = (rgb565 >> 8) as u8;
        frame_buffer[idx + 1] = (rgb565 & 0xff) as u8;
        idx += 2;
    }

    frame_buffer
}

fn resize_rgba(frame: RgbaImage) -> DynamicImage {
    DynamicImage::ImageRgba8(frame).resize_exact(DISPLAY_WIDTH, DISPLAY_HEIGHT, FilterType::Lanczos3)
}

pub fn extract_frames_from_file_with_progress(
    path: &Path,
    mut on_progress: impl FnMut(u8, &str),
) -> Result<Vec<Vec<u8>>, String> {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("image");

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if ext == "gif" {
        on_progress(0, &format!("Decoding {name}…"));
        let file = File::open(path).map_err(|e| e.to_string())?;
        let decoder = GifDecoder::new(BufReader::new(file)).map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for (i, frame) in decoder.into_frames().enumerate() {
            let frame = frame.map_err(|e| e.to_string())?;
            let rgba = frame.into_buffer();
            let img = resize_rgba(rgba);
            out.push(build_raw_image_data(&img));
            let pct = (((i + 1) as u16 * 100) / MAX_TOTAL_FRAMES as u16).min(99) as u8;
            on_progress(pct, &format!("Decoding {name}… frame {}", i + 1));
        }
        if out.is_empty() {
            return Err("GIF contains no frames".into());
        }
        return Ok(out);
    }

    on_progress(0, &format!("Processing {name}…"));
    let img = ImageReader::open(path)
        .map_err(|e| e.to_string())?
        .decode()
        .map_err(|e| format!("Failed to open image: {e}"))?;
    Ok(vec![build_raw_image_data(&img)])
}

pub fn gif_average_delay_ms(path: &Path) -> Option<u16> {
    let file = File::open(path).ok()?;
    let mut reader = gif::DecodeOptions::new()
        .read_info(BufReader::new(file))
        .ok()?;
    let mut total_cs = 0u32;
    let mut count = 0u32;
    while let Ok(Some(frame)) = reader.read_next_frame() {
        total_cs += frame.delay as u32;
        count += 1;
    }
    if count == 0 {
        return None;
    }
    Some((((total_cs / count) * 10) as u16).max(60))
}

pub fn truncate_frame_lists(
    mut frames0: Option<Vec<Vec<u8>>>,
    mut frames1: Option<Vec<Vec<u8>>>,
    preserved0: usize,
    preserved1: usize,
) -> (Option<Vec<Vec<u8>>>, Option<Vec<Vec<u8>>>) {
    let n0 = frames0.as_ref().map(|f| f.len()).unwrap_or(0);
    let n1 = frames1.as_ref().map(|f| f.len()).unwrap_or(0);
    let count0 = if frames0.is_some() { n0 } else { preserved0 };
    let count1 = if frames1.is_some() { n1 } else { preserved1 };

    if count0 + count1 <= MAX_TOTAL_FRAMES {
        return (frames0, frames1);
    }

    let (target0, target1) = if frames0.is_some() && frames1.is_none() {
        (MAX_TOTAL_FRAMES - preserved1, preserved1)
    } else if frames1.is_some() && frames0.is_none() {
        (preserved0, MAX_TOTAL_FRAMES - preserved0)
    } else {
        let mut t0 = ((n0 * MAX_TOTAL_FRAMES) / (n0 + n1)).max(1);
        let mut t1 = MAX_TOTAL_FRAMES - t0;
        if t1 < 1 {
            t1 = 1;
            t0 = MAX_TOTAL_FRAMES - 1;
        }
        (t0, t1)
    };

    if let Some(ref f0) = frames0 {
        if f0.len() > target0 {
            frames0 = Some(f0[..target0].to_vec());
        }
    }
    if let Some(ref f1) = frames1 {
        if f1.len() > target1 {
            frames1 = Some(f1[..target1].to_vec());
        }
    }

    (frames0, frames1)
}
