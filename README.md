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
| Windows | `gmk87-configurator.exe` (portable, no installer) |
| macOS | `.dmg` |
| Linux | `.AppImage` or `.deb` |

> **Windows:** Requires [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (included in Windows 10/11). Download the `.exe` and run — no installation.

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

**Windows (portable `.exe`):**

```bash
npm run build:portable
```

Output: `src-tauri/target/release/gmk87-configurator.exe`

**macOS:**

```bash
npm run build
```

Output: `src-tauri/target/release/bundle/dmg/*.dmg`

**Linux (AppImage — portable, no install):**

Must be built on Linux (or WSL2). Install [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/#linux) first:

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libudev-dev libssl-dev
npm install
npm run build:appimage
```

Output: `src-tauri/target/release/bundle/appimage/*.AppImage`

Run it:

```bash
chmod +x "src-tauri/target/release/bundle/appimage/"*.AppImage
./src-tauri/target/release/bundle/appimage/*.AppImage
```

> **From Windows:** use [WSL2](https://learn.microsoft.com/en-us/windows/wsl/install) with Ubuntu, clone the repo inside WSL, and run the commands above. AppImage cannot be built natively on Windows.

Releases on GitHub also include the AppImage (built automatically on Linux in CI).

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
- **VIA keymap editor** (wired + 2.4G) — remaps, layers, macros via [VIA](https://github.com/the-via/app)

## VIA keymap (Keymap tab)

GMK87 uses a separate USB interface for VIA/QMK (wired `0x5055`, 2.4G `0x5088`) from the display configurator (`0x5055` vendor protocol on interface 3).

Bundled keyboard definitions live in `via-definitions/` (source) and `src/via/definitions/` (VIA bundle format).

**One-time setup** (requires Node.js 18+ and Git):

```bash
npm run setup:via
```

This clones [the-via/app](https://github.com/the-via/app), embeds the GMK87 JSON definitions, builds the web app into `src/via/`, and ships it with the configurator. VIA is **GPL-3.0** — the bundled app stays separate under `src/via/`.

Then open the **Keymap** tab, allow WebHID when prompted, and select your keyboard.

> Use **wired USB** for the most reliable VIA connection. Display/Lighting tabs use a different HID interface and can stay open in other tabs after VIA connects.

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
