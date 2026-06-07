#!/usr/bin/env node
/**
 * Clone and build the VIA web app with bundled GMK87 definitions.
 * Output: src/via/ (index.html + assets + definitions)
 *
 * VIA is GPL-3.0 — see https://github.com/the-via/app
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const viaBuildDir = path.join(root, ".via-build");
const viaOutDir = path.join(root, "src", "via");
const defsSrc = path.join(viaOutDir, "definitions");

function run(cmd, cwd = root) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, CI: "true" } });
}

function patchFile(filePath, replacements) {
  let content = fs.readFileSync(filePath, "utf8");
  for (const [from, to] of replacements) {
    if (!content.includes(from)) {
      console.warn(`Patch skipped (pattern not found): ${from.slice(0, 60)}…`);
      continue;
    }
    content = content.replace(from, to);
  }
  fs.writeFileSync(filePath, content);
}

console.log("Building GMK87 VIA definitions…");
run("node scripts/build-via-definitions.mjs");

if (!fs.existsSync(viaBuildDir)) {
  run(`git clone --depth 1 https://github.com/the-via/app "${viaBuildDir}"`);
} else {
  run("git pull --ff-only", viaBuildDir);
}

fs.cpSync(defsSrc, path.join(viaBuildDir, "public", "definitions"), { recursive: true, force: true });

patchFile(path.join(viaBuildDir, "vite.config.ts"), [
  [
    "const hash = fs.readFileSync('public/definitions/hash.json', 'utf8');",
    "const hash = JSON.parse(fs.readFileSync('public/definitions/hash.json', 'utf8'));",
  ],
  [
    "export default defineConfig({",
    "export default defineConfig({\n  base: './',",
  ],
]);

patchFile(path.join(viaBuildDir, "src", "utils", "device-store.ts"), [
  [
    "const hash = await (await fetch('/definitions/hash.json')).json();",
    "const hash = document.getElementById('definition_hash')?.dataset.hash || '';",
  ],
  [
    "    const response = await fetch('/definitions/supported_kbs.json', {",
    "    const response = await fetch('./definitions/supported_kbs.json', {",
  ],
  [
    "    const response = await fetch('../definitions/supported_kbs.json', {",
    "    const response = await fetch('./definitions/supported_kbs.json', {",
  ],
  [
    `import type {
  AuthorizedDevice,
  DefinitionIndex,
  Settings,
  VendorProductIdMap,
} from '../types/types';`,
    `import {
  isKeyboardDefinitionV2,
  isVIADefinitionV2,
  keyboardDefinitionV2ToVIADefinitionV2,
} from '@the-via/reader';
import type {
  AuthorizedDevice,
  DefinitionIndex,
  Settings,
  VendorProductIdMap,
} from '../types/types';`,
  ],
  [
    `  const url = \`/definitions/\${version}/\${vpid}.json\`;
  const response = await fetch(url);
  const json: DefinitionVersionMap[K] = await response.json();`,
    `  const url = \`./definitions/\${version}/\${vpid}.json\`;
  const response = await fetch(url);
  const raw = await response.json();
  const json: DefinitionVersionMap[K] =
    version === 'v2'
      ? isVIADefinitionV2(raw)
        ? raw
        : isKeyboardDefinitionV2(raw)
          ? keyboardDefinitionV2ToVIADefinitionV2(raw)
          : raw
      : raw;`,
  ],
  [
    `  const url = \`../definitions/\${version}/\${vpid}.json\`;
  const response = await fetch(url);
  const raw = await response.json();
  const json: DefinitionVersionMap[K] =
    version === 'v2'
      ? isVIADefinitionV2(raw)
        ? raw
        : isKeyboardDefinitionV2(raw)
          ? keyboardDefinitionV2ToVIADefinitionV2(raw)
          : raw
      : raw;`,
    `  const url = \`./definitions/\${version}/\${vpid}.json\`;
  const response = await fetch(url);
  const raw = await response.json();
  const json: DefinitionVersionMap[K] =
    version === 'v2'
      ? isVIADefinitionV2(raw)
        ? raw
        : isKeyboardDefinitionV2(raw)
          ? keyboardDefinitionV2ToVIADefinitionV2(raw)
          : raw
      : raw;`,
  ],
]);

patchFile(path.join(viaBuildDir, "src", "store", "devicesThunks.ts"), [
  ["await await dispatch(loadStoredCustomDefinitions", "await dispatch(loadStoredCustomDefinitions"],
  ["dispatch(loadStoredCustomDefinitions", "await dispatch(loadStoredCustomDefinitions"],
]);

run("node scripts/apply-via-gmk87-patches.mjs");

run("npm install", viaBuildDir);
run("npx tsc", viaBuildDir);
run("npx vite build", viaBuildDir);

const distDir = path.join(viaBuildDir, "dist");
if (!fs.existsSync(path.join(distDir, "index.html"))) {
  console.error("VIA build failed — dist/index.html missing");
  process.exit(1);
}

for (const entry of fs.readdirSync(distDir)) {
  const src = path.join(distDir, entry);
  const dest = path.join(viaOutDir, entry);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
}

run("node scripts/patch-via-bundle.mjs");

console.log(`\nVIA bundled → ${viaOutDir}`);
console.log("Open the Keymap tab in GMK87 Configurator.");
