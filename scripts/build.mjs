#!/usr/bin/env node
// Builds dist/index.html: a single, fully self-contained, offline-capable
// HTML file with the NiiVue library and the app's own logic inlined as
// plain classic <script> tags (no ES module imports, no CDN, no external
// requests at runtime).
//
// Why not just `import` NiiVue normally? Because ES module imports are
// blocked by the browser's Same-Origin Policy when a page is opened directly
// from disk (file://), which is exactly how this viewer is meant to be used
// — download one .html file, double-click it, done. NiiVue ships a UMD
// build specifically for classic <script> usage (no import/export syntax),
// so we inline that instead of the ESM build.
//
// Usage: npm install && npm run build   →  dist/index.html

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const srcDir = path.join(root, "src");
const distDir = path.join(root, "dist");

const niivueUmdPath = path.join(root, "node_modules/@niivue/niivue/dist/niivue.umd.js");
const niivuePkgPath = path.join(root, "node_modules/@niivue/niivue/package.json");

function readTextFile(filePath, label) {
  if (!existsSync(filePath)) {
    console.error(`✗ Missing ${label}: ${filePath}`);
    console.error(`  Did you run "npm install" first?`);
    process.exit(1);
  }
  return readFileSync(filePath, "utf-8");
}

const html = readTextFile(path.join(srcDir, "index.html"), "src/index.html");
const appJs = readTextFile(path.join(srcDir, "app.js"), "src/app.js");
const niivueUmd = readTextFile(niivueUmdPath, "@niivue/niivue UMD bundle");
const niivuePkg = JSON.parse(readTextFile(niivuePkgPath, "@niivue/niivue package.json"));

// Sanity check: the UMD bundle must not contain a literal "</script" —
// if it ever did, that substring would prematurely close our inline
// <script> tag when parsed as HTML, silently truncating the page.
if (/<\/script/i.test(niivueUmd)) {
  console.error(`✗ The vendored NiiVue UMD bundle contains a literal "</script" sequence.`);
  console.error(`  Inlining it as-is would corrupt the HTML. Aborting build.`);
  process.exit(1);
}

// Wrap the app code in an IIFE so its top-level names (nv, state, etc.)
// don't leak into the global scope alongside NiiVue's own globals.
const appWrapped = `(function () {\n${appJs}\n})();`;

const scriptTag = '<script type="module" src="./app.js"></script>';
if (!html.includes(scriptTag)) {
  console.error(`✗ Could not find the expected placeholder script tag in src/index.html:`);
  console.error(`  ${scriptTag}`);
  process.exit(1);
}

const inlined = [
  "<script>",
  `/* ---- @niivue/niivue v${niivuePkg.version} (UMD build, inlined for offline use) ---- */`,
  "/* Source: npm @niivue/niivue, dist/niivue.umd.js — see README.md and THIRD_PARTY_LICENSES.md for attribution. */",
  niivueUmd,
  "</script>",
  "<script>",
  appWrapped,
  "</script>",
].join("\n");

// Note: pass a function here, not the `inlined` string directly. When the
// replacement argument is a string, JS specially interprets $&, $$, $`, $'
// sequences within it — and a blob this size (2MB+ of third-party code) is
// virtually guaranteed to contain a literal "$&" somewhere (it's a common
// regex-replace idiom), which would otherwise silently re-insert stray
// copies of the matched placeholder text into the output.
const finalHtml = html.replace(scriptTag, () => inlined);

if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });
writeFileSync(path.join(distDir, "index.html"), finalHtml, "utf-8");

const sizeKb = (Buffer.byteLength(finalHtml, "utf-8") / 1024).toFixed(0);
console.log(`✓ Built dist/index.html (${sizeKb} KB, NiiVue v${niivuePkg.version})`);
