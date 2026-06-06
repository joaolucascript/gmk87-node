pub fn to_rgb565(r: u8, g: u8, b: u8) -> u16 {
    let r5 = u16::from((r >> 3) & 0x1f);
    let g6 = u16::from((g >> 2) & 0x3f);
    let b5 = u16::from((b >> 3) & 0x1f);
    (r5 << 11) | (g6 << 5) | b5
}

pub fn to_hex_num(num: u8) -> Result<u8, String> {
    if num >= 100 {
        return Err("toHexNum expects 0..99".into());
    }
    Ok(((num / 10) << 4) | (num % 10))
}

pub fn checksum(buf: &[u8; 64]) -> u16 {
    let mut sum: u16 = 0;
    for i in 3..64 {
        sum = sum.wrapping_add(buf[i] as u16);
    }
    sum
}
