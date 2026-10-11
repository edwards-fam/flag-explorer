// The family scoreboard, exercised with several pretend devices against a stand-in for the database.
import { chromium } from 'playwright';
import path from 'path';
import { startMock } from './mock-firestore.mjs';
const url = 'file://' + path.resolve('test.html');
const mock = await startMock();
const browser = await chromium.launch({ executablePath: process.env.FX_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [], assert = (c, m) => { if (!c) errors.push('ASSERT ' + m); }, eq = (a, b, m) => assert(a === b, `${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
async function device(label, cloud = true) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }), p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`pageerror(${label}) ${e.message}`));
  if (cloud) await p.addInitScript(cfg => { window.FX_CLOUD = cfg; }, { projectId: 'demo', apiKey: 'test-key', base: mock.base });
  await p.goto(url); await p.waitForTimeout(250);
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
// a whole round: `miss` is the number of the flag to get wrong (0 for none)
async function round(p, mode, miss = 0) {
  await p.click(`[data-act=opt][data-k=mode][data-v=${mode}]`); await p.click('[data-act=play]');
  for (let k = 1; k <= 10; k++) {
    if ((await st(p)).q.phase === 'wager') await p.click('[data-act=wager][data-v="0"]');
    await pickFlag(p, k !== miss);
    if (k !== miss) { await p.click('[data-act=bonus]'); await pickBonus(p, true); }
    await p.click('[data-act=next]');
  }
  await settle(p); return (await st(p)).score;
}
const boardRows = async (p, tab) => ({ rows: await p.evaluate(t => window.__fx.tableRows(t).map(r => `${r.name} ${r.score.toLocaleString('en-US')}`), tab) });
const boardHead = async p => { await p.click('[data-act=board]'); const head = await p.textContent('.fx-band'); await p.click('[data-act=back]'); return head; };
const docsUnder = part => [...mock.docs.keys()].filter(k => k.includes(part));

// ---- 0. the Claude version has no scoreboard settings at all, and a device that has not joined sends nothing
const plain = await device('artifact', false);
eq(await plain.locator('[data-act=family]').count(), 0, 'no family scoreboard without the hosted settings');
const A = await device('A');
eq(await A.locator('#fx-family-tip').count(), 1, 'invitation to enter a family code'); eq(mock.state.requests, 0, 'nothing sent before joining');
await A.screenshot({ path: 'c1-start-invite.png', fullPage: true });

// ---- 1. joining
await A.click('[data-act=family]'); await A.screenshot({ path: 'c2-family-join.png', fullPage: true });
await A.fill('#fx-code', '103'); await A.click('#fx-join-btn'); assert((await txt(A, '#fx-code-err')).includes('at least 4'), 'short code refused'); eq(await A.evaluate(() => window.__fx.family()), null, 'not joined on a short code');
await A.fill('#fx-code', '  Flags1031 '); await A.click('#fx-join-btn'); await A.waitForSelector('#fx-code-shown'); await settle(A);
eq((await txt(A, '#fx-code-shown')).trim(), 'flags1031', 'code tidied'); const fam = await A.evaluate(() => window.__fx.family()); assert(/^[0-9a-f]{32}$/.test(fam.fid), 'family id is a fingerprint, not the code'); assert(!fam.fid.includes('1031'), 'code not visible in the id');
await A.waitForTimeout(100); await A.screenshot({ path: 'c3-family-joined.png', fullPage: true }); await A.click('[data-act=back]');
eq(await A.locator('#fx-family-tip').count(), 0, 'invitation gone once joined'); assert((await txt(A)).includes('Family scoreboard on'), 'joined marker on the start screen');

// ---- 2. a round on device A reaches the family's copy
await enter(A, 'Alex'); eq((await st(A)).screen, 'rules', 'a new name goes straight through');
const aScore = await round(A, 'free'); eq(aScore, 1680, 'Alex: perfect, no wager');
const aEntry = docsUnder('/tables/world/entries/'); eq(aEntry.length, 1, 'one score stored for the family'); eq(mock.plain(mock.docs.get(aEntry[0])).score, 1680, 'score stored'); eq(mock.plain(mock.docs.get(aEntry[0])).perfect, true, 'perfect flag stored');
const alexDoc = mock.plain(mock.docs.get(`families/${fam.fid}/players/alex`)); eq(alexDoc.stamps.length, 10, 'ten stamps stored'); eq(alexDoc.perfect.length, 1, 'gold stamp stored'); eq(alexDoc.best_world, 1680, 'personal best stored'); eq(alexDoc.name, 'Alex', 'name as typed');
assert(![...mock.docs.keys()].some(k => k.includes('1031')), 'the code itself is never sent');

// ---- 3. a second device with the same code sees it, and adds its own
const B = await device('B'); await join(B, 'flags1031'); await enter(B, 'Robin');
let seen = await boardRows(B, 'world'); eq(seen.rows.length, 1, 'device B sees the family score before playing'); assert(seen.rows[0].includes('Alex') && seen.rows[0].includes('1,680'), 'and it is Alex’s');
const bScore = await round(B, 'free', 4); assert(bScore > 0 && bScore < 1680, 'Robin scored less'); eq((await st(B)).place, 2, 'second place counts the family, not just this device');
await B.waitForTimeout(400); await B.screenshot({ path: 'c4-end-family-place.png' });
seen = await boardRows(B, 'world'); eq(seen.rows.length, 2, 'both scores on device B'); assert((await boardHead(B)).includes('your family'), 'table labelled as the family’s'); await sync(A);
seen = await boardRows(A, 'world'); eq(seen.rows.length, 2, 'both scores on device A'); assert(seen.rows[0].includes('Alex') && seen.rows[1].includes('Robin'), 'in order'); eq(seen.rows.filter(r => r.includes('Alex')).length, 1, 'own score not listed twice');
await A.click('[data-act=board]'); await A.screenshot({ path: 'c5-board-family.png', fullPage: true }); assert((await txt(A, '#fx-cloud-note')).includes('Shared with your family'), 'status line'); eq(await A.locator('#fx-wipe').count(), 0, 'no start-fresh while sharing with a family'); await A.click('[data-act=back]');

// ---- 4. the same player on a second device: asked first, then the passport follows
await B.click('[data-act=change-player]'); await enter(B, 'alex');
eq(await B.locator('#fx-claim').count(), 1, 'asked whether this is the same Alex'); assert((await txt(B, '#fx-claim')).includes('10 flags stamped'), 'shows what would come across'); await B.screenshot({ path: 'c6-claim.png', fullPage: true });
await B.click('[data-act=claim-no]'); eq(await B.locator('#fx-claim').count(), 0, 'saying no clears it'); eq(await B.inputValue('#fx-name'), '', 'and asks for another name');
await enter(B, 'Alex'); await B.click('#fx-claim [type=submit]'); await B.waitForFunction(() => window.__fx.state.screen === 'rules'); await settle(B);
eq(await B.evaluate(() => window.__fx.stamps('Alex').length), 10, 'passport arrives on the second device'); eq(await B.evaluate(() => window.__fx.perfects('Alex').length), 1, 'gold stamp arrives too');
assert((await txt(B)).includes('Passport · 10 of 197'), 'rules screen shows the passport once it has arrived');
await B.click('[data-act=rules-back]'); await enter(B, 'Alex'); eq((await st(B)).screen, 'rules', 'not asked again on a device that knows the name');

// ---- 5. today's challenge: one try per player across devices, and one table for the family
await A.click('[data-act=again]').catch(() => {}); await A.click('[data-act=end-early]'); await A.click('[data-act=end-early]'); await A.click('[data-act=choose]');
const aDaily = await round(A, 'daily', 2); await sync(B);
await B.click('[data-act=rules-back]'); await enter(B, 'Alex'); assert((await txt(B)).includes(`You scored ${aDaily.toLocaleString('en-US')} today`), 'device B knows Alex has played today');
await B.click('[data-act=opt][data-k=mode][data-v=daily]'); await B.click('[data-act=play]'); eq((await st(B)).practice, true, 'a second go on another device is practice');
await B.click('[data-act=end-early]'); await B.click('[data-act=end-early]'); await B.click('[data-act=change-player]'); await enter(B, 'Robin');
const bDaily = await round(B, 'daily', 7); await sync(A);
seen = await boardRows(A, 'daily'); eq(seen.rows.length, 2, 'both players on today’s table on device A'); eq(docsUnder('/days/').length, 2, 'one entry per player for the day');
assert(seen.rows.some(r => r.includes('Alex') && r.includes(aDaily.toLocaleString('en-US'))) && seen.rows.some(r => r.includes('Robin') && r.includes(bDaily.toLocaleString('en-US'))), 'with the right scores');

// ---- 6. no connection: the round still counts on the device and is sent later, once
const before = docsUnder('/tables/world/entries/').length; mock.state.down = true;
await B.click('[data-act=choose]'); const offScore = await round(B, 'free', 1); assert(offScore > 0, 'round played with no connection');
eq(await B.evaluate(() => window.__fx.cloudState.ok), false, 'device knows the scoreboard was unreachable'); eq(docsUnder('/tables/world/entries/').length, before, 'nothing stored while unreachable');
await B.click('[data-act=board]'); assert((await txt(B, '#fx-cloud-note')).includes('Could not reach'), 'and says so'); eq(await B.locator('.fx-hrow:not(.empty)').count(), 3, 'the offline score still shows on its own device'); await B.screenshot({ path: 'c7-board-offline.png', fullPage: true }); await B.click('[data-act=back]');
mock.state.down = false; await sync(B); eq(docsUnder('/tables/world/entries/').length, before + 1, 'sent once the connection is back');
const writes = mock.log.filter(l => l.startsWith('WRITE')).length; await sync(B); await sync(B); await sync(A);
eq(docsUnder('/tables/world/entries/').length, before + 1, 'never sent twice'); eq(mock.log.filter(l => l.startsWith('WRITE')).length, writes, 'nothing rewritten when nothing changed');

// ---- 7. another family's code is another scoreboard, and families cannot be listed
const C = await device('C'); await join(C, 'someone-else'); await enter(C, 'Casey');
seen = await boardRows(C, 'world'); eq(seen.rows.length, 0, 'a different code sees none of it');
const probe = await C.evaluate(async base => { const r = await fetch(`${base}/projects/demo/databases/(default)/documents/families?key=x`); return r.status; }, mock.base); eq(probe, 403, 'the list of families is closed');
const tamper = await C.evaluate(async ([base, fid]) => { const r = await fetch(`${base}/projects/demo/databases/(default)/documents:commit?key=x`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ writes: [{ update: { name: `projects/demo/databases/(default)/documents/families/${fid}/tables/world/entries/x_1`, fields: { name: { stringValue: 'Cheat' }, avatar: { stringValue: '' }, score: { integerValue: '99999' }, streak: { integerValue: '0' }, clock: { booleanValue: false }, perfect: { booleanValue: false }, t: { integerValue: '5' } } }, currentDocument: { exists: false } }] }) }); return r.status; }, [mock.base, fam.fid]);
eq(tamper, 403, 'an impossible score is refused');

// ---- 8. leaving: the device keeps its own scores and stops sharing
await A.click('[data-act=change-player]'); await A.click('[data-act=family]'); await A.click('[data-act=family-leave]'); assert((await txt(A)).includes('Tap again to leave'), 'leaving asks twice'); await A.click('[data-act=family-leave]');
eq(await A.evaluate(() => window.__fx.family()), null, 'left'); await A.click('[data-act=back]'); await enter(A, 'Alex');
seen = await boardRows(A, 'world'); eq(seen.rows.length, 1, 'only this device’s own score after leaving'); await A.click('[data-act=rules-back]'); assert((await boardHead(A)).includes('this device'), 'table labelled as the device’s');
const sentBefore = mock.state.requests; await sync(A); eq(mock.state.requests, sentBefore, 'nothing sent after leaving');
// starting fresh after leaving: the device forgets its scores, so joining under a new code begins an empty scoreboard
await A.click('[data-act=board]'); await A.click('#fx-wipe'); await A.click('#fx-wipe'); eq(await A.locator('.fx-hrow:not(.empty)').count(), 0, 'device cleared after leaving'); await A.click('[data-act=back]');
await join(A, 'a-new-code-77'); await enter(A, 'Alex'); await sync(A);
eq(await A.evaluate(() => window.__fx.cloudState.ok), true, 'joined the new family'); eq((await boardRows(A, 'world')).rows.length, 0, 'the new family starts empty'); eq((await boardRows(A, 'daily')).rows.length, 0, 'today included');
const newFid = await A.evaluate(() => window.__fx.family().fid); eq(docsUnder(newFid + '/tables').length + docsUnder(newFid + '/days').length, 0, 'no old score was sent to it');

// ---- 9. the project's web key: if it is wrong the game carries on without it, and remembers
mock.state.validKey = 'the-real-key'; mock.state.noKey = 0;
const D = await device('D'); await join(D, 'flags1031'); await enter(D, 'Morgan');
eq(await D.evaluate(() => window.__fx.cloudState.ok), true, 'a rejected key does not stop the scoreboard'); assert(mock.state.noKey > 0, 'requests were repeated without the key');
eq(await D.evaluate(() => localStorage.getItem('fx-cloud-key')), '"no"', 'and the device remembers not to send it'); eq((await boardRows(D, 'world')).rows.length, 3, 'the family scores arrive');
const keyed = mock.state.withKey; await sync(D); eq(mock.state.withKey, keyed, 'no further requests with the rejected key');
mock.state.validKey = null;

// ---- 10. one player on two devices: the same picture and passport, whichever way round they set up
mock.state.validKey = null;
const who = p => p.evaluate(() => ({ ...window.__fx.player }));
const playerDoc = (fid, pid) => { const d = mock.docs.get(`families/${fid}/players/${pid}`); return d ? mock.plain(d) : null; };
const E = await device('E'); await join(E, 'two-devices-1'); const fid2 = (await E.evaluate(() => window.__fx.family())).fid;
await enter(E, 'Casey'); const face = (await who(E)).avatar; await sync(E);
eq(playerDoc(fid2, 'casey').avatar, face, 'the family holds the picture chosen on the first device'); await round(E, 'free'); await sync(E);
eq(playerDoc(fid2, 'casey').stamps.length, 10, 'and the passport after a round'); eq(playerDoc(fid2, 'casey').best_world, 1680, 'and the personal best');
// second device joins first, then types the name: it is asked, and saying yes brings the picture
const F = await device('F'); await join(F, 'two-devices-1'); await F.fill('#fx-name', 'casey'); await F.click('#fx-setup [type=submit]'); await F.waitForSelector('#fx-claim');
assert((await txt(F, '#fx-claim')).includes(face), 'the question shows the picture the family knows'); await F.screenshot({ path: 'c8-claim-picture.png', fullPage: true });
await F.click('#fx-claim [type=submit]'); await F.waitForFunction(() => window.__fx.state.screen === 'rules'); await settle(F);
eq((await who(F)).avatar, face, 'saying yes brings the same picture'); eq((await who(F)).name, 'Casey', 'and the name as the family spells it');
eq(await F.evaluate(() => window.__fx.stamps('Casey').length), 10, 'and the passport'); eq(playerDoc(fid2, 'casey').avatar, face, 'the family’s copy is unchanged');
// third device: the name is typed before the family code, with whatever picture was showing
const G = await device('G'); await enter(G, 'Casey'); const stray = (await who(G)).avatar; await G.click('[data-act=rules-back]');
await join(G, 'two-devices-1'); await sync(G);
if (stray !== face) { eq((await who(G)).avatar, face, 'a device the player has not played on takes the family’s picture'); eq(playerDoc(fid2, 'casey').avatar, face, 'and does not overwrite it'); }
// a deliberate change of picture on one device follows the player to the others
await F.click('[data-act=rules-back]'); await F.click('[data-act=shuffle]'); const fresh = await F.evaluate(now => [...document.querySelectorAll('#fx-hand [data-act=avatar]')].map(b => b.dataset.e).find(e => e !== now), face);
await F.click(`#fx-hand [data-act=avatar][data-e="${fresh}"]`); await F.click('#fx-setup [type=submit]'); await F.waitForFunction(() => window.__fx.state.screen === 'rules'); await settle(F);
eq(playerDoc(fid2, 'casey').avatar, fresh, 'a new picture chosen on one device reaches the family'); await sync(E); eq((await who(E)).avatar, fresh, 'and then the first device'); eq(playerDoc(fid2, 'casey').stamps.length, 10, 'the passport is untouched by it');
await sync(G); eq((await who(G)).avatar, fresh, 'and the third');
// two devices saving the same player in the same moment: neither loses anything
await E.evaluate(() => { const all = JSON.parse(localStorage.getItem('fx-passport')); all.casey = [...all.casey, 'FR', 'JP'].filter((a, i, l) => l.indexOf(a) === i); localStorage.setItem('fx-passport', JSON.stringify(all)); });
await F.evaluate(() => { const all = JSON.parse(localStorage.getItem('fx-passport')); all.casey = [...all.casey, 'BR', 'KE'].filter((a, i, l) => l.indexOf(a) === i); localStorage.setItem('fx-passport', JSON.stringify(all)); });
await E.reload(); await F.reload(); await E.waitForTimeout(250); await Promise.all([settle(E), settle(F)]); await Promise.all([sync(E), sync(F)]); await sync(E); await sync(F);
const merged = playerDoc(fid2, 'casey').stamps; assert(['FR', 'JP', 'BR', 'KE'].every(a => merged.includes(a)), 'stamps from both devices are kept: ' + merged.join()); eq(new Set(merged).size, merged.length, 'none twice');
eq(await E.evaluate(() => window.__fx.stamps('Casey').length), merged.length, 'and both devices end up with all of them');

// ---- 11. if player records cannot be saved, the scores are still shared and still fetched
mock.state.refusePlayers = true;
const H = await device('H'); await join(H, 'two-devices-1'); await enter(H, 'Morgan'); const hScore = await round(H, 'free', 2);
assert(docsUnder(fid2 + '/tables/world/entries/morgan_').length === 1, 'the score still reaches the family'); eq(playerDoc(fid2, 'morgan'), null, 'though the player record was refused');
eq((await boardRows(H, 'world')).rows.length, 2, 'and the family’s scores still arrive'); eq(await H.evaluate(() => window.__fx.cloudState.ok), true, 'the scoreboard counts as working');
await H.click('[data-act=board]'); assert((await txt(H, '#fx-cloud-note')).includes('Scores are shared with your family'), 'the status line says the scores are shared'); await H.click('[data-act=back]');
await H.click('[data-act=change-player]'); await H.click('[data-act=family]'); assert((await txt(H, '#fx-cloud-detail')).includes('player morgan: write 403'), 'the family screen says what was refused'); await H.screenshot({ path: 'c9-family-problem.png', fullPage: true }); await H.click('[data-act=back]');
mock.state.refusePlayers = false; await sync(H); eq(playerDoc(fid2, 'morgan').stamps.length, 9, 'once records can be saved again, the passport goes up'); eq(await H.evaluate(() => window.__fx.cloudState.problems.length), 0, 'and the problem clears');

await browser.close(); mock.close();
console.log(errors.length ? errors.join('\n') : 'FAMILY SCOREBOARD CHECKS PASSED');
