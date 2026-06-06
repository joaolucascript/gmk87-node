#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, ".via-build", "dist");
const viaOutDir = path.join(root, "src", "via");

if (!fs.existsSync(path.join(distDir, "index.html"))) {
  console.error("Missing .via-build/dist — run vite build in .via-build first");
  process.exit(1);
}

for (const entry of fs.readdirSync(distDir)) {
  const src = path.join(distDir, entry);
  const dest = path.join(viaOutDir, entry);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
}

console.log(`Copied VIA dist → ${viaOutDir}`);
