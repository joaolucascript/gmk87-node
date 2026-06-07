#!/usr/bin/env node
/** Fix VIA dist for embedding under /via/ inside Tauri. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viaDir = path.join(root, "src", "via");
const indexPath = path.join(viaDir, "index.html");
const defsInVia = path.join(viaDir, "definitions");
const defsAtRoot = path.join(root, "src", "definitions");

const GMK87_VPIDS = [839864405, 839864456];

const bootstrapScript = `<script id="gmk87-via-bootstrap">(function(){try{document.documentElement.setAttribute("data-gmk87-embed","true");document.documentElement.setAttribute("data-theme-mode","dark");var ids=${JSON.stringify(GMK87_VPIDS)};var raw=localStorage.getItem("via-app-store");if(!raw)return;var store=JSON.parse(raw);var map=((store.definitionIndex||{}).supportedVendorProductIdMap)||{};var ok=ids.every(function(id){return map[id]&&map[id].v2});if(!ok){delete store.definitionIndex;store.definitions={}}if(!store.settings)store.settings={};if(!store.settings.themeName||store.settings.themeName==="OLIVIA_DARK")store.settings.themeName="BLACK";localStorage.setItem("via-app-store",JSON.stringify(store))}catch(e){}})();(function waitReady(){var root=document.getElementById("root");if(!root||!root.childElementCount){requestAnimationFrame(waitReady);return}var notify=function(){try{window.parent.postMessage({type:"gmk87-via-ready"},"*")}catch(_){}};if(!document.fonts||!document.fonts.load){notify();return}Promise.all([document.fonts.load('700 16px "Fira Sans"'),document.fonts.load('bold 16px "Fira Sans"'),document.fonts.load('16px "Fira Sans"')]).then(notify).catch(notify)})();</script>`;

const themeLink = `<link id="gmk87-via-theme" rel="stylesheet" href="./gmk87-theme.css">`;

if (!fs.existsSync(indexPath)) {
  console.error("Missing src/via/index.html — run npm run setup:via first");
  process.exit(1);
}

let html = fs.readFileSync(indexPath, "utf8");
html = html
  .replace(/\shref="\/(?!\/)(?!https?:)/g, ' href="./')
  .replace(/\ssrc="\/(?!\/)(?!https?:)/g, ' src="./')
  .replace(/(<script type="module") crossorigin/g, "$1")
  .replace(/(<link rel="modulepreload") crossorigin/g, "$1")
  .replace(
    /family=Fira\+Sans\+Condensed:wght@[^&]+&family=Fira\+Sans:wght@[^&]+/,
    "family=Fira+Sans+Condensed:wght@300;400;500;600;700&family=Fira+Sans:wght@300;400;600;700",
  );

if (html.includes("gmk87-via-bootstrap")) {
  html = html.replace(
    /<script id="gmk87-via-bootstrap">[\s\S]*?<\/script>/,
    bootstrapScript,
  );
} else if (!html.includes("gmk87-via-bootstrap")) {
  html = html.replace("<body>", `<body>\n${bootstrapScript}`);
}

if (!html.includes("gmk87-via-theme")) {
  html = html.replace("</head>", `${themeLink}\n</head>`);
}

fs.writeFileSync(indexPath, html);

const hashPath = path.join(defsAtRoot, "hash.json");
if (fs.existsSync(hashPath)) {
  const hash = JSON.parse(fs.readFileSync(hashPath, "utf8"));
  let patched = fs.readFileSync(indexPath, "utf8");
  patched = patched.replace(
    /id="definition_hash"\s+data-hash="[^"]*"/,
    `id="definition_hash" data-hash="${hash}"`,
  );
  fs.writeFileSync(indexPath, patched);
}

const assetsDir = path.join(viaDir, "assets");
if (fs.existsSync(assetsDir)) {
  for (const name of fs.readdirSync(assetsDir)) {
    if (!name.endsWith(".js")) continue;
    const jsPath = path.join(assetsDir, name);
    let js = fs.readFileSync(jsPath, "utf8");
    const next = js
      .replace(/"\.\.\/definitions\//g, '"./definitions/')
      .replace(/`\.\.\/definitions\//g, "`./definitions/")
      .replace(/"\/definitions\//g, '"./definitions/')
      .replace(/`\/definitions\//g, "`./definitions/");
    if (next !== js) fs.writeFileSync(jsPath, next);
  }
}

if (fs.existsSync(defsInVia)) {
  fs.cpSync(defsInVia, defsAtRoot, { recursive: true, force: true });
}

console.log("Patched src/via/index.html (relative asset paths + GMK87 bootstrap)");
console.log("Patched src/via/assets/*.js (relative definition fetch paths)");
console.log("Copied definitions → src/definitions/ (for VIA fetch /definitions/…)");
