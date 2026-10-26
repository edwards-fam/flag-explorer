// More than one group on a device: a family and a circle of friends, each with its own code and scoreboard.
// Today's challenge counts in every group; a group only receives what was played after the device joined it.
import { chromium } from 'playwright';
import path from 'path';
import { startMock } from './mock-firestore.mjs';
const url = 'file://' + path.resolve('test.html');
const mock = await startMock();
const browser = await chromium.launch({ executablePath: process.env.FX_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [], assert = (c, m) => { if (!c) errors.push('ASSERT ' + m); }, eq = (a, b, m) => assert(a === b, `${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const DAY = '2026-10-27';
async function device(label, width = 390) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2 }), p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`pageerror(${label}) ${e.message}`));
  await p.addInitScript(cfg => { window.FX_CLOUD = cfg; }, { projectId: 'demo', apiKey: 'test-key', base: mock.base });
  await p.clock.setFixedTime(new Date(`${DAY}T12:00:00`)); await p.goto(url); await p.waitForTimeout(250);
  return p;
}
const st = p => p.evaluate(() => JSON.parse(JSON.stringify(window.__fx.state)));
const txt = (p, sel = '#app') => p.textContent(sel);
const settle = async p => { await p.waitForFunction(() => !window.__fx.cloudState.busy, null, { timeout: 20000 }); await p.waitForTimeout(80); };
const sync = async p => { await p.evaluate(() => window.__fx.cloudSync()); await settle(p); };
const enter = async (p, name) => { await p.fill('#fx-name', name); await p.click('#fx-setup [type=submit]'); await p.waitForFunction(() => window.__fx.state.screen === 'rules' || !!document.querySelector('#fx-claim'), null, { timeout: 15000 }); };
const pickFlag = async (p, right) => { const s = await st(p); const i = right ? s.q.options.indexOf(s.q.a2) : s.q.options.findIndex(o => o !== s.q.a2 && !s.q.out.includes(o)); await p.locator('#fx-panel .fx-opt').nth(i).click(); };
const pickBonus = async p => { const s = await st(p); await p.locator('#fx-panel .fx-opt').nth(s.q.bonus.answer).click(); };
const overflow = async (p, label) => { const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })); if (o.sw > o.iw) errors.push(`overflow at ${label}: ${o.sw}>${o.iw}`); };
async function round(p, mode, miss = 0) {
  await p.click(`[data-act=opt][data-k=mode][data-v=${mode}]`); if (mode === 'free') await p.click('[data-act=opt][data-k=clock][data-v=false]'); await p.click('[data-act=play]');
  for (let k = 1; k <= 10; k++) {
    if ((await st(p)).q.phase === 'wager') await p.click('[data-act=wager][data-v="0"]');
    await pickFlag(p, k !== miss); if (k !== miss) { await p.click('[data-act=bonus]'); await pickBonus(p); }
    await p.click('[data-act=next]');
  }
  await settle(p); return (await st(p)).score;
}
const typed = r => ({ name: { stringValue: r.name }, avatar: { stringValue: r.avatar || '🦊' }, score: { integerValue: String(r.score) }, streak: { integerValue: '0' }, clock: { booleanValue: false }, perfect: { booleanValue: false }, t: { integerValue: String(r.t) } });
const putDay = (fid, day, r) => mock.docs.set(`families/${fid}/days/${day}/entries/${r.name.toLowerCase()}`, { fields: typed(r), createTime: 'x', updateTime: 'x' });
const dayDoc = (fid, day, pid) => { const d = mock.docs.get(`families/${fid}/days/${day}/entries/${pid}`); return d ? mock.plain(d) : null; };
const tableDocs = (fid, table) => [...mock.docs.keys()].filter(k => k.startsWith(`families/${fid}/tables/${table}/entries/`));
const openFamily = async p => { if ((await st(p)).screen === 'family') return; if ((await st(p)).screen === 'end') await p.click('[data-act=choose]'); if (!(await p.locator('[data-act=family]').count())) await p.click('[data-act=rules-back]'); await p.click('[data-act=family]'); await p.waitForSelector('#fx-join, #fx-code-shown'); };
const joinFirst = async (p, code) => { await openFamily(p); await p.fill('#fx-code', code); await p.click('#fx-join-btn'); await p.waitForSelector('#fx-code-shown'); await settle(p); await p.click('[data-act=back]'); };
const joinMore = async (p, code, name) => { await openFamily(p); await p.fill('#fx-code', code); if (name) await p.fill('#fx-gname', name); await p.click('#fx-join-btn'); await settle(p); };

// ---- 1. a device from before groups: its one family becomes its first group, nothing is sent again
const A = await device('A');
const famFid = await A.evaluate(async () => { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('flag-explorer/family/edwards-test')); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32); });
const t0 = new Date(`${DAY}T08:00:00`).getTime();
await A.evaluate(([fid, t]) => {
  localStorage.setItem('fx-family', JSON.stringify({ code: 'edwards-test', fid }));
  localStorage.setItem('fx-tables', JSON.stringify({ world: [{ name: 'Alex', avatar: '🦊', score: 900, streak: 2, clock: false, t }] }));
  localStorage.setItem('fx-synced', JSON.stringify({ fid, ids: [`world/alex|${t}`] }));
  localStorage.setItem('fx-cloud', JSON.stringify({ fid, at: 1, world: [{ name: 'Casey', avatar: '🐢', score: 1500, t: 5 }], known: [] }));
  localStorage.setItem('fx-people', JSON.stringify({ alex: { name: 'Alex', avatar: '🦊' } }));
  localStorage.setItem('fx-player', JSON.stringify({ name: 'Alex', avatar: '🦊' }));
  localStorage.removeItem('fx-groups');
}, [famFid, t0]);
mock.docs.set(`families/${famFid}/tables/world/entries/casey_5`, { fields: typed({ name: 'Casey', score: 1500, t: 5 }), createTime: 'x', updateTime: 'x' });
await A.reload(); await A.waitForTimeout(250);
const g1 = await A.evaluate(() => JSON.parse(localStorage.getItem('fx-groups')));
eq(g1.length, 1, 'one group after the update'); eq(g1[0].name, 'Family', 'called Family'); eq(g1[0].since, 0, 'and everything already played still belongs to it');
eq(await A.evaluate(fid => !!localStorage.getItem('fx-cloud@' + fid) && localStorage.getItem('fx-cloud'), famFid), 'null', 'what the device had fetched is kept under the group');
eq((await A.evaluate(() => window.__fx.tableRows('world'))).map(r => r.name).join(), 'Casey,Alex', 'the family table still shows straight away');
const writesBefore = mock.log.filter(l => l.startsWith('WRITE') && l.includes('/tables/')).length; await sync(A);
eq(mock.log.filter(l => l.startsWith('WRITE') && l.includes('/tables/')).length, writesBefore, 'a score already sent is not sent again');
assert((await txt(A)).includes('Family scoreboard on'), 'one group looks as before');
await openFamily(A); assert((await txt(A)).includes('Family scoreboard') && (await txt(A)).includes('Play with another group too'), 'the family screen offers another group');
eq(await A.locator('#fx-gname').count(), 1, 'with a name for it'); await A.screenshot({ path: 'g1-family-one.png', fullPage: true }); await overflow(A, 'family one');

// ---- 2. joining a second group
await A.fill('#fx-code', 'edwards-test'); await A.click('#fx-join-btn'); assert((await txt(A, '#fx-code-err')).includes('already in that group'), 'the same code twice is refused');
await A.fill('#fx-code', 'golf-buddies-test'); await A.fill('#fx-gname', 'Golf buddies'); await A.click('#fx-join-btn'); await settle(A);
const gs = await A.evaluate(() => JSON.parse(localStorage.getItem('fx-groups'))), golfFid = gs[1].fid;
eq(gs.map(g => g.name).join(), 'Family,Golf buddies', 'two groups'); assert(gs[1].since > 0, 'the new group starts now');
eq(await A.evaluate(() => window.__fx.family().name), 'Golf buddies', 'the new group is the one on show');
assert((await txt(A, '.fx-band')).includes('Your groups') && (await txt(A, '.fx-band')).includes('This device plays in 2'), 'the screen lists the groups');
eq(await A.locator('#fx-groups .fx-group').count(), 2, 'both groups listed'); eq((await txt(A, '#fx-groups .fx-group.on')).includes('Golf buddies'), true, 'the one on show is marked');
eq(tableDocs(golfFid, 'world').length, 0, 'scores from before joining stay out of the new group');
await A.screenshot({ path: 'g2-groups.png', fullPage: true }); await overflow(A, 'groups');
await A.click('[data-act=back]'); assert((await txt(A)).includes('Your 2 groups'), 'the first screen says so');

// ---- 3. Today's challenge counts in both; free play after joining goes to both
putDay(famFid, DAY, { name: 'Casey', score: 1200, t: t0 + 1 }); putDay(golfFid, DAY, { name: 'Robin', score: 800, t: t0 + 2 });
await A.click('#fx-setup [type=submit]'); await A.waitForFunction(() => window.__fx.state.screen === 'rules');
const score = await round(A, 'daily'); await sync(A);
eq(dayDoc(famFid, DAY, 'alex') && dayDoc(famFid, DAY, 'alex').score, score, 'the challenge reaches the family'); eq(dayDoc(golfFid, DAY, 'alex') && dayDoc(golfFid, DAY, 'alex').score, score, 'and the golf group');
await A.click('[data-act=choose]'); await round(A, 'free'); await sync(A);
eq(tableDocs(golfFid, 'world').length + tableDocs(golfFid, 'known').length, 1, 'a free-play score after joining goes to the new group');
eq(tableDocs(famFid, 'world').length + tableDocs(famFid, 'known').length, 2, 'and to the family (next to Casey’s)');

// ---- 4. the tables show one group at a time, with a switch between them
await A.click('[data-act=board]'); await A.click('[data-act=tab][data-v=daily]'); await settle(A);
eq(await A.locator('#fx-group-pick .fx-gpick').count(), 2, 'a switch for the two groups'); assert((await txt(A, '.fx-band')).includes('Golf buddies'), 'the heading names the group');
let today = await A.evaluate(() => window.__fx.tableRows('daily').map(r => r.name).join());
eq(today, 'Alex,Robin', 'the golf group’s today: its own players only');
await A.screenshot({ path: 'g3-board-golf.png', fullPage: true }); await overflow(A, 'board golf');
await A.click(`#fx-group-pick [data-v="${famFid}"]`); await settle(A);
today = await A.evaluate(() => window.__fx.tableRows('daily').map(r => r.name).join()); eq(today, 'Alex,Casey', 'switching shows the family’s today');
assert((await txt(A, '.fx-band')).includes('Family'), 'and names it'); eq(await A.locator(`#fx-group-pick [data-v="${famFid}"][aria-pressed=true]`).count(), 1, 'the switch shows which');
await A.click('[data-act=back]');

// ---- 5. daily wins and the copied results belong to the group on show
putDay(famFid, '2026-10-26', { name: 'Casey', score: 1500, t: t0 - 864e5 }); putDay(golfFid, '2026-10-26', { name: 'Robin', score: 700, t: t0 - 864e5 + 1 });
const fresh = p => p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('fx-cloud-days@')).forEach(k => localStorage.setItem(k, 'null')));      // the test's clock stands still, so cached days never age
await fresh(A); await sync(A);
eq(await A.evaluate(() => window.__fx.winsTable('2026-10').map(e => e.name).join()), 'Casey', 'the family’s wins');
const famText = await A.evaluate(() => window.__fx.dayText('2026-10-26')); assert(famText.startsWith('🌍 Flag Explorer · Family'), 'the copied results name the group: ' + famText.split('\n')[0]);
await A.evaluate(fid => window.__fx.showGroup(fid), golfFid); await fresh(A); await sync(A);
eq(await A.evaluate(() => window.__fx.winsTable('2026-10').map(e => e.name).join()), 'Robin', 'the golf group’s wins');

// ---- 6. a second device: the player who played the challenge elsewhere is known in every group
const B = await device('B'); await joinFirst(B, 'golf-buddies-test');
await enter(B, 'Alex'); assert((await txt(B, '#fx-claim')).includes('already plays in your family'), 'one group on this device: worded as before');
await B.click('#fx-claim [type=submit]'); await B.waitForFunction(() => window.__fx.state.screen === 'rules'); await settle(B);
assert(!!(await B.evaluate(() => window.__fx.playedToday('Alex'))), 'today’s challenge already played on the other device');
assert((await txt(B)).includes('Playing again is practice'), 'so it is practice here');
// a name found only in the other group is named with that group
mock.docs.set(`families/${famFid}/players/casey`, { fields: { name: { stringValue: 'Casey' }, avatar: { stringValue: '🐢' }, stamps: { arrayValue: { values: [{ stringValue: 'FR' }] } } }, createTime: 'x', updateTime: 'x' });
await B.click('[data-act=rules-back]'); await B.click('[data-act=family]'); await B.fill('#fx-code', 'edwards-test'); await B.fill('#fx-gname', 'The Edwards'); await B.click('#fx-join-btn'); await settle(B);
eq(await B.evaluate(() => JSON.parse(localStorage.getItem('fx-groups')).map(g => g.name).join()), 'Family,The Edwards', 'a named second group');
await B.evaluate(fid => window.__fx.showGroup(fid), golfFid); await B.click('[data-act=back]');
await B.fill('#fx-name', 'Casey'); await B.click('#fx-setup [type=submit]'); await B.waitForSelector('#fx-claim');
assert((await txt(B, '#fx-claim')).includes('already plays in The Edwards'), 'a player found in the other group is named with it: ' + (await txt(B, '#fx-claim')).slice(0, 80));
await B.click('[data-act=claim-no]');

// ---- 7. leaving one group keeps the other
await openFamily(A); await A.click(`[data-act=family-leave][data-v="${golfFid}"]`); assert((await txt(A)).includes('Tap again to leave'), 'leaving asks twice');
await A.click(`[data-act=family-leave][data-v="${golfFid}"]`); await settle(A);
eq(await A.evaluate(() => JSON.parse(localStorage.getItem('fx-groups')).map(g => g.name).join()), 'Family', 'one group left'); eq(await A.evaluate(() => window.__fx.family().name), 'Family', 'and it is on show');
eq(await A.evaluate(fid => localStorage.getItem('fx-cloud@' + fid), golfFid), 'null', 'the left group’s copy is cleared');
assert((await txt(A, '.fx-band')).includes('Family scoreboard'), 'back to the one-group screen');

// a narrow phone with three long group names
const N = await device('N', 320); await joinFirst(N, 'narrow-one'); await joinMore(N, 'narrow-two', 'The Saturday morning crew'); await joinMore(N, 'narrow-three', 'Office lunch table');
await N.screenshot({ path: 'g4-narrow-groups.png', fullPage: true }); await overflow(N, 'narrow groups');
await N.click('[data-act=back]'); await N.click('[data-act=board]'); await N.screenshot({ path: 'g5-narrow-board.png', fullPage: true }); await overflow(N, 'narrow board');

await browser.close(); mock.close();
console.log(errors.length ? errors.join('\n') : 'GROUPS CHECKS PASSED');
