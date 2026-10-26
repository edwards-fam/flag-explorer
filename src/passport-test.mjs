// The passport's finish lines: continents, the full passport, the last stretch, and the expert passport after it.
import { chromium } from 'playwright';
import path from 'path';
import { startMock } from './mock-firestore.mjs';
const url = 'file://' + path.resolve('test.html');
const mock = await startMock();
const browser = await chromium.launch({ executablePath: process.env.FX_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [], assert = (c, m) => { if (!c) errors.push('ASSERT ' + m); }, eq = (a, b, m) => assert(a === b, `${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
async function mk(label, { cloud = false, width = 390 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2 }), p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`pageerror(${label}) ${e.message}`)); p.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(`console(${label}) ${m.text()}`); });       // a 404 is the database saying a player does not exist yet
  if (cloud) await p.addInitScript(cfg => { window.FX_CLOUD = cfg; }, { projectId: 'demo', apiKey: 'test-key', base: mock.base });
  await p.clock.install({ time: new Date('2026-10-13T12:00:00') });      // the day summaries below are for 11 and 12 October, so the test lives on the 13th
  await p.goto(url); await p.waitForTimeout(250); return p;
}
const st = p => p.evaluate(() => JSON.parse(JSON.stringify(window.__fx.state)));
const txt = (p, sel = '#app') => p.textContent(sel);
const overflow = async (p, label) => { const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })); if (o.sw > o.iw) errors.push(`overflow at ${label}: ${o.sw}>${o.iw}`); };
const pickFlag = async (p, right) => { const s = await st(p); const i = right ? s.q.options.indexOf(s.q.a2) : s.q.options.findIndex(o => o !== s.q.a2 && !s.q.out.includes(o)); await p.locator('#fx-panel .fx-opt').nth(i).click(); };
const pickBonus = async (p, right) => { const s = await st(p); await p.locator('#fx-panel .fx-opt').nth(right ? s.q.bonus.answer : (s.q.bonus.answer + 1) % 4).click(); };
const enter = async (p, name) => { await p.fill('#fx-name', name); await p.click('#fx-setup [type=submit]'); await p.waitForFunction(() => window.__fx.state.screen === 'rules' || !!document.querySelector('#fx-claim'), null, { timeout: 15000 }); };
const opt = (p, k, v) => p.click(`[data-act=opt][data-k=${k}][data-v="${v}"]`);
// a free-play round, every flag right; `hintOn` is a flag number on which to take the continent hint first
async function round(p, { hintOn = 0 } = {}) {
  await opt(p, 'mode', 'free'); await opt(p, 'pool', 'world'); await p.click('[data-act=play]');
  for (let k = 1; k <= 10; k++) {
    if ((await st(p)).q.phase === 'wager') await p.click('[data-act=wager][data-v="0"]');
    if (k === hintOn) await p.click('[data-act=hint][data-id=continent]');
    await pickFlag(p, true);
    if (k !== hintOn) { await p.click('[data-act=bonus]'); await pickBonus(p, true); }
    await p.click('[data-act=next]');
  }
  await p.waitForTimeout(200);
}
const seed = (p, data) => p.evaluate(d => { for (const [k, v] of Object.entries(d)) localStorage.setItem(k, JSON.stringify(v)); }, data);
const fx = (p, fn, ...args) => p.evaluate(([f, a]) => window.__fx[f](...a), [fn, args]);
const POOL = await (await mk('pool')).evaluate(() => window.__fx.POOL);
const OCEANIA = await (await mk('cont')).evaluate(() => window.__fx.CONT_CODES[5]);
eq(POOL.length, 197, 'the world has 197 flags'); eq(OCEANIA.length, 14, 'Oceania has 14');

// ---- 1. one flag from a full passport: it is dealt, and naming it completes Oceania and the passport
const A = await mk('A'); const X = OCEANIA[3];
const earlier = Date.now() - 864e5;
await seed(A, { 'fx-passport': { alex: POOL.filter(a => a !== X) }, 'fx-marks': { alex: { c0: earlier, c1: earlier, c2: earlier, c3: earlier, c4: earlier } }, 'fx-cheered': { alex: ['c0', 'c1', 'c2', 'c3', 'c4'] }, 'fx-people': { alex: { name: 'Alex', avatar: '🦊' } } }); await A.reload(); await A.waitForTimeout(250);
await enter(A, 'Alex'); eq(JSON.stringify(await fx(A, 'stillMissing', 'Alex')), JSON.stringify([X]), 'one flag missing');
eq(JSON.stringify(await fx(A, 'achieved', 'Alex')), JSON.stringify(['c0', 'c1', 'c2', 'c3', 'c4']), 'five continents complete already');
await round(A);
let s = await st(A); assert(s.round.some(r => r.a2 === X), 'the last stretch deals the missing flag');
eq(JSON.stringify(s.feats), JSON.stringify(['c5', 'world']), 'Oceania and the whole passport complete together');
eq(await A.locator('[data-feat=c5]').count(), 1, 'Oceania announced'); eq(await A.locator('#fx-feat-world').count(), 1, 'the full passport announced');
assert(s.newExpert >= 1, 'the flag that completed the passport, named with no hints, already earns an expert star');
eq(await A.locator('#fx-cheer').count(), 1, 'the full passport takes the whole screen'); assert((await txt(A, '#fx-cheer')).includes('Gold passport!') && (await txt(A, '#fx-cheer')).includes('What\'s next: the Expert passport'), 'and explains what comes next');
eq(await A.evaluate(() => document.activeElement && document.activeElement.dataset.act), 'cheer-passport', 'its button has the focus');
await A.screenshot({ path: 'p8-gold-cheer.png' }); await A.click('[data-act=cheer-close]'); eq(await A.locator('#fx-cheer').count(), 0, 'Keep playing closes it');
assert((await txt(A, '#fx-stamp-note')).includes('1 new stamp · passport complete!'), 'the passport strip reports the last stamp');
await A.screenshot({ path: 'p1-passport-complete.png', fullPage: true }); await overflow(A, 'passport complete');
eq(JSON.stringify(Object.keys(await fx(A, 'newMarks', 'Alex'))), '[]', 'a milestone is celebrated once');
await A.click('[data-act=passport]'); eq(await A.locator('.pp-cover.gold').count(), 1, 'the cover turns gold'); assert((await txt(A, '.pp-cover')).includes('Every country stamped'), 'and says why');
assert((await txt(A, '.fx-band')).includes('expert stars'), 'the passport now counts expert stars'); await A.screenshot({ path: 'p2-gold-cover.png' });
await A.click('#pp-book'); await A.waitForTimeout(800); assert((await txt(A, '.pp-page')).includes('6 of 6 · 6 complete'), 'all six continents complete on the holder page');
assert((await txt(A, '.pp-page')).includes('Expert stars'), 'the holder page counts expert stars'); await A.screenshot({ path: 'p3-holder.png' });
for (let k = 0; k < 2; k++) { await A.click('[data-act=pp-next]'); await A.waitForTimeout(800); }
assert(/★ \d+ of 54/.test(await txt(A, '.pp-top')), 'continent pages show their expert stars'); await A.screenshot({ path: 'p6-continent-page.png' }); await A.click('[data-act=back]');
// a flag named after a hint earns no expert star
const before = await fx(A, 'experts', 'Alex'); await A.click('[data-act=again]');
s = await st(A); const hinted = s.round[0].a2;
await A.click('[data-act=hint][data-id=continent]'); await pickFlag(A, true); await A.click('[data-act=next]');
for (let k = 2; k <= 10; k++) { if ((await st(A)).q.phase === 'wager') await A.click('[data-act=wager][data-v="0"]'); await pickFlag(A, true); await A.click('[data-act=bonus]'); await pickBonus(A, true); await A.click('[data-act=next]'); }
const after = await fx(A, 'experts', 'Alex');
eq(after.includes(hinted), before.includes(hinted), 'a hinted flag gets no expert star'); assert(after.length > before.length, 'the other flags do');
await A.click('[data-act=choose]'); assert((await txt(A)).includes(`Passport · ★ ${after.length} of 197`), 'the passport link shows expert progress');
eq(await A.locator('#fx-cheer').count(), 0, 'the gold passport is not celebrated again');

// ---- 2. the expert passport: one star missing, dealt, and earned
const B = await mk('B'); const Y = POOL[100], t0 = Date.now() - 86400000;
await seed(B, { 'fx-passport': { robin: POOL }, 'fx-expert': { robin: POOL.filter(a => a !== Y) }, 'fx-marks': { robin: { c0: t0, c1: t0, c2: t0, c3: t0, c4: t0, c5: t0, world: t0 } }, 'fx-cheered': { robin: ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'world'] }, 'fx-people': { robin: { name: 'Robin', avatar: '🐙' } } });
await B.reload(); await B.waitForTimeout(250); await enter(B, 'Robin'); eq(JSON.stringify(await fx(B, 'stillMissing', 'Robin')), JSON.stringify([Y]), 'one expert star missing');
await round(B); s = await st(B); assert(s.round.some(r => r.a2 === Y), 'the missing star’s flag is dealt'); eq(JSON.stringify(s.feats), '["expert"]', 'the Expert passport completes');
eq(await B.locator('#fx-feat-expert').count(), 1, 'and is announced'); assert((await txt(B, '#fx-cheer')).includes('Expert passport complete'), 'on the whole screen');
await B.screenshot({ path: 'p9-expert-cheer.png' }); await B.click('[data-act=cheer-passport]'); eq((await st(B)).screen, 'passport', 'its button opens the passport'); await B.click('[data-act=back]');
await B.screenshot({ path: 'p4-expert-complete.png', fullPage: true }); await overflow(B, 'expert complete');
await B.click('[data-act=passport]'); assert((await txt(B, '.pp-cover')).includes('Expert · every flag mastered'), 'the gold cover says so');
assert(/197\s*of 197 expert stars/.test(await txt(B, '.fx-band')), 'all stars');

// ---- 3. the last stretch: within 20, three missing flags a round; further away, nothing changes
const D = await mk('D'); const gap = POOL.slice(20, 30);
await seed(D, { 'fx-passport': { casey: POOL.filter(a => !gap.includes(a)) }, 'fx-people': { casey: { name: 'Casey', avatar: '🦊' } } }); await D.reload(); await D.waitForTimeout(250); await enter(D, 'Casey');
await opt(D, 'mode', 'free'); await opt(D, 'pool', 'world');
for (let k = 0; k < 3; k++) {
  await D.click('[data-act=play]'); s = await st(D);
  assert(s.round.filter(r => gap.includes(r.a2)).length >= 3, `round ${k + 1}: at least three of the ten missing flags`); eq(new Set(s.round.map(r => r.a2)).size, 10, 'no flag twice');
  await D.click('[data-act=end-early]'); await D.click('[data-act=end-early]'); await D.click('[data-act=choose]'); await opt(D, 'mode', 'free'); await opt(D, 'pool', 'world');
}
await seed(D, { 'fx-passport': { casey: POOL.slice(40) } });
eq((await fx(D, 'stillMissing', 'Casey')).length, 40, 'forty missing');

// ---- 4. pass and play: a milestone reached in a group game is named on the result
const E = await mk('E'); await enter(E, 'Alex'); await opt(E, 'mode', 'party'); await E.fill('.fx-guest', 'Robin'); await E.click('[data-act=play]');
const hand = await E.evaluate(() => window.__fx.match.seats[0].S.round.map(r => r.a2));
await seed(E, { 'fx-passport': { alex: POOL.filter(a => !hand.includes(a)) } });
for (let k = 0; k < 10; k++) {
  await E.click('[data-act=ready]'); if ((await st(E)).q.phase === 'wager') await E.click('[data-act=wager][data-v="0"]');
  await pickFlag(E, true); if (await E.locator('[data-act=bonus]').count()) { await E.click('[data-act=bonus]'); await pickBonus(E, true); }
  await E.click('[data-act=next]');
}
await E.waitForTimeout(200); eq((await st(E)).screen, 'match', 'the group game ends');
assert((await txt(E, '#fx-match-feats')).includes('Alex completed') && (await txt(E, '#fx-match-feats')).includes('the passport'), 'the milestone is named on the result'); assert(!(await txt(E, '#fx-match-feats')).includes('Africa'), 'without listing every continent');
await E.screenshot({ path: 'p5-match-feats.png', fullPage: true }); await overflow(E, 'match feats');

// ---- 5. the family: stars and milestones go up with the player, come down on another device, and reach the day summary
const join = async (p, code) => { await p.click('[data-act=family]'); await p.fill('#fx-code', code); await p.click('#fx-join-btn'); await p.waitForSelector('#fx-code-shown'); await p.waitForFunction(() => !window.__fx.cloudState.busy); await p.click('[data-act=back]'); };
const F = await mk('F', { cloud: true }); const tWorld = new Date('2026-10-12T15:00:00').getTime();
await seed(F, { 'fx-passport': { morgan: POOL }, 'fx-expert': { morgan: POOL.slice(0, 7) }, 'fx-marks': { morgan: { c0: tWorld - 9e7, c1: tWorld, c2: tWorld, c3: tWorld, c4: tWorld, c5: tWorld, world: tWorld } }, 'fx-people': { morgan: { name: 'Morgan', avatar: '🐢' } },
  'fx-days': { '2026-10-11': [{ name: 'Morgan', avatar: '🐢', score: 900, streak: 3, clock: false, perfect: false, t: tWorld - 9e7 }], '2026-10-12': [{ name: 'Morgan', avatar: '🐢', score: 700, streak: 2, clock: false, perfect: false, t: tWorld }] } });
await F.reload(); await F.waitForTimeout(250); await join(F, 'passport-family'); await enter(F, 'Morgan'); await F.evaluate(() => window.__fx.cloudSync()); await F.waitForFunction(() => !window.__fx.cloudState.busy);
const fid = (await F.evaluate(() => window.__fx.family())).fid, doc = mock.plain(mock.docs.get(`families/${fid}/players/morgan`));
eq(doc.perfect.filter(c => c.startsWith('x|')).length, 7, 'expert stars reach the family'); assert(doc.perfect.includes(`m|world|${tWorld}`), 'the milestone reaches the family with its moment');
const G = await mk('G', { cloud: true }); await join(G, 'passport-family'); await G.fill('#fx-name', 'morgan'); await G.click('#fx-setup [type=submit]'); await G.waitForSelector('#fx-claim'); await G.click('#fx-claim [type=submit]');
await G.waitForFunction(() => window.__fx.state.screen === 'rules'); await G.waitForFunction(() => !window.__fx.cloudState.busy);
eq((await fx(G, 'experts', 'Morgan')).length, 7, 'the stars come down on another device'); eq(await fx(G, 'passportDone', 'Morgan'), true, 'with the full passport');
eq(JSON.stringify(await fx(G, 'newMarks', 'Morgan')), '[]', 'and the milestones, so they are not counted again');
await G.waitForSelector('#fx-cheer'); assert((await txt(G, '#fx-cheer')).includes('Gold passport!'), 'a device that never celebrated it shows it once');
await G.click('[data-act=cheer-close]'); await G.evaluate(() => window.__fx.cloudSync()); await G.waitForFunction(() => !window.__fx.cloudState.busy); await G.waitForTimeout(200); eq(await G.locator('#fx-cheer').count(), 0, 'and only once');
const feats = await fx(F, 'featsOn', '2026-10-12'); eq(feats.map(x => x.key).join(), 'world', 'a full passport on the day is reported on its own, without the continents it finished');
const H = await mk('H', { cloud: true }); await join(H, 'passport-family'); await H.evaluate(() => window.__fx.cloudSync()); await H.waitForFunction(() => !window.__fx.cloudState.busy);
const people = await fx(H, 'featsOn', '2026-10-11'); eq(people.map(x => `${x.name} ${x.key}`).join(), 'Morgan c0', 'a device that never had the player still knows its milestones');
const text = await F.evaluate(() => window.__fx.dayText('2026-10-11'));
assert(text.includes('🗺️ Morgan completed Africa!'), 'the day summary names the milestone: ' + text.split('\n').slice(0, 6).join(' / '));

// ---- 6. a missed celebration: a passport completed before this version, and stamps that arrive from another device
const K = await mk('K'); const tK = Date.now() - 2 * 864e5;
await seed(K, { 'fx-passport': { boo: POOL }, 'fx-marks': { boo: { c0: tK, c1: tK, c2: tK, c3: tK, c4: tK, c5: tK, world: tK } }, 'fx-people': { boo: { name: 'Boo', avatar: '🐝' } } });
await K.evaluate(() => localStorage.removeItem('fx-cheered')); await K.reload(); await K.waitForTimeout(250);
eq(JSON.stringify(await K.evaluate(() => JSON.parse(localStorage.getItem('fx-cheered')))), JSON.stringify({ boo: ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'] }), 'on first run, continents already reached count as celebrated, the full passport does not');
await enter(K, 'Boo'); await K.waitForSelector('#fx-cheer'); assert((await txt(K, '#fx-cheer')).includes('Gold passport!'), 'a full passport finished before this version is celebrated when the player next chooses a game');
assert(!(await txt(K, '#fx-cheer')).includes('Africa'), 'without listing the continents'); await K.waitForTimeout(700); await K.screenshot({ path: 'p10-catch-up.png' }); await overflow(K, 'catch-up');
await K.click('[data-act=cheer-close]'); await K.click('[data-act=rules-back]'); await enter(K, 'Boo'); eq(await K.locator('#fx-cheer').count(), 0, 'once only');
// continents reached through a sync are celebrated too
const L = await mk('L'); await seed(L, { 'fx-passport': { tara: OCEANIA }, 'fx-marks': { tara: { c5: Date.now() } }, 'fx-cheered': { tara: [] }, 'fx-people': { tara: { name: 'Tara', avatar: '🦉' } } }); await L.reload(); await L.waitForTimeout(250);
await enter(L, 'Tara'); await L.waitForSelector('#fx-cheer'); assert((await txt(L, '#fx-cheer')).includes('Oceania complete'), 'a continent completed elsewhere is celebrated'); assert((await txt(L, '#fx-cheer')).includes('14 of 197 countries so far'), 'with the passport so far');
await L.waitForTimeout(700); await L.screenshot({ path: 'p11-continent-cheer.png' }); await L.click('[data-act=cheer-close]');

// ---- 7. the passport strip, the countdown from 75 to go, and the one-time introduction
const M2 = await mk('M2'); const note = (have, s) => M2.evaluate(([h, st]) => { localStorage.setItem('fx-passport', JSON.stringify({ casey: window.__fx.POOL.slice(0, h) })); const el = document.createElement('div'); el.innerHTML = window.__fx.stampNote(st, 'Casey'); return el.textContent.replace(/\s+/g, ' ').trim(); }, [have, s]);
const base = { practice: false, done0: false, newStamps: 2, newExpert: 0, intro: false };
assert((await note(123, { ...base, left0: 76 })).includes('74 stamps to go for a gold passport!'), 'crossing 75 to go is announced: ' + await note(123, { ...base, left0: 76 }));
assert(!(await note(124, { ...base, left0: 75 })).includes('to go'), 'within the same five, nothing more');
assert((await note(127, { ...base, left0: 72 })).includes('70 stamps to go'), 'each five crossed is announced');
assert(!(await note(100, { ...base, left0: 99 })).includes('to go'), 'further away than 75, no countdown');
assert((await note(180, { ...base, left0: 19 })).includes('Only 17 to go for a gold passport'), 'the last stretch shows every round');
assert((await note(50, { ...base, left0: 149 })).includes('2 new stamps') && (await note(50, { ...base, left0: 149 })).includes('50 of 197'), 'the strip counts new stamps and the passport');
assert((await note(50, { ...base, left0: 147, newStamps: 0 })).includes('No new stamps this round'), 'and says when there are none');
assert((await note(50, { ...base, left0: 149, intro: true })).includes('Every flag you name earns a stamp in your passport'), 'the introduction');
eq(await note(50, { ...base, practice: true }), '', 'no strip on a practice replay');
eq(await M2.evaluate(() => { localStorage.setItem('fx-passport', JSON.stringify({ casey: window.__fx.POOL.slice(0, 128) })); return window.__fx.ppLinkText('Casey'); }), '69 to go', 'the passport link counts down from 75');
eq(await M2.evaluate(() => { localStorage.setItem('fx-passport', JSON.stringify({ casey: window.__fx.POOL.slice(0, 100) })); return window.__fx.ppLinkText('Casey'); }), '100 of 197', 'and shows progress before that');
// a real round: the strip and the introduction on the results screen, once
await M2.evaluate(() => localStorage.setItem('fx-passport', '{}')); await enter(M2, 'Casey'); await round(M2);
assert((await txt(M2, '#fx-pstrip')).includes('10 new stamps') && (await txt(M2, '#fx-pp-intro')).includes('gold passport'), 'the first round shows the strip and the introduction');
await M2.screenshot({ path: 'p12-strip-intro.png', fullPage: true }); await overflow(M2, 'strip');
await M2.click('#fx-pstrip'); eq((await st(M2)).screen, 'passport', 'the strip opens the passport'); await M2.click('[data-act=back]');
await M2.click('[data-act=choose]'); await round(M2); eq(await M2.locator('#fx-pp-intro').count(), 0, 'the introduction is shown once');

await browser.close(); mock.close();
console.log(errors.length ? errors.join('\n') : 'PASSPORT CHECKS PASSED');
