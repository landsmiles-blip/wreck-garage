// Functional check of the Take 3 build in headless Chromium (needs dist/ served on :8081).
// Headless runs at ~10 FPS, so this checks DIRECTION and LOGIC only: the sign of steering moves,
// missions, the yard opening, a house being smashed, the garage bank. Never read timing or frame
// rate from it; those come from the phone. Exits non-zero on any failure. Run:
//   node tools/check-take3.mjs
import { chromium } from 'playwright';
import path from 'node:path';

const exe = path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe');
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://127.0.0.1:8081/');
await page.waitForFunction(() => window.__wreckDebug, null, { timeout: 30000 });
await page.waitForTimeout(2500);

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(36)} | ${detail}`);
  if (!ok) failures++;
};
const st = () => page.evaluate(() => window.__wreckDebug.getState());
const cx = 195, cy = 422;
let pid = 1;
async function drag(dx, dy, ms) {
  const id = pid++;
  await page.evaluate(({ id, cx, cy, dx, dy }) => {
    const cv = document.getElementById('game-canvas');
    cv.dispatchEvent(new PointerEvent('pointerdown', { pointerId: id, clientX: cx, clientY: cy, bubbles: true }));
    cv.dispatchEvent(new PointerEvent('pointermove', { pointerId: id, clientX: cx + dx, clientY: cy + dy, bubbles: true }));
  }, { id, cx, cy, dx, dy });
  await page.waitForTimeout(ms);
  await page.evaluate((id) => {
    document.getElementById('game-canvas').dispatchEvent(new PointerEvent('pointerup', { pointerId: id, bubbles: true }));
  }, id);
}

const s0 = await st();
check('default_steer_is_point_where_to_go', s0.steerMode === 'camlatch', `steerMode=${s0.steerMode}`);
check('three_missions_on_screen', (await page.$$('.mission-item')).length === 3, `items=${(await page.$$('.mission-item')).length}`);

// Steering signs at four headings: drag up = away from the camera, drag right = screen right.
let signOk = 0;
const rows = [];
for (let k = 0; k < 4; k++) {
  await drag(k % 2 ? -60 : 60, 0, 900);
  await page.waitForTimeout(2500);
  let a = await st();
  const c = a.camYaw;
  await drag(0, -60, 900);
  let b = await st();
  const fwd = (b.x - a.x) * Math.sin(c) + (b.z - a.z) * Math.cos(c);
  await page.waitForTimeout(2500);
  a = await st();
  const c2 = a.camYaw;
  await drag(60, 0, 500);
  b = await st();
  const right = (b.x - a.x) * -Math.cos(c2) + (b.z - a.z) * Math.sin(c2);
  rows.push(`cam ${Math.round((((c * 180) / Math.PI) % 360 + 360) % 360)}deg fwd ${fwd.toFixed(1)} right ${right.toFixed(1)}`);
  if (fwd > 0.5 && right > 0.2) signOk++;
}
check('drag_signs_at_4_headings', signOk === 4, `${signOk}/4 ok: ${rows.join('; ')}`);

// A long sideways hold turns the car once and then holds the heading (no circling). Run from the
// west side of the yard heading east, so the curb bounce (which re-derives yaw) cannot interfere.
{
  await page.evaluate(() => window.__wreckDebug.teleportForTest(-18, 12, Math.PI)); // ~40 m of room to the east curb
  await page.waitForTimeout(2500);
  const id = pid++;
  await page.evaluate(({ id, cx, cy }) => {
    const cv = document.getElementById('game-canvas');
    cv.dispatchEvent(new PointerEvent('pointerdown', { pointerId: id, clientX: cx, clientY: cy, bubbles: true }));
    cv.dispatchEvent(new PointerEvent('pointermove', { pointerId: id, clientX: cx + 60, clientY: cy, bubbles: true }));
  }, { id, cx, cy });
  const y0 = (await st()).yaw;
  await page.waitForTimeout(1000);
  const y1 = (await st()).yaw;
  await page.waitForTimeout(1000);
  const y2 = (await st()).yaw;
  await page.evaluate((id) => document.getElementById('game-canvas').dispatchEvent(new PointerEvent('pointerup', { pointerId: id, bubbles: true })), id);
  const deg = (a) => ((((a * 180) / Math.PI) + 540) % 360) - 180;
  check('long_hold_turns_once_then_holds', Math.abs(deg(y1 - y0)) > 45 && Math.abs(deg(y2 - y1)) < 15,
    `turn in 1st second ${deg(y1 - y0).toFixed(0)}deg (>45), in 2nd second ${deg(y2 - y1).toFixed(0)}deg (<15)`);
}

// Top tier opens the yard and turns the 12 houses into targets; a house can be flattened.
await page.evaluate(() => window.__wreckDebug.setTierForTest(4));
await page.waitForTimeout(500);
let s = await st();
check('top_tier_opens_yard', s.yardOpen && s.housesStanding === 12, `yardOpen=${s.yardOpen} houses=${s.housesStanding}`);
await page.evaluate(() => window.__wreckDebug.teleportForTest(0, -24, Math.PI));
await page.waitForTimeout(1500);
for (let i = 0; i < 6 && (await st()).housesStanding === 12; i++) await drag(0, -60, 2500);
s = await st();
check('house_can_be_flattened', s.housesStanding < 12, `houses standing=${s.housesStanding} (from 12)`);

// Missions: by now the steering and house drives have smashed props; a mission has completed
// (paid bonus parts) or at least progressed.
{
  const m = await st();
  const progressed = m.missions.some((x) => !/ 0\/\d+$/.test(x));
  check('missions_progress_in_play', m.missionsDone > 0 || progressed, `completed=${m.missionsDone} now=[${m.missions.join(' | ')}]`);
}

// Run end banks parts (Bridge storage) and the garage shows; Drive Again keeps the bank.
await page.evaluate(() => window.__wreckDebug.forceEndSoonForTest());
await page.waitForSelector('#end-overlay:not(.hidden)', { timeout: 30000 });
await page.waitForTimeout(800);
const garageText = await page.$eval('.garage-box', (e) => e.textContent.replace(/\s+/g, ' ').trim());
const ended = await st();
check('run_end_banks_parts', ended.bank > 0 && ended.bank >= ended.parts, `bank=${ended.bank} parts=${ended.parts} card="${garageText}"`);
await page.click('#btn-again');
await page.waitForSelector('#end-overlay.hidden', { state: 'attached', timeout: 10000 });
const again = await st();
check('drive_again_keeps_bank_resets_yard', again.bank === ended.bank && !again.yardOpen && again.tierIdx === 0,
  `bank=${again.bank} yardOpen=${again.yardOpen} tier=${again.tierIdx + 1} level=${again.garageLevel} wearMult=${again.wearMult}`);

check('no_page_errors', errors.length === 0, `errors=${errors.length} ${errors.slice(0, 2).join(' | ')}`);
await page.screenshot({ path: process.argv[2] || 'take3-check.png' });
await browser.close();
process.exit(failures ? 1 : 0);
