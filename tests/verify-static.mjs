import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DIST = path.resolve('dist');
let failures = 0;

function check(name, pass, detail) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(36)} | ${detail}`);
  if (!pass) failures++;
}

// 1. Filename safety across entire dist/
const badNames = [];
function walk(dir, rel = '') {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (!/^[a-zA-Z0-9._\-\/]+$/.test(r)) badNames.push(r);
    if (e.isDirectory()) walk(path.join(dir, e.name), r);
  }
}
walk(DIST);
check('latin_only_filenames', badNames.length === 0, `invalid=${badNames.length}`);

// 2. index.html head script order & Bridge presence
const htmlPath = path.join(DIST, 'index.html');
const html = readFileSync(htmlPath, 'utf8');
const firstScriptMatch = html.match(/<script\b([^>]*)>/i);
const firstScriptAttrs = firstScriptMatch ? firstScriptMatch[1] : '';
const hasSyncBridge =
  /src=["']vendor\/playgama-bridge\.js["']/i.test(firstScriptAttrs) &&
  !/\b(async|defer)\b/i.test(firstScriptAttrs);
check('first_head_script_bridge_sync', hasSyncBridge, `attrs="${firstScriptAttrs.trim()}"`);
check('bridge_sdk_file_exists', existsSync(path.join(DIST, 'vendor/playgama-bridge.js')), 'vendor/playgama-bridge.js present');
check('bridge_config_exists', existsSync(path.join(DIST, 'playgama-bridge-config.json')), 'playgama-bridge-config.json present');

// 3. Scan authored dist text artifacts (excluding vendor/playgama-bridge.js) for forbidden patterns
const authoredFiles = ['index.html', 'styles.css', 'game.js', 'playgama-bridge-config.json'];
const authoredContent = authoredFiles
  .map((f) => ({ f, text: readFileSync(path.join(DIST, f), 'utf8') }));

const FORBIDDEN = [
  ['no_localStorage', /\blocalStorage\b/],
  ['no_sessionStorage', /\bsessionStorage\b/],
  ['no_indexedDB', /\bindexedDB\b/i],
  ['no_cookie', /\bdocument\.cookie\b/],
  ['no_ytgame', /\bytgame\b/i],
  ['no_escape_key', /['"`]Escape['"`]/],
  ['no_oscillator_audio', /\bcreateOscillator\b/],
];

for (const [label, re] of FORBIDDEN) {
  const hits = authoredContent.filter((x) => re.test(x.text)).map((x) => x.f);
  check(label, hits.length === 0, hits.length === 0 ? '0 hits' : `found in ${hits.join(', ')}`);
}

// External URL scan (exempts W3C DOM namespace URIs inside Three.js core)
const urlHits = [];
for (const x of authoredContent) {
  const matches = [...x.text.matchAll(/https?:\/\/[^\s"'`)<>]+/gi)]
    .map((m) => m[0])
    .filter((u) => u !== 'http://www.w3.org/1999/xhtml' && u !== 'http://www.w3.org/2000/svg');
  if (matches.length) urlHits.push(`${x.f}: ${matches.join(', ')}`);
}
check('no_external_urls', urlHits.length === 0, urlHits.length === 0 ? '0 non-W3C-NS URLs' : urlHits.join('; '));

// 4. Required Playgama & engine integrity symbols inside game.js
const gameJs = authoredContent.find((x) => x.f === 'game.js').text;
const REQUIRED = [
  ['symbol_initialize', /\binitialize\b/],
  ['symbol_game_ready', /game_ready/],
  ['symbol_showInterstitial', /\bshowInterstitial\b/],
  ['symbol_webglcontextlost', /\bwebglcontextlost\b/],
  ['symbol_audio_state', /audio_state_changed|AUDIO_STATE_CHANGED/],
  ['symbol_pause_state', /pause_state_changed|PAUSE_STATE_CHANGED/],
  ['symbol_wreck_best', /wreck_best/],
];

for (const [label, re] of REQUIRED) {
  check(label, re.test(gameJs), re.test(gameJs) ? 'present' : 'MISSING');
}

process.exit(failures ? 1 : 0);
