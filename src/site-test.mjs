// Smoke test of the hosted site as GitHub Pages will serve it: under /flag-explorer/, with nothing fetched from other sites.
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-site-'));
fs.cpSync('../docs', path.join(root, 'flag-explorer'), { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'max-age=600' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/flag-explorer/`;
const errors = [], assert = (c, m) => { if (!c) errors.push('ASSERT ' + m); }, eq = (a, b, m) => assert(a === b, `${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const browser = await chromium.launch({ executablePath: process.env.FX_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage(), outside = [], failed = [];
page.on('pageerror', e => errors.push('pageerror ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console ' + m.text()); });
ctx.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) outside.push(r.url()); });
ctx.on('requestfailed', r => failed.push(r.url()));
const txt = (sel = '#app') => page.textContent(sel);
const answerFirst = async () => { await page.locator('#fx-panel .fx-opt:not([disabled])').first().click(); };
const finishTurn = async () => { for (const act of ['bonus', 'next']) { const b = page.locator(`[data-act=${act}]`); if (await b.count()) { await b.click(); if (act === 'bonus') await answerFirst(); } } const n = page.locator('[data-act=next]'); if (await n.count()) await n.click(); };

// 1. first visit
await page.goto(base); await page.waitForTimeout(400);
eq(await page.title(), 'Flag Explorer', 'page title');
assert((await txt()).includes('Who is exploring?'), 'start screen shown');
const sw = await page.evaluate(async () => { const reg = await navigator.serviceWorker.ready; return { scope: reg.scope, active: !!reg.active, caches: await caches.keys() }; });
eq(sw.scope, base, 'service worker covers the game only'); assert(sw.active, 'service worker active'); eq(sw.caches.length, 1, 'one stored copy');
const version = fs.readFileSync(path.join(root, 'flag-explorer/version.txt'), 'utf8').trim(); eq(sw.caches[0], 'flag-explorer-' + version, 'stored copy carries the build version');
await page.evaluate(() => document.fonts.ready);
for (const f of ['600 16px Figtree', '600 20px "Barlow Condensed"', '500 11px "IBM Plex Mono"']) assert(await page.evaluate(x => document.fonts.check(x), f), 'typeface loaded: ' + f);
const man = await page.evaluate(async () => { const m = await (await fetch(document.querySelector('link[rel=manifest]').href)).json(); const ok = await Promise.all(m.icons.map(i => fetch(i.src).then(r => r.ok && r.headers.get('content-type')))); return { m, ok }; });
eq(man.m.display, 'standalone', 'opens without browser bars'); eq(man.m.start_url, './', 'start address is relative'); assert(man.ok.every(t => t === 'image/png'), 'all icons load');
eq(await page.locator('#fx-update').isHidden(), true, 'no update notice on a first visit');
await page.screenshot({ path: 'h1-start.png', fullPage: true });

// 2. play, reload in the middle, carry on
await page.fill('#fx-name', 'Alex'); await page.click('#fx-setup [type=submit]');
await page.click('[data-act=opt][data-k=mode][data-v=free]'); await page.click('[data-act=play]'); await page.waitForTimeout(400);
await page.screenshot({ path: 'h2-play.png' });
await answerFirst(); await finishTurn(); await answerFirst();
const before = { head: await txt('#fx-head'), flag: await page.locator('.fx-flag').getAttribute('src'), panel: await txt('#fx-panel') };
assert(before.head.includes('Flag 2 of 10'), 'on the second flag');
await page.reload(); await page.waitForTimeout(400);
eq(await txt('#fx-head'), before.head, 'reload keeps score, streak and place in the round'); eq(await page.locator('.fx-flag').getAttribute('src'), before.flag, 'same flag after reload'); eq(await txt('#fx-panel'), before.panel, 'same answer state after reload');

// 3. offline: the stored copy still opens and plays
await ctx.setOffline(true); await page.reload(); await page.waitForTimeout(400);
eq(await txt('#fx-head'), before.head, 'offline reload restores the round'); for (const f of ['600 16px Figtree', '700 20px "Barlow Condensed"']) assert(await page.evaluate(x => document.fonts.check(x), f), 'typeface offline: ' + f);
await finishTurn(); await answerFirst(); assert((await txt('#fx-head')).includes('Flag 3 of 10'), 'play continues offline');
await ctx.setOffline(false);

// 4. Today's challenge survives a reload without restarting; leaving for the start screen clears the saved game
await page.locator('[data-act=end-early]').click(); await page.locator('[data-act=end-early]').click(); await page.click('[data-act=choose]');
await page.click('[data-act=opt][data-k=mode][data-v=daily]'); await page.click('[data-act=play]'); await answerFirst(); await finishTurn();
const daily = { head: await txt('#fx-head'), flag: await page.locator('.fx-flag').getAttribute('src') }; assert(daily.head.includes("Today's challenge") && daily.head.includes('Flag 2 of 10'), 'second flag of the challenge');
await page.reload(); await page.waitForTimeout(400); eq(await txt('#fx-head'), daily.head, 'challenge resumes where it was'); eq(await page.locator('.fx-flag').getAttribute('src'), daily.flag, 'challenge flag unchanged');
// a challenge left unfinished overnight is dropped
await page.evaluate(() => { const v = JSON.parse(localStorage.getItem('fx-live')); v.day = '2020-01-01'; localStorage.setItem('fx-live', JSON.stringify(v)); });
await page.reload(); await page.waitForTimeout(400); assert((await txt()).includes('Who is exploring?'), "yesterday's unfinished challenge is not resumed");

// 5. pass and play survives a reload on the hand-over screen
await page.click('#fx-setup [type=submit]'); await page.click('[data-act=opt][data-k=mode][data-v=party]'); await page.fill('.fx-guest', 'Robin'); await page.click('[data-act=play]');
await page.click('[data-act=ready]'); await answerFirst(); await finishTurn();
assert((await txt()).includes('Pass it on') && (await txt('#fx-pass-name')).includes('Robin'), 'hand-over to the second player');
await page.reload(); await page.waitForTimeout(400); assert((await txt()).includes('Pass it on') && (await txt('#fx-pass-name')).includes('Robin'), 'hand-over screen restored');
await page.click('[data-act=ready]'); assert((await txt('#fx-head')).includes('Robin'), 'second player carries on'); await page.screenshot({ path: 'h3-party.png' });

// 6. an update: publish a changed copy, and the installed game offers a refresh and then shows the new version
const dir = path.join(root, 'flag-explorer');
fs.writeFileSync(path.join(dir, 'index.html'), fs.readFileSync(path.join(dir, 'index.html'), 'utf8').replace('<title>Flag Explorer</title>', '<title>Flag Explorer</title><meta name="fx-marker" content="v2">'));
fs.writeFileSync(path.join(dir, 'sw.js'), fs.readFileSync(path.join(dir, 'sw.js'), 'utf8').replace(version, 'updatedbuild1'));
await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg.update(); });
await page.waitForFunction(() => !document.getElementById('fx-update').hidden, null, { timeout: 15000 }).catch(() => errors.push('ASSERT update notice never appeared'));
await page.screenshot({ path: 'h4-update.png' });
eq(await page.locator('meta[name=fx-marker]').count(), 0, 'old version still showing until refreshed');
await page.click('#fx-update-btn'); await page.waitForTimeout(600);
eq(await page.locator('meta[name=fx-marker]').count(), 1, 'refresh shows the new version'); assert((await txt('#fx-head')).includes('Robin'), 'and the game in progress is still there');
eq((await page.evaluate(() => caches.keys())).join(), 'flag-explorer-updatedbuild1', 'old stored copy removed');

// 7. dark theme on a small phone
const dark = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, colorScheme: 'dark' }); const d = await dark.newPage();
d.on('pageerror', e => errors.push('pageerror(dark) ' + e.message)); await d.goto(base); await d.waitForTimeout(500); await d.screenshot({ path: 'h5-dark.png', fullPage: true });
const o = await d.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth })); assert(o.sw <= o.iw, 'no sideways scroll on the hosted page');

eq(outside.length, 0, 'nothing requested from other sites: ' + outside.slice(0, 3).join(' '));
assert(failed.filter(u => !u.includes('sw.js')).length === 0, 'no failed requests: ' + failed.slice(0, 3).join(' '));
await browser.close(); server.close(); fs.rmSync(root, { recursive: true, force: true });
console.log(errors.length ? errors.join('\n') : 'HOSTED SITE CHECKS PASSED');
