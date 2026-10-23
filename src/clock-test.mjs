// The clock on Today's challenge: 20 seconds for each flag and each bonus question from 24 October 2026, no speed points,
// and the round's total time breaking a tie on points. Time is moved by hand with Playwright's clock.
import { chromium } from 'playwright';
import path from 'path';
import { startMock } from './mock-firestore.mjs';
const url = 'file://' + path.resolve('test.html');
const mock = await startMock();
const browser = await chromium.launch({ executablePath: process.env.FX_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [], assert = (c, m) => { if (!c) errors.push('ASSERT ' + m); }, eq = (a, b, m) => assert(a === b, `${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
// a device whose clock stands still at the given moment until the test moves it on
async function device(label, at, cloud = false, width = 390) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2 }), p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`pageerror(${label}) ${e.message}`));
  if (cloud) await p.addInitScript(cfg => { window.FX_CLOUD = cfg; }, { projectId: 'demo', apiKey: 'test-key', base: mock.base });
  await p.clock.install({ time: new Date(at) }); await p.clock.pauseAt(new Date(new Date(at).getTime() + 1000));
  await p.goto(url); await p.clock.runFor(300);
  return p;
}
const st = p => p.evaluate(() => JSON.parse(JSON.stringify(window.__fx.state)));
const txt = (p, sel = '#app') => p.textContent(sel);
const wait = (p, ms) => p.clock.runFor(ms);
const settle = async p => { for (let i = 0; i < 200 && await p.evaluate(() => window.__fx.cloudState.busy); i++) { await p.clock.runFor(50); await p.waitForTimeout(20); } await p.clock.runFor(60); };
const join = async (p, code) => { await p.click('[data-act=family]'); await p.fill('#fx-code', code); await p.click('#fx-join-btn'); await p.waitForSelector('#fx-code-shown'); await settle(p); await p.click('[data-act=back]'); };
const enter = async (p, name) => { await p.fill('#fx-name', name); await p.click('#fx-setup [type=submit]'); await p.waitForFunction(() => window.__fx.state.screen === 'rules' || !!document.querySelector('#fx-claim'), null, { timeout: 15000 }); if (await p.locator('#fx-claim').count()) await p.click('#fx-claim [type=submit]'); };
const pickFlag = async (p, right) => { const s = await st(p); const i = right ? s.q.options.indexOf(s.q.a2) : s.q.options.findIndex(o => o !== s.q.a2 && !s.q.out.includes(o)); await p.locator('#fx-panel .fx-opt').nth(i).click(); };
const pickBonus = async (p, right) => { const s = await st(p); await p.locator('#fx-panel .fx-opt').nth(right ? s.q.bonus.answer : (s.q.bonus.answer + 1) % 4).click(); };
const overflow = async (p, label) => { const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })); if (o.sw > o.iw) errors.push(`overflow at ${label}: ${o.sw}>${o.iw}`); };
// a whole challenge, every answer right: `flag` and `bonus` are the seconds taken over each
async function daily(p, flag = 2, bonus = 1) {
  await p.click('[data-act=opt][data-k=mode][data-v=daily]'); await p.click('[data-act=play]');
  for (let k = 1; k <= 10; k++) {
    if ((await st(p)).q.phase === 'wager') { await wait(p, 4000); await p.click('[data-act=wager][data-v="0"]'); }      // thinking about the wager costs no time
    await wait(p, flag * 1000); await pickFlag(p, true);
    await wait(p, 3000); await p.click('[data-act=bonus]');                                                        // nor does reading the result
    await wait(p, bonus * 1000); await pickBonus(p, true);
    await p.click('[data-act=next]');
  }
  return st(p);
}

// ---- 1. the day before: Today's challenge has no clock, as before
const Y = await device('Y', '2026-10-23T18:00:00');
await enter(Y, 'Alex'); await Y.click('[data-act=opt][data-k=mode][data-v=daily]');
eq(await Y.locator('#fx-day-clock').count(), 0, 'no clock explained before the 24th'); assert(!(await txt(Y, '.fx-mode[data-v=daily]')).includes('seconds'), 'the challenge card says nothing of a clock');
await Y.click('[data-act=play]'); eq(await Y.locator('.fx-clock').count(), 0, 'no clock bar on the 23rd'); eq((await st(Y)).limit, 0, 'no limit');
await wait(Y, 60000); eq((await st(Y)).q.phase, 'guess', 'a minute later the flag is still waiting');

// ---- 2. from the 24th: every flag and bonus question against a 20-second clock, no speed points
const A = await device('A', '2026-10-24T08:00:00');
await enter(A, 'Alex'); await A.click('[data-act=opt][data-k=mode][data-v=daily]');
assert((await txt(A, '.fx-mode[data-v=daily]')).includes('20 seconds to answer each flag and bonus question; the faster time breaks a tie'), 'the challenge card explains the clock');
assert((await txt(A, '#fx-day-clock')).includes('The clock keeps running if you leave the game'), 'the rules explain the clock');
assert(!(await txt(A)).includes('Speed bonus'), 'no speed bonus listed for the challenge'); await A.screenshot({ path: 't1-rules-clock.png', fullPage: true }); await overflow(A, 'rules');
const a = await daily(A, 2, 1);
eq(a.score, 1680, 'every answer right scores what it always did'); eq(a.log.reduce((s, e) => s + e.speedPts, 0), 0, 'no speed points');
eq(a.ms, 30000, 'the time: 2 seconds a flag and 1 a bonus question, ten times, and nothing for the wager or the results');
eq((await txt(A, '#fx-time')).replace(/\s+/g, ' ').trim(), 'Time 30.0 s · breaks a tie', 'the results show the time');
assert((await A.evaluate(() => window.__fx.shareText())).includes('scored 1,680 in 30.0 s'), 'the shared result carries the time');
await A.screenshot({ path: 't2-end-time.png', fullPage: true }); await overflow(A, 'end');
const row = await A.evaluate(() => window.__fx.tableRows('daily')[0]); eq(row.ms, 30000, 'today’s table keeps the time'); eq(row.clock, false, 'and is not marked as a free-play clock round');
eq(JSON.parse(await A.evaluate(() => localStorage.getItem('fx-days')))['2026-10-24'][0].ms, 30000, 'the day log keeps it for the wins');

// running out: a flag and a bonus question
await A.click('[data-act=change-player]'); await enter(A, 'Robin');
await A.click('[data-act=opt][data-k=mode][data-v=daily]'); await A.click('[data-act=play]');
eq(await A.locator('.fx-clock').count(), 1, 'the clock bar shows'); await wait(A, 5000); eq((await txt(A, '#fx-pos')).trim(), '15 s', 'counting down');
await A.screenshot({ path: 't3-play-clock.png' });
await wait(A, 15100); let s = await st(A); eq(s.q.phase, 'result', 'at 20 seconds the flag is over'); eq(s.log[0].timedOut, true, 'as a miss'); eq(s.ms, 20000, 'counting the full 20 seconds');
await A.click('[data-act=next]'); await wait(A, 1000); await pickFlag(A, true); await A.click('[data-act=bonus]');
await wait(A, 10000); eq((await st(A)).q.phase, 'bonus', 'the bonus question has its own 20 seconds'); await wait(A, 10100);
s = await st(A); eq(s.q.phase, 'bonusResult', 'then it is over'); eq(s.log[1].bonus, 'lost', 'and lost'); eq(s.ms, 41000, '20 + 1 + 20 seconds');
assert((await txt(A, '#fx-panel')).includes('Out of time. The answer was'), 'the result says time ran out');
// leaving the game does not stop the clock: closing and reopening mid-flag carries on from where it was
await A.click('[data-act=next]'); await wait(A, 12000); const t0 = (await st(A)).q.t0;
await A.reload(); await wait(A, 300); s = await st(A); eq(s.q.t0, t0, 'after reopening, the flag’s clock was not restarted'); eq((await txt(A, '#fx-pos')).trim(), '8 s', 'and shows the time left');
await wait(A, 8000); s = await st(A); eq(s.log.length, 3, 'it runs out as before'); eq(s.log[2].timedOut, true, 'as a miss');
// closed for longer than the flag had left: it is a miss the moment the game is opened again
await A.click('[data-act=next]'); await wait(A, 3000); await A.reload(); await wait(A, 30000); s = await st(A);
eq(s.log.length, 4, 'opening the game after the time is up'); eq(s.log[3].timedOut, true, 'finds the flag missed'); eq(s.ms, 81000, 'four flags, three of them the full 20 seconds');

// free play: its own optional 15-second clock and speed bonus are unchanged, and the bonus question is not timed there
const F = await device('F', '2026-10-24T09:00:00');
await enter(F, 'Casey'); await F.click('[data-act=opt][data-k=mode][data-v=free]'); await F.click('[data-act=opt][data-k=clock][data-v=true]'); await F.click('[data-act=play]');
eq((await st(F)).limit, 15, 'free play keeps 15 seconds'); await wait(F, 2000); await pickFlag(F, true); eq((await st(F)).log[0].speedPts, 30, 'with its speed bonus');
await F.click('[data-act=bonus]'); await wait(F, 40000); eq((await st(F)).q.phase, 'bonus', 'and an untimed bonus question');
const G = await device('G', '2026-10-24T09:00:00');
await enter(G, 'Casey'); await G.click('[data-act=opt][data-k=mode][data-v=free]'); await G.click('[data-act=play]'); await wait(G, 60000); eq((await st(G)).q.phase, 'guess', 'free play with no clock waits as long as it takes');

// ---- 3. the time breaks a tie on points
const tie = await A.evaluate(() => {
  const r = (name, score, t, ms) => Object.assign({ name, avatar: '🦊', score, streak: 0, clock: false, perfect: false, t }, ms === undefined ? {} : { ms });
  const w = rows => window.__fx.dayWinners(rows).map(x => x.name).join();
  return { faster: w([r('Alex', 1680, 1, 52100), r('Robin', 1680, 2, 48300), r('Casey', 900, 3, 20000)]), level: w([r('Alex', 1680, 1, 40000), r('Robin', 1680, 2, 40000)]),
    before: w([r('Alex', 900, 1), r('Robin', 900, 2)]), mixed: w([r('Alex', 900, 1), r('Robin', 900, 2, 70000)]), points: w([r('Alex', 1700, 1, 90000), r('Robin', 1680, 2, 10000)]) };
});
eq(tie.faster, 'Robin', 'level on points, the faster time wins'); eq(tie.level, 'Alex,Robin', 'level on both, both win');
eq(tie.before, 'Alex,Robin', 'days before the clock still share a tie'); eq(tie.mixed, 'Robin', 'a recorded time beats none'); eq(tie.points, 'Alex', 'points always come first');
eq(await A.evaluate(() => [window.__fx.timeText(48300), window.__fx.timeText(68340), window.__fx.timeText(0), window.__fx.timeText(59960)].join()), '48.3 s,1:08.3,0.0 s,1:00.0', 'times read naturally');

// ---- 4. a family: the time travels with the score, and the summary names the faster player
const P1 = await device('P1', '2026-10-24T10:00:00', true); await join(P1, 'clock-family'); await enter(P1, 'Alex'); await daily(P1, 3, 2); await settle(P1);
const P2 = await device('P2', '2026-10-24T10:00:00', true); await join(P2, 'clock-family'); await enter(P2, 'Robin'); await daily(P2, 2, 1); await settle(P2);
const fid = (await P1.evaluate(() => window.__fx.family())).fid, doc = n => mock.docs.get(`families/${fid}/days/2026-10-24/entries/${n}`);
eq(doc('alex') && mock.plain(doc('alex')).ms, 50000, 'Alex’s time reaches the family'); eq(doc('robin') && mock.plain(doc('robin')).ms, 30000, 'and Robin’s');
await P1.evaluate(() => window.__fx.cloudSync()); await settle(P1);
await P1.click('[data-act=board]'); await P1.click('[data-act=tab][data-v=daily]');
const names = await P1.locator('.fx-hrow:not(.empty)').allTextContents();
assert(names[0].includes('Robin') && names[0].includes('30.0 s') && names[1].includes('Alex') && names[1].includes('50.0 s'), 'today’s table puts the faster of two equal scores first, with the times: ' + names.join(' / '));
assert((await txt(P1)).includes('Alex takes 2nd place'), 'the slower of two equal scores is placed second'); await P1.screenshot({ path: 't4-table-times.png', fullPage: true }); await overflow(P1, 'table');
await P1.click('[data-act=back]'); await P1.clock.runFor(16 * 3600e3); await P1.reload(); await wait(P1, 300); await settle(P1);
eq(await P1.evaluate(() => window.__fx.todayKey()), '2026-10-25', 'the next day');
eq(await P1.evaluate(() => window.__fx.winsTable('2026-10').map(e => `${e.place} ${e.name} ${e.wins}`).join(' | ')), '1 Robin 1 | 2 Alex 0', 'the win goes to the faster player');
const text = await P1.evaluate(() => window.__fx.dayText('2026-10-24'));
assert(text.includes('🏆 Robin wins with 1,680 in 30.0 s! The tie went to the faster time.'), 'the summary explains the tie: ' + text.split('\n')[3]);
assert(text.includes('🥇 🦊 Robin 1,680 · 30.0 s') || /🥇 .* Robin 1,680 · 30\.0 s\n🥈 .* Alex 1,680 · 50\.0 s/.test(text), 'and lists the times in order: ' + text.split('\n').slice(5, 7).join(' / '));
await P1.click('[data-act=board]'); await P1.click('[data-act=tab][data-v=wins]'); assert((await txt(P1, '#fx-wins-key')).includes('Level on points, the faster time wins'), 'the wins table says how a tie is settled'); await P1.screenshot({ path: 't5-wins-time.png', fullPage: true }); await overflow(P1, 'wins');

// a scoreboard still on the old rules takes the score without the time, and nothing is reported as a problem
mock.state.oldRules = true;
const P3 = await device('P3', '2026-10-24T11:00:00', true); await join(P3, 'clock-family'); await enter(P3, 'Morgan'); await daily(P3, 2, 1); await settle(P3);
eq(doc('morgan') && mock.plain(doc('morgan')).score, 1680, 'the score is saved under the old rules'); eq(doc('morgan') && 'ms' in mock.plain(doc('morgan')), false, 'without its time');
eq((await P3.evaluate(() => window.__fx.cloudState.problems || [])).length, 0, 'and no problem is shown');
mock.state.oldRules = false;

await browser.close(); mock.close();
console.log(errors.length ? errors.join('\n') : 'DAILY CLOCK CHECKS PASSED');
