// Daily wins: who has won Today's challenge most often. Days are moved along by setting the browser's date.
import { chromium } from 'playwright';
import path from 'path';
import { startMock } from './mock-firestore.mjs';
const url = 'file://' + path.resolve('test.html');
const mock = await startMock();
const browser = await chromium.launch({ executablePath: process.env.FX_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [], assert = (c, m) => { if (!c) errors.push('ASSERT ' + m); }, eq = (a, b, m) => assert(a === b, `${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const setDay = (p, day, time = '12:00:00') => p.clock.setFixedTime(new Date(`${day}T${time}`));
async function device(label, cloud, day, width = 390) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2 }), p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`pageerror(${label}) ${e.message}`));
  if (cloud) await p.addInitScript(cfg => { window.FX_CLOUD = cfg; }, { projectId: 'demo', apiKey: 'test-key', base: mock.base });
  await setDay(p, day); await p.goto(url); await p.waitForTimeout(250);
  return p;
}
const st = p => p.evaluate(() => JSON.parse(JSON.stringify(window.__fx.state)));
const txt = (p, sel = '#app') => p.textContent(sel);
const settle = async p => { await p.waitForFunction(() => !window.__fx.cloudState.busy, null, { timeout: 20000 }); await p.waitForTimeout(60); };
const sync = async p => { await p.evaluate(() => window.__fx.cloudSync()); await settle(p); };
const join = async (p, code) => { await p.click('[data-act=family]'); await p.fill('#fx-code', code); await p.click('#fx-join-btn'); await p.waitForSelector('#fx-code-shown'); await settle(p); await p.click('[data-act=back]'); };
const enter = async (p, name) => { await p.fill('#fx-name', name); await p.click('#fx-setup [type=submit]'); await p.waitForFunction(() => window.__fx.state.screen === 'rules' || !!document.querySelector('#fx-claim'), null, { timeout: 15000 }); };
const pickFlag = async (p, right) => { const s = await st(p); const i = right ? s.q.options.indexOf(s.q.a2) : s.q.options.findIndex(o => o !== s.q.a2 && !s.q.out.includes(o)); await p.locator('#fx-panel .fx-opt').nth(i).click(); };
const pickBonus = async (p, right) => { const s = await st(p); await p.locator('#fx-panel .fx-opt').nth(right ? s.q.bonus.answer : (s.q.bonus.answer + 1) % 4).click(); };
async function daily(p, miss = 0) {
  await p.click('[data-act=opt][data-k=mode][data-v=daily]'); await p.click('[data-act=play]');
  for (let k = 1; k <= 10; k++) {
    if ((await st(p)).q.phase === 'wager') await p.click('[data-act=wager][data-v="0"]');
    await pickFlag(p, k !== miss);
    if (k !== miss) { await p.click('[data-act=bonus]'); await pickBonus(p, true); }
    await p.click('[data-act=next]');
  }
  await settle(p); return (await st(p)).score;
}
const wins = (p, span) => p.evaluate(s => window.__fx.winsTable(s).map(e => `${e.place} ${e.name} ${e.wins}/${e.played}`).join(' | '), span);
const overflow = async (p, label) => { const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })); if (o.sw > o.iw) errors.push(`overflow at ${label}: ${o.sw}>${o.iw}`); };
const openWins = async p => { await p.click('[data-act=board]'); await p.click('[data-act=tab][data-v=wins]'); };
const row = (name, score, t) => ({ name, avatar: '🦊', score, streak: 0, clock: false, perfect: false, t });

// ---- 1. one device, no family: the day's top score becomes a win once the day is over
const L = await device('L', false, '2026-10-14');
eq(await L.evaluate(() => new Date().toDateString()), 'Wed Oct 14 2026', 'the test controls the date');
await enter(L, 'Alex'); const aScore = await daily(L); eq(aScore, 1680, 'Alex plays a perfect challenge');
await L.click('[data-act=change-player]'); await enter(L, 'Robin'); const rScore = await daily(L, 3); assert(rScore < aScore, 'Robin scores less');
await L.click('[data-act=board]'); eq(await L.locator('[data-act=tab]').count(), 4, 'four tables to choose from');
await L.click('[data-act=tab][data-v=wins]'); eq(await L.locator('#fx-wins .fx-hrow:not(.empty)').count(), 0, 'no wins while the day is still running');
assert((await txt(L, '#fx-wins-foot')).includes('No finished days in October yet'), 'and says so'); eq(await L.locator('#fx-days').count(), 0, 'no recent winners yet');
assert((await txt(L, '.fx-band')).includes('Daily wins'), 'heading names the table'); await L.screenshot({ path: 'v1-wins-empty.png', fullPage: true }); await overflow(L, 'wins empty');

await setDay(L, '2026-10-15'); await L.reload(); await L.waitForTimeout(250);
eq(await wins(L, '2026-10'), '1 Alex 1/1 | 2 Robin 0/1', 'the next day, yesterday’s top score has a win');
eq(await L.evaluate(() => window.__fx.tableRows('daily').length), 0, 'and today’s table has started again');
await openWins(L); eq(await L.locator('#fx-wins .fx-hrow:not(.empty)').count(), 2, 'both players listed');
eq((await txt(L, '#fx-wins-foot')).trim(), 'Alex leads October with 1 win.', 'leader named'); eq(await L.locator('#fx-days .fx-day').count(), 1, 'one recent winner');
assert((await txt(L, '#fx-days')).includes('Wed 14 Oct') && (await txt(L, '#fx-days')).includes('Alex') && (await txt(L, '#fx-days')).includes('1,680'), 'with the day, the name and the score');

// ties, a day with one player, and an earlier month
await L.evaluate(rows => { const all = JSON.parse(localStorage.getItem('fx-days'));
  Object.assign(all, rows); localStorage.setItem('fx-days', JSON.stringify(all)); }, {
  '2026-10-12': [row('Alex', 900, 1), row('Robin', 900, 2)],                       // a tie: a win each
  '2026-10-13': [row('Robin', 300, 3)],                                              // alone: still a win
  '2026-09-28': [row('Casey', 1000, 4), row('Alex', 800, 5)], '2026-09-29': [row('Casey', 500, 6)], '2026-09-30': [row('Casey', 0, 7), row('Robin', 0, 8)],
  '2026-10-15': [row('Morgan', 2000, 9)], '2026-10-16': [row('Morgan', 2000, 10)] });   // today and tomorrow never count
await L.reload(); await L.waitForTimeout(250);
eq(await wins(L, '2026-10'), '1 Robin 2/3 | 1 Alex 2/2', 'October: a tie gives each a win, a lone player wins, equal wins share first place');
eq(await wins(L, '2026-09'), '1 Casey 3/3 | 2 Robin 1/1 | 3 Alex 0/1', 'September: a tie on zero still counts for both');
eq(await wins(L, 'all'), '1 Robin 3/4 | 1 Casey 3/3 | 3 Alex 2/3', 'all time adds the months together; third place follows a shared first');
await openWins(L); eq((await txt(L, '#fx-wins-foot')).trim(), 'Robin and Alex share the lead with 2 wins each.', 'shared lead worded');
eq((await txt(L, '#fx-wins-last')).trim(), 'September went to Casey with 3 wins.', 'last month’s winner stays in view');
eq(await L.locator('#fx-days .fx-day').count(), 6, 'recent winners listed'); assert((await L.locator('#fx-days .fx-day').nth(2).textContent()).includes('Alex') && (await L.locator('#fx-days .fx-day').nth(2).textContent()).includes('Robin'), 'a tied day names both');
eq((await L.locator('#fx-wins .fx-hrank').allTextContents()).join(), '1st,1st', 'equal wins show the same place');
await L.screenshot({ path: 'v2-wins-month.png', fullPage: true }); await overflow(L, 'wins month');
await L.click('[data-act=span][data-v=all]'); eq((await txt(L, '#fx-wins-foot')).trim(), 'Robin and Casey share the lead with 3 wins each.', 'all-time view');
eq(await L.locator('#fx-wins-last').count(), 0, 'no last-month line on the all-time view'); eq((await L.locator('#fx-wins .fx-hrank').allTextContents()).join(), '1st,1st,3rd', 'places on the all-time view');
await L.screenshot({ path: 'v3-wins-all.png', fullPage: true }); await overflow(L, 'wins all');
// starting fresh clears the wins too
await L.click('#fx-wipe'); await L.click('#fx-wipe'); eq(await wins(L, 'all'), '', 'start fresh clears the daily wins');

// a narrow phone with long names and the larger text
const N = await device('N', false, '2026-10-15', 320);
await N.evaluate(rows => { localStorage.setItem('fx-days', JSON.stringify(rows)); localStorage.setItem('fx-text', 'true'); }, { '2026-10-13': [row('Bartholomew W', 1680, 1), row('Maximiliana Jo', 1680, 2), row('Al', 100, 3)], '2026-10-14': [row('Maximiliana Jo', 2200, 4)] });
await N.reload(); await N.waitForTimeout(250); await openWins(N); await N.screenshot({ path: 'v4-wins-narrow.png', fullPage: true }); await overflow(N, 'wins on a narrow phone with larger text');

// ---- 2. a family: the standings come from the family's days, the same on every device
const A = await device('A', true, '2026-10-20'); await join(A, 'wins-code-1');
const fid = (await A.evaluate(() => window.__fx.family())).fid;
const typed = r => ({ name: { stringValue: r.name }, avatar: { stringValue: r.avatar }, score: { integerValue: String(r.score) }, streak: { integerValue: '0' }, clock: { booleanValue: false }, perfect: { booleanValue: false }, t: { integerValue: String(r.t) } });
const put = (day, r) => mock.docs.set(`families/${fid}/days/${day}/entries/${r.name.toLowerCase()}`, { fields: typed(r), createTime: 'x', updateTime: 'x' });
put('2026-10-17', row('Alex', 1500, 11)); put('2026-10-17', row('Robin', 1200, 12)); put('2026-10-18', row('Robin', 1000, 13));
put('2026-10-19', row('Alex', 1100, 14)); put('2026-10-19', row('Robin', 1100, 15)); put('2026-10-19', row('Morgan', 400, 16));
put('2026-10-20', row('Morgan', 2300, 17));                                         // today: not counted yet
const dayGets = () => mock.log.filter(l => /^GET families\/[0-9a-f]+\/days\//.test(l) && !l.includes('/days/2026-10-20/') && !l.includes('/days/2026-10-21/')).length;
let before = dayGets(); await setDay(A, '2026-10-20', '12:06:00'); await sync(A);
eq(await wins(A, '2026-10'), '1 Robin 2/3 | 1 Alex 2/2 | 3 Morgan 0/1', 'the family’s finished days are counted');
eq(dayGets() - before, 4, 'only the days that can still change are fetched again');     // joining fetched all nine; days up to the 15th are settled
before = dayGets(); await sync(A); eq(dayGets() - before, 0, 'and not again a moment later');
await A.click('[data-act=board]'); await A.click('[data-act=tab][data-v=daily]'); assert((await txt(A)).includes('The top score at midnight wins the day'), 'today’s table says how the day is won'); await A.click('[data-act=back]');
await openWins(A); assert((await txt(A, '.fx-band')).includes('your family'), 'labelled as the family’s'); assert((await txt(A, '#fx-cloud-note')).includes('Shared with your family'), 'status line on the wins table');
await A.screenshot({ path: 'v5-wins-family.png', fullPage: true }); await A.click('[data-act=back]');
const B = await device('B', true, '2026-10-20'); await join(B, 'wins-code-1');
eq(await wins(B, 'all'), await wins(A, 'all'), 'a second device works out the same standings');
const other = await device('O', true, '2026-10-20'); await join(other, 'another-family'); eq(await wins(other, 'all'), '', 'another family sees none of it');

// a challenge played with no connection still counts once the device is back, even after midnight
const C = await device('C', true, '2026-10-20'); await join(C, 'wins-code-1');
await C.evaluate(rows => localStorage.setItem('fx-days', JSON.stringify(rows)), { '2026-10-12': [row('Casey', 2000, 20)] });      // an old result that never reached the family
mock.state.down = true; await enter(C, 'Casey'); const cScore = await daily(C); eq(cScore, 1680, 'Casey plays offline');
eq(mock.docs.has(`families/${fid}/days/2026-10-20/entries/casey`), false, 'nothing reached the family yet');
await setDay(C, '2026-10-21'); await C.reload(); await C.waitForTimeout(250); await settle(C);
mock.state.down = false; await sync(C);
eq(mock.docs.has(`families/${fid}/days/2026-10-20/entries/casey`), true, 'yesterday’s score is sent the next day');
eq(mock.plain(mock.docs.get(`families/${fid}/days/2026-10-20/entries/casey`)).score, 1680, 'with its score');
eq(mock.docs.has(`families/${fid}/days/2026-10-12/entries/casey`), false, 'a result too old to send is left alone');
assert((await wins(C, '2026-10')).includes('Morgan 1/2'), 'Morgan’s 2,300 on the 20th beats Casey’s late score');
assert((await wins(C, '2026-10')).includes('Casey 0/1'), 'in a family, only what the family holds is counted');
await setDay(A, '2026-10-21'); await A.reload(); await A.waitForTimeout(250); await settle(A);
eq(await wins(A, '2026-10'), await wins(C, '2026-10'), 'the first device agrees after the late score arrives');
// leaving: the device falls back on what it recorded itself
await C.click('[data-act=family]'); await C.click('[data-act=family-leave]'); await C.click('[data-act=family-leave]');
eq(await wins(C, 'all'), '1 Casey 2/2', 'after leaving, the device counts its own days');

await browser.close(); mock.close();
console.log(errors.length ? errors.join('\n') : 'DAILY WINS CHECKS PASSED');
