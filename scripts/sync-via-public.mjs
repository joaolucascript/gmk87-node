#!/usr/bin/env node
/** Copy bundled GMK87 definitions into .via-build/public before VIA vite build. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defsSrc = path.join(root, "src", "via", "definitions");
const defsDest = path.join(root, ".via-build", "public", "definitions");

if (!fs.existsSync(defsSrc)) {
  console.error("Missing src/via/definitions — run npm run build:via-defs first");
  process.exit(1);
}

fs.mkdirSync(path.dirname(defsDest), { recursive: true });
fs.cpSync(defsSrc, defsDest, { recursive: true, force: true });
console.log(`Synced definitions → ${defsDest}`);
