use chrono::Datelike;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::util::to_hex_num;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hue {
    pub red: u8,
    pub green: u8,
    pub blue: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Underglow {
    pub effect: u8,
    pub brightness: u8,
    pub speed: u8,
    pub orientation: u8,
    pub rainbow: u8,
    pub hue: Hue,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Led {
    pub mode: u8,
    pub saturation: u8,
    pub rainbow: u8,
    pub color: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceConfig {
    pub underglow: Underglow,
    pub winlock: u8,
    pub led: Led,
    #[serde(rename = "showImage")]
    pub show_image: u8,
    #[serde(rename = "image1Frames")]
    pub image1_frames: u8,
    #[serde(rename = "image2Frames")]
    pub image2_frames: u8,
    #[serde(rename = "frameDuration")]
    pub frame_duration: u16,
}

pub fn parse_config_buffer(buf: &[u8; 48]) -> DeviceConfig {
    DeviceConfig {
        underglow: Underglow {
            effect: buf[1],
            brightness: buf[2],
            speed: buf[3],
            orientation: buf[4],
            rainbow: buf[5],
            hue: Hue {
                red: buf[6],
                green: buf[7],
                blue: buf[8],
            },
        },
        winlock: buf[21],
        led: Led {
            mode: buf[28],
            saturation: buf[29],
            rainbow: buf[31],
            color: buf[32],
        },
        show_image: buf[33],
        image1_frames: buf[34],
        image2_frames: buf[46],
        frame_duration: u16::from(buf[43]) | (u16::from(buf[44]) << 8),
    }
}

pub fn build_config_buffer(existing: &[u8; 48], changes: &Value) -> Result<[u8; 48], String> {
    let mut buffer = *existing;

    if let Some(ug) = changes.get("underglow").and_then(|v| v.as_object()) {
        if let Some(v) = ug.get("effect").and_then(|v| v.as_u64()) {
            buffer[1] = v as u8;
        }
        if let Some(v) = ug.get("brightness").and_then(|v| v.as_u64()) {
            buffer[2] = v as u8;
        }
        if let Some(v) = ug.get("speed").and_then(|v| v.as_u64()) {
            buffer[3] = v as u8;
        }
        if let Some(v) = ug.get("orientation").and_then(|v| v.as_u64()) {
            buffer[4] = v as u8;
        }
        if let Some(v) = ug.get("rainbow").and_then(|v| v.as_u64()) {
            buffer[5] = v as u8;
        }
        if let Some(hue) = ug.get("hue").and_then(|v| v.as_object()) {
            if let Some(v) = hue.get("red").and_then(|v| v.as_u64()) {
                buffer[6] = v as u8;
            }
            if let Some(v) = hue.get("green").and_then(|v| v.as_u64()) {
                buffer[7] = v as u8;
            }
            if let Some(v) = hue.get("blue").and_then(|v| v.as_u64()) {
                buffer[8] = v as u8;
            }
        }
    }

    if let Some(v) = changes.get("winlock").and_then(|v| v.as_u64()) {
        buffer[21] = v as u8;
    }

    if let Some(led) = changes.get("led").and_then(|v| v.as_object()) {
        if let Some(v) = led.get("mode").and_then(|v| v.as_u64()) {
            buffer[28] = v as u8;
        }
        if let Some(v) = led.get("saturation").and_then(|v| v.as_u64()) {
            buffer[29] = v as u8;
        }
        if let Some(v) = led.get("rainbow").and_then(|v| v.as_u64()) {
            buffer[31] = v as u8;
        }
        if let Some(v) = led.get("color").and_then(|v| v.as_u64()) {
            buffer[32] = v as u8;
        }
    }

    if let Some(v) = changes.get("showImage").and_then(|v| v.as_u64()) {
        buffer[33] = v as u8;
    }
    if let Some(v) = changes.get("image1Frames").and_then(|v| v.as_u64()) {
        buffer[34] = v as u8;
    }
    if let Some(v) = changes.get("image2Frames").and_then(|v| v.as_u64()) {
        buffer[46] = v as u8;
    }

    if changes.get("time").and_then(|v| v.as_bool()) == Some(true) {
        let now = chrono::Local::now();
        buffer[35] = to_hex_num(now.format("%S").to_string().parse().unwrap_or(0))?;
        buffer[36] = to_hex_num(now.format("%M").to_string().parse().unwrap_or(0))?;
        buffer[37] = to_hex_num(now.format("%H").to_string().parse().unwrap_or(0))?;
        buffer[38] = now.weekday().num_days_from_sunday() as u8;
        buffer[39] = to_hex_num(now.format("%d").to_string().parse().unwrap_or(0))?;
        buffer[40] = to_hex_num(now.format("%m").to_string().parse().unwrap_or(0))?;
        buffer[41] = to_hex_num((now.format("%y").to_string().parse::<u8>().unwrap_or(0)) % 100)?;
    }

    if let Some(v) = changes.get("frameDuration").and_then(|v| v.as_u64()) {
        let ms = v.clamp(60, 0xffff) as u16;
        buffer[43] = (ms & 0xff) as u8;
        buffer[44] = (ms >> 8) as u8;
    }

    Ok(buffer)
}
