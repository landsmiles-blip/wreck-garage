// Measures how much of the screen the player's vehicle covers at each tier (ledger Finding 9).
// Needs the built game served at http://127.0.0.1:8081 (dist/). Coverage is a pixel count of one
// still frame rendered with only the vehicle visible, so headless frame rate does not affect it;
// the waits only let the eased camera settle. Usage:
//   node tools/measure-camera.mjs "<query>" <width> <height> [screenshotDir]
import { chromium } from 'playwright';
import path from 'node:path';
const exe = path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe');
const [,, query = '', vw = '390', vh = '844', shotDir = ''] = process.argv;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=d3d11', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: +vw, height: +vh } });
await page.goto(`http://127.0.0.1:8081/?${query}`);
await page.waitForFunction(() => window.__wreckDebug, null, { timeout: 30000 });
await page.waitForTimeout(3000);
const rows = [];
for (let t = 0; t < 5; t++) {
  await page.evaluate((i) => window.__wreckDebug.setTierForTest(i), t);
  await page.waitForTimeout(7000);
  rows.push(await page.evaluate(() => window.__wreckDebug.measureCoverage()));
  if (shotDir) await page.screenshot({ path: `${shotDir}/${query.replace(/[^a-z0-9]/gi, '_') || 'default'}_${vw}x${vh}_T${t + 1}.png` });
}
console.log(JSON.stringify({ query, viewport: `${vw}x${vh}`, rows: rows.map((r) => `T${r.tier} cover ${r.cover} top ${r.coverTopHalf}`) }));
await browser.close();
