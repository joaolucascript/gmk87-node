#!/usr/bin/env node
/**
 * Build VIA definition bundle for GMK87 (wired + 2.4G).
 * Output: src/via/definitions/ (used by setup-via and shipped with the app)
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sourceDir = path.join(root, "via-definitions");
const outDir = path.join(root, "src", "via", "definitions");

async function loadViaReader() {
  const candidates = [
    path.join(root, "node_modules", "@the-via", "reader", "dist", "index.js"),
    path.join(root, ".via-build", "node_modules", "@the-via", "reader", "dist", "index.js"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return import(pathToFileURL(candidate).href);
    }
  }
  throw new Error(
    "Missing @the-via/reader — run npm run setup:via once (or npm install in .via-build)",
  );
}

function parseHexId(value) {
  return parseInt(String(value).replace(/^0x/i, ""), 16);
}

function vendorProductId(vendorId, productId) {
  return vendorId * 65536 + productId;
}

function toViaDefinitionV2(reader, def) {
  if (reader.isVIADefinitionV2(def)) return def;
  if (reader.isKeyboardDefinitionV2(def)) {
    return reader.keyboardDefinitionV2ToVIADefinitionV2(def);
  }
  throw new Error(`Unsupported VIA definition format for ${def.name ?? "keyboard"}`);
}

const reader = await loadViaReader();
const boards = [
  { file: "wired.json", label: "wired" },
  { file: "2.4g.json", label: "2.4g" },
];

const v2Ids = [];
const v2Dir = path.join(outDir, "v2");

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(v2Dir, { recursive: true });

for (const board of boards) {
  const srcPath = path.join(sourceDir, board.file);
  const def = JSON.parse(fs.readFileSync(srcPath, "utf8"));
  const vendorId = parseHexId(def.vendorId);
  const productId = parseHexId(def.productId);
  const vpid = vendorProductId(vendorId, productId);
  const viaDef = toViaDefinitionV2(reader, def);

  if (viaDef.vendorProductId !== vpid) {
    throw new Error(`${board.label}: vendorProductId mismatch (${viaDef.vendorProductId} !== ${vpid})`);
  }

  v2Ids.push(vpid);
  fs.writeFileSync(path.join(v2Dir, `${vpid}.json`), `${JSON.stringify(viaDef, null, 2)}\n`);
  console.log(
    `  ${board.label}: 0x${vendorId.toString(16).toUpperCase()} / 0x${productId.toString(16).toUpperCase()} → ${vpid}.json`,
  );
}

const supported = {
  generatedAt: Date.now(),
  version: "0.1.0",
  theme: {
    alpha: { c: "#363434", t: "#E8C4B8" },
    mod: { c: "#363434", t: "#E8C4B8" },
    accent: { c: "#E8C4B8", t: "#363434" },
  },
  vendorProductIds: {
    v2: v2Ids.sort((a, b) => a - b),
    v3: [],
  },
};

const supportedJson = `${JSON.stringify(supported, null, 2)}\n`;
fs.writeFileSync(path.join(outDir, "supported_kbs.json"), supportedJson);

const hash = crypto.createHash("sha256").update(supportedJson).digest("hex");
fs.writeFileSync(path.join(outDir, "hash.json"), JSON.stringify(hash));

const rootDefs = path.join(root, "src", "definitions");
fs.cpSync(outDir, rootDefs, { recursive: true, force: true });

const viaIndex = path.join(root, "src", "via", "index.html");
if (fs.existsSync(viaIndex)) {
  let html = fs.readFileSync(viaIndex, "utf8");
  html = html.replace(/id="definition_hash"\s+data-hash="[^"]*"/, `id="definition_hash" data-hash="${hash}"`);
  fs.writeFileSync(viaIndex, html);
}

console.log(`\nVIA definitions → ${outDir}`);
console.log(`Hash: ${hash}`);
