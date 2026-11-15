import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { unzipSync, zipSync } from 'fflate';

const DIST = path.resolve('dist');
const OUT_ZIP = path.resolve('wreck-garage-v2.zip');

const files = {};
const groups = { three_and_game_js: 0, bridge_sdk: 0, models_glb: 0, audio_mp3: 0, html_css_json: 0 };
let fileCount = 0;
let maxFileBytes = 0;

function walk(dir, relPrefix = '') {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    const rel = relPrefix ? `${relPrefix}/${e.name}` : e.name;
    if (e.isDirectory()) {
      walk(abs, rel);
      continue;
    }
    const buf = readFileSync(abs);
    files[rel] = new Uint8Array(buf);
    fileCount++;
    if (buf.length > maxFileBytes) maxFileBytes = buf.length;

    if (rel === 'vendor/playgama-bridge.js') groups.bridge_sdk += buf.length;
    else if (rel.endsWith('.glb')) groups.models_glb += buf.length;
    else if (rel.endsWith('.mp3')) groups.audio_mp3 += buf.length;
    else if (rel === 'game.js') groups.three_and_game_js += buf.length;
    else groups.html_css_json += buf.length;
  }
}

walk(DIST);

const zipped = zipSync(files, { level: 9 });
writeFileSync(OUT_ZIP, zipped);

// Verify zip paths have zero backslashes and index.html sits cleanly at root
const entries = Object.keys(unzipSync(zipped));
const hasBackslash = entries.some((p) => p.includes('\\'));
const hasRootIndex = entries.includes('index.html');
const zipMiB = zipped.length / (1024 * 1024);
const maxFileMiB = maxFileBytes / (1024 * 1024);

console.log('=== Zip Package Breakdown ===');
for (const [k, v] of Object.entries(groups)) {
  console.log(`  ${k.padEnd(20)}: ${(v / 1024).toFixed(1)} KB`);
}
console.log(`  zip_total           : ${zipped.length} bytes (${zipMiB.toFixed(2)} MiB) | target <= 15.00 MiB SHOULD, <= 30.00 MiB MUST`);
console.log(`  max_single_file     : ${maxFileBytes} bytes (${maxFileMiB.toFixed(2)} MiB) | limit <= 30.00 MiB`);
console.log(`  file_count          : ${fileCount} | limit <= 8000`);
console.log(`  root_index_present  : ${hasRootIndex} | forward_slashes_only: ${!hasBackslash}`);

if (!hasRootIndex || hasBackslash || zipMiB > 30 || maxFileMiB > 30 || fileCount > 8000) {
  process.exit(1);
}
