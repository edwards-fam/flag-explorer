import { chromium } from 'playwright';
import path from 'path';
const url = 'file://' + path.resolve('test.html');
const browser = await chromium.launch({ executablePath: process.env.FX_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=document-user-activation-required'] });
const out = [];
// A: ordinary browser. Does a tap actually put signal on the output?
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 760 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url); await p.fill('#fx-name', 'Alex'); await p.click('#fx-setup [type=submit]');
  out.push('before any sound-making tap: context ' + await p.evaluate(() => { const s = window.__fx.sound; return s.ac ? s.ac.state : 'not created'; }));
  await p.evaluate(() => { const s = window.__fx.sound; window.__an = s.ac.createAnalyser(); window.__an.fftSize = 2048; s.master.connect(window.__an); window.__peak = 0;
    const buf = new Float32Array(2048); window.__iv = setInterval(() => { window.__an.getFloatTimeDomainData(buf); for (const x of buf) window.__peak = Math.max(window.__peak, Math.abs(x)); }, 10); });
  await p.click('[data-act=opt][data-k=mode][data-v=free]'); await p.waitForTimeout(400);
  out.push('after tapping an option: context ' + await p.evaluate(() => window.__fx.sound.ac.state) + ', peak level ' + (await p.evaluate(() => window.__peak)).toFixed(3));
  await p.evaluate(() => { window.__peak = 0; }); await p.click('[data-act=play]'); const s = await p.evaluate(() => JSON.parse(JSON.stringify(window.__fx.state.q)));
  await p.locator('#fx-panel .fx-opt').nth(s.options.indexOf(s.a2)).click(); await p.waitForTimeout(500);
  out.push('after a correct answer: peak level ' + (await p.evaluate(() => window.__peak)).toFixed(3));
  await p.evaluate(() => { window.__peak = 0; }); await p.click('[data-act=mute]'); await p.click('[data-act=bonus]'); await p.waitForTimeout(300);
  out.push('sound off, then a tap: peak level ' + (await p.evaluate(() => window.__peak)).toFixed(3) + ', stored mute ' + await p.evaluate(() => localStorage.getItem('fx-mute')));
  out.push('keep-alive clip on a non-iOS device: ' + await p.evaluate(() => String(window.__fx.sound.keepAlive)));
  out.push('errors: ' + (errs.join(' | ') || 'none'));
}
// B: pretend to be an iPhone (touch device with webkitAudioContext): the silent clip must start on the first tap and stop on mute
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url); out.push('iPhone stand-in detected: ' + await p.evaluate(() => window.__fx.sound.IOS) + ', hover supported: ' + await p.evaluate(() => matchMedia('(hover: hover)').matches));
  await p.fill('#fx-name', 'Alex'); await p.tap('#fx-setup [type=submit]'); await p.waitForTimeout(300);
  out.push('after first tap: clip playing ' + await p.evaluate(() => { const k = window.__fx.sound.keepAlive; return k ? !k.paused : 'no clip'; }) + ', context ' + await p.evaluate(() => window.__fx.sound.ac && window.__fx.sound.ac.state));
  await p.tap('[data-act=mute]'); await p.waitForTimeout(100); out.push('after sound off: clip playing ' + await p.evaluate(() => !window.__fx.sound.keepAlive.paused));
  await p.tap('[data-act=mute]'); await p.waitForTimeout(200); out.push('after sound on again: clip playing ' + await p.evaluate(() => !window.__fx.sound.keepAlive.paused));
  // sticky highlight: after "Next flag", no answer button may carry a hover background
  await p.tap('[data-act=opt][data-k=mode][data-v=free]'); await p.tap('[data-act=play]');
  const q = await p.evaluate(() => JSON.parse(JSON.stringify(window.__fx.state.q))); await p.locator('#fx-panel .fx-opt').nth(q.options.findIndex(o => o !== q.a2)).tap(); await p.tap('[data-act=next]'); await p.waitForTimeout(400);
  const bgs = await p.$$eval('#fx-panel .fx-opt', bs => bs.map(b => getComputedStyle(b).backgroundColor)); out.push('answer backgrounds on the next flag all the same: ' + (new Set(bgs).size === 1));
  out.push('errors: ' + (errs.join(' | ') || 'none'));
}
// C: an iPhone that offers the audio-session setting: it must be switched to playback on the first tap and handed back on mute
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { Object.defineProperty(navigator, 'audioSession', { value: { type: 'auto' }, configurable: true }); });
  await p.goto(url); await p.fill('#fx-name', 'Alex'); await p.tap('#fx-setup [type=submit]'); await p.waitForTimeout(200);
  out.push('with the audio-session setting, after first tap: ' + await p.evaluate(() => navigator.audioSession.type) + ', clip created: ' + await p.evaluate(() => !!window.__fx.sound.keepAlive));
  await p.tap('[data-act=mute]'); out.push('after sound off: ' + await p.evaluate(() => navigator.audioSession.type));
  await p.tap('[data-act=mute]'); out.push('after sound on: ' + await p.evaluate(() => navigator.audioSession.type));
  out.push('errors: ' + (errs.join(' | ') || 'none'));
}
console.log(out.join('\n')); await browser.close();
