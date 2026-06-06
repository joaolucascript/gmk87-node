pub const VENDOR_ID: u16 = 0x320f;
pub const PRODUCT_ID: u16 = 0x5055;
pub const REPORT_ID: u8 = 0x04;
pub const DISPLAY_WIDTH: u32 = 240;
pub const DISPLAY_HEIGHT: u32 = 135;
pub const MAX_TOTAL_FRAMES: usize = 90;

pub fn frame_size() -> usize {
    ((DISPLAY_WIDTH * DISPLAY_HEIGHT * 2) as usize + 0x7fff) & !0x7fff
}
