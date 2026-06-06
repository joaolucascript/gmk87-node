use hidapi::{DeviceInfo, HidApi, HidDevice};
use std::thread;
use std::time::Duration;

use super::config::{build_config_buffer, parse_config_buffer, DeviceConfig};
use super::constants::{frame_size, PRODUCT_ID, REPORT_ID, VENDOR_ID};
use super::util::checksum;
use serde_json::Value;

pub struct DeviceInfoDto {
    pub manufacturer: String,
    pub product: String,
    pub vendor_id: u16,
    pub product_id: u16,
    pub interface: i32,
    pub usage_page: u16,
}

pub fn find_device_info(api: &HidApi) -> Result<DeviceInfoDto, String> {
    let matching: Vec<&DeviceInfo> = api
        .device_list()
        .filter(|d| d.vendor_id() == VENDOR_ID && d.product_id() == PRODUCT_ID)
        .collect();

    if matching.is_empty() {
        return Err("GMK87 device not found (VID: 0x320f, PID: 0x5055)".into());
    }

    let info = matching
        .iter()
        .find(|d| d.interface_number() == 3)
        .or_else(|| matching.iter().find(|d| d.usage_page() == 0xff1c))
        .or_else(|| {
            matching.iter().find(|d| {
                d.usage_page() != 0x01 && d.usage_page() != 0x0001
            })
        })
        .or_else(|| matching.first())
        .ok_or_else(|| "GMK87 device not found".to_string())?;

    Ok(DeviceInfoDto {
        manufacturer: info
            .manufacturer_string()
            .unwrap_or("Unknown")
            .to_string(),
        product: info.product_string().unwrap_or("GMK87").to_string(),
        vendor_id: VENDOR_ID,
        product_id: PRODUCT_ID,
        interface: info.interface_number(),
        usage_page: info.usage_page(),
    })
}

pub fn open_device(api: &HidApi) -> Result<HidDevice, String> {
    let matching: Vec<&DeviceInfo> = api
        .device_list()
        .filter(|d| d.vendor_id() == VENDOR_ID && d.product_id() == PRODUCT_ID)
        .collect();

    let info = matching
        .iter()
        .find(|d| d.interface_number() == 3)
        .or_else(|| matching.iter().find(|d| d.usage_page() == 0xff1c))
        .or_else(|| {
            matching.iter().find(|d| {
                d.usage_page() != 0x01 && d.usage_page() != 0x0001
            })
        })
        .or_else(|| matching.first())
        .ok_or_else(|| "GMK87 device not found (VID: 0x320f, PID: 0x5055)".to_string())?;

    for attempt in 0..=2 {
        match info.open_device(api) {
            Ok(dev) => return Ok(dev),
            Err(e) => {
                if attempt == 2 {
                    return Err(format!("Failed to open HID device: {e}"));
                }
                thread::sleep(Duration::from_millis(10));
            }
        }
    }
    unreachable!()
}

fn drain_device(device: &HidDevice, timeout_ms: u64) {
    let start = std::time::Instant::now();
    let mut buf = [0u8; 64];
    while start.elapsed().as_millis() < timeout_ms as u128 {
        match device.read_timeout(&mut buf, 50) {
            Ok(0) | Err(_) => break,
            Ok(_) => {}
        }
    }
}

fn read_response(device: &HidDevice, timeout_ms: i32) -> Option<Vec<u8>> {
    let mut buf = [0u8; 64];
    match device.read_timeout(&mut buf, timeout_ms) {
        Ok(n) if n > 0 => Some(buf[..n].to_vec()),
        _ => None,
    }
}

pub fn send_with_position(
    device: &HidDevice,
    command_id: u8,
    data: &[u8],
    pos: u32,
) -> Result<Option<Vec<u8>>, String> {
    if !(1..=0xff).contains(&command_id) {
        return Err("Command ID must be between 1 and 255".into());
    }
    if data.len() > 56 {
        return Err("Data payload cannot exceed 56 bytes".into());
    }

    if command_id == 2 {
        thread::sleep(Duration::from_millis(100));
    }

    let mut buffer = [0u8; 64];
    buffer[0] = REPORT_ID;
    buffer[3] = command_id;
    buffer[4] = data.len() as u8;
    buffer[5] = (pos & 0xff) as u8;
    buffer[6] = ((pos >> 8) & 0xff) as u8;
    buffer[7] = ((pos >> 16) & 0xff) as u8;
    buffer[8..8 + data.len()].copy_from_slice(data);

    let chk = checksum(&buffer);
    buffer[1] = (chk & 0xff) as u8;
    buffer[2] = (chk >> 8) as u8;

    device
        .write(&buffer)
        .map_err(|e| format!("HID write failed: {e}"))?;

    let start = std::time::Instant::now();
    while start.elapsed().as_secs() < 30 {
        if let Some(response) = read_response(device, 5000) {
            if response.len() > 3 && response[3] == buffer[3] {
                return Ok(Some(response[4..].to_vec()));
            }
        } else {
            thread::sleep(Duration::from_millis(5));
        }
    }

    Ok(None)
}

fn send_with_position_required(
    device: &HidDevice,
    command_id: u8,
    data: &[u8],
    pos: u32,
    step_name: &str,
) -> Result<Vec<u8>, String> {
    for attempt in 0..3 {
        if attempt > 0 {
            drain_device(device, 200);
            thread::sleep(Duration::from_millis(250 * attempt as u64));
        }
        if let Ok(Some(response)) = send_with_position(device, command_id, data, pos) {
            return Ok(response);
        }
    }
    Err(format!(
        "Upload failed: keyboard did not respond to {step_name}. Check USB connection and try again."
    ))
}

pub fn read_config_from_device(device: &HidDevice) -> Result<[u8; 48], String> {
    send_with_position(device, 0x01, &[], 0)?;

    for i in 0..9 {
        send_with_position(device, 0x03, &[0; 4], (i * 4) as u32)?;
    }
    send_with_position(device, 0x03, &[0], 36)?;
    send_with_position(device, 0x02, &[], 0)?;

    let mut config_buffer = [0u8; 48];
    for i in 0..12 {
        let position = i * 4;
        if let Ok(Some(chunk)) = send_with_position(device, 0x05, &[0; 4], position as u32) {
            let len = chunk.len().min(4);
            config_buffer[position..position + len].copy_from_slice(&chunk[..len]);
        }
    }

    Ok(config_buffer)
}

pub fn write_config_to_device(device: &HidDevice, config_buffer: &[u8; 48]) -> Result<(), String> {
    send_with_position(device, 0x01, &[], 0)?;
    send_with_position(device, 0x06, config_buffer, 0)?;
    send_with_position(device, 0x02, &[], 0)?;
    Ok(())
}

fn start_upload_session(device: &HidDevice) -> Result<(), String> {
    drain_device(device, 300);
    if send_with_position(device, 0x23, &[], 0)?.is_none() {
        let start = std::time::Instant::now();
        while start.elapsed().as_secs() < 5 {
            if let Some(resp) = read_response(device, 500) {
                if resp.len() >= 4 && resp[3] == 0x23 {
                    break;
                }
            }
            thread::sleep(Duration::from_millis(10));
        }
    }
    send_with_position_required(device, 0x01, &[], 0, "INIT after READY")?;
    Ok(())
}

pub fn send_frame_data<F>(
    device: &HidDevice,
    data: &[u8],
    start_position: u32,
    mut on_progress: F,
) -> Result<(), String>
where
    F: FnMut(u8, &str),
{
    let total = data.len();
    let mut pos = 0usize;
    let mut last_progress = -1i32;

    while pos < total {
        let size = (56).min(total - pos);
        let chunk = &data[pos..pos + size];
        send_with_position_required(
            device,
            0x21,
            chunk,
            start_position + pos as u32,
            &format!("data at {}", start_position + pos as u32),
        )?;
        pos += size;

        let progress = ((pos as f64 / total as f64) * 100.0) as i32;
        if progress > last_progress {
            last_progress = progress;
            on_progress(progress as u8, "Uploading to device…");
        }
    }
    Ok(())
}

/// Read encoded frame bytes already stored on the keyboard (used to preserve a slot
/// when uploading only the other one and no local cache exists).
pub fn read_image_data_from_device<F>(
    device: &HidDevice,
    start_byte: u32,
    total_bytes: usize,
    mut on_progress: F,
) -> Result<Vec<u8>, String>
where
    F: FnMut(u8, &str),
{
    if total_bytes == 0 {
        return Ok(Vec::new());
    }

    drain_device(device, 300);
    send_with_position_required(device, 0x01, &[], 0, "INIT (read)")?;

    let mut data = vec![0u8; total_bytes];
    let mut pos = 0usize;
    let mut last_progress = -1i32;

    while pos < total_bytes {
        let chunk_len = 56.min(total_bytes - pos);
        let response = send_with_position_required(
            device,
            0x22,
            &[0; 4],
            start_byte + pos as u32,
            &format!("read at {}", start_byte + pos as u32),
        )?;

        if response.is_empty() {
            return Err("Device returned empty data while reading image slot".into());
        }

        let copy_len = chunk_len.min(response.len());
        data[pos..pos + copy_len].copy_from_slice(&response[..copy_len]);
        pos += chunk_len;

        let progress = ((pos as f64 / total_bytes as f64) * 100.0) as i32;
        if progress > last_progress {
            last_progress = progress;
            on_progress(progress as u8, "Reading from device...");
        }
    }

    Ok(data)
}

pub fn read_slot_buffers_from_device<F>(
    device: &HidDevice,
    start_byte: u32,
    frame_count: usize,
    mut on_progress: F,
) -> Result<Vec<Vec<u8>>, String>
where
    F: FnMut(u8, &str),
{
    let fs = frame_size();
    let total = frame_count * fs;
    let raw = read_image_data_from_device(device, start_byte, total, &mut on_progress)?;

    let mut buffers = Vec::with_capacity(frame_count);
    for i in 0..frame_count {
        let start = i * fs;
        buffers.push(raw[start..start + fs].to_vec());
    }
    Ok(buffers)
}

pub fn read_config() -> Result<DeviceConfig, String> {
    let api = HidApi::new().map_err(|e| e.to_string())?;
    let device = open_device(&api)?;
    let raw = read_config_from_device(&device)?;
    Ok(parse_config_buffer(&raw))
}

pub fn configure_lighting(changes: Value) -> Result<(), String> {
    let api = HidApi::new().map_err(|e| e.to_string())?;
    let device = open_device(&api)?;
    let current = read_config_from_device(&device)?;
    let new_config = build_config_buffer(&current, &changes)?;
    write_config_to_device(&device, &new_config)
}

pub fn sync_time() -> Result<(), String> {
    configure_lighting(serde_json::json!({ "time": true }))
}

pub fn get_keyboard_info() -> Result<DeviceInfoDto, String> {
    let api = HidApi::new().map_err(|e| e.to_string())?;
    find_device_info(&api)
}

pub fn with_device<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce(&HidDevice) -> Result<T, String>,
{
    let api = HidApi::new().map_err(|e| e.to_string())?;
    let device = open_device(&api)?;
    f(&device)
}

pub fn run_upload_session<P>(
    new_config: [u8; 48],
    upload_data: &[u8],
    mut on_progress: P,
) -> Result<(), String>
where
    P: FnMut(u8, &str),
{
    with_device(|device| {
        drain_device(device, 500);
        send_with_position_required(device, 0x01, &[], 0, "INIT (1)")?;
        send_with_position_required(device, 0x01, &[], 0, "INIT (2)")?;
        send_with_position_required(device, 0x06, &new_config, 0, "CONFIG")?;
        send_with_position_required(device, 0x02, &[], 0, "COMMIT")?;
        start_upload_session(device)?;
        send_frame_data(device, upload_data, 0, |pct, _| {
            on_progress(pct, "Uploading to device…");
        })?;
        send_with_position_required(device, 0x02, &[], 0, "upload COMMIT")?;
        Ok(())
    })
}
