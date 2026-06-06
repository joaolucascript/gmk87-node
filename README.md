# GMK87 Configurator

![Status](https://img.shields.io/badge/status-stable-green)
![License](https://img.shields.io/badge/license-MIT-blue)

Upload images to the keyboard display, configure RGB lighting, sync the clock, and apply presets on the Zuoya GMK87 keyboard.

Built with **Rust + Tauri** — small portable binaries, no Node.js runtime bundled.

## Hardware

- **Keyboard:** Zuoya GMK87
- **Vendor ID:** `0x320f` | **Product ID:** `0x5055`
- **Display:** 240x135 pixels, RGB565, 2 image slots
- **USB Interface:** 3 (vendor-specific, `usagePage 0xFF1C`)

## Download

Desktop app for Windows, macOS, and Linux.

[![Windows](https://img.shields.io/badge/Windows-Download-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/codedgar/gmk87-node/releases/latest)
[![macOS](https://img.shields.io/badge/macOS-Download-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/codedgar/gmk87-node/releases/latest)
[![Linux](https://img.shields.io/badge/Linux-Download-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/codedgar/gmk87-node/releases/latest)

Go to [Releases](https://github.com/codedgar/gmk87-node/releases/latest) and download the file for your OS.

| OS | File |
|---|---|
| Windows | `.exe` installer |
| macOS | `.dmg` |
| Linux | `.AppImage` or `.deb` |

> **Linux users:** Copy the included `50-gmk87.rules` to `/etc/udev/rules.d/` and reload udev to allow HID access without root. See `linux-setup.txt` for details.

## Development

### Requirements

- [Rust](https://rustup.rs/) (1.77+)
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS
- Node.js 18+ (for npm scripts only)

### Run locally

```bash
git clone https://github.com/codedgar/gmk87-node.git
cd gmk87-node
npm install
npm run dev
```

### Build

```bash
npm run build
```

Installers are written to `src-tauri/target/release/bundle/`.

## Project layout

```
├── src/                 # Frontend (vanilla JS SPA)
├── src-tauri/
│   ├── src/gmk87/       # Rust: HID protocol, upload, config
│   ├── presets.json
│   └── tauri.conf.json
├── 50-gmk87.rules       # Linux udev rule
└── package.json
```

## Features

- Upload static images and GIFs to two display slots
- Preserve the other slot when uploading only one (local slot cache)
- Configure underglow and LED lighting
- Apply built-in presets
- Sync keyboard clock with system time

## Protocol

Based on USB captures of the official Zuoya app. Uses command-response on USB interface 3.

### Frame structure

64-byte HID reports:

```
[0]    = 0x04 (report ID)
[1-2]  = checksum (uint16 LE, sum of bytes 3-63)
[3]    = command byte
[4]    = data length
[5-7]  = position (24-bit LE)
[8-63] = data payload (56 bytes max)
```

## References

- [@ikkentim](https://github.com/ikkentim) for the original C# reverse engineering: https://github.com/ikkentim/gmk87-usb-reverse

## License

MIT
