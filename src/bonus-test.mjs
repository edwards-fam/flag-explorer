// Bonus questions: eight kinds from 19 November 2026, varied answers, and no repeat of the kind a player last had for a country.
import { chromium } from 'playwright';
import path from 'path';
const url = 'file://' + path.resolve('test.html');
const browser = await chromium.launch({ executablePath: process.env.FX_CHROMIUM || '/opt/pw-browsers/chromium' });
const errors = [], assert = (c, m) => { if (!c) errors.push('ASSERT ' + m); }, eq = (a, b, m) => assert(a === b, `${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
async function page(day) {
  const p = await (await browser.newContext()).newPage();
  p.on('pageerror', e => errors.push('pageerror ' + e.message));
  await p.clock.install({ time: new Date(day + 'T12:00:00') }); await p.goto(url); await p.waitForTimeout(250);
  return p;
}

// ---- 1. before the 19th: the four kinds of old
const A = await page('2026-11-18');
const before = await A.evaluate(() => { const f = window.__fx, kinds = new Set(); for (let i = 0; i < 60; i++) f.buildRound(f.deck(f.POOL, 10).slice(0, 10), 'Alex').forEach(r => kinds.add(r.bonus.kind)); return [...kinds].sort(); });
eq(JSON.stringify(before), JSON.stringify(['capital', 'continent', 'neighbour', 'population']), 'four kinds before 19 November');

// ---- 2. from the 19th: eight kinds, each sound for every country it can be asked about
const B = await page('2026-11-20');
const after = await B.evaluate(() => { const f = window.__fx, kinds = new Set(); for (let i = 0; i < 120; i++) f.buildRound(f.deck(f.POOL, 10).slice(0, 10), 'Alex').forEach(r => kinds.add(r.bonus.kind)); return [...kinds].sort(); });
eq(JSON.stringify(after), JSON.stringify(['borders', 'capital', 'capitalOf', 'continent', 'most', 'neighbour', 'population', 'region']), 'eight kinds from 19 November');
const bad = await B.evaluate(() => {
  const f = window.__fx, C = f.C, out = [];
  for (const a of f.POOL) for (const kind of Object.keys(f.BONUS_MAKERS)) {
    const c = C[a];
    if (kind === 'neighbour' && !c.borders.length) continue;
    for (let n = 0; n < 4; n++) {
      const q = f.BONUS_MAKERS[kind](c), right = q.options[q.answer];
      if (q.options.length !== 4 || new Set(q.options).size !== 4 || q.answer < 0) { out.push(`${a} ${kind}: options ${JSON.stringify(q.options)}`); break; }
      if (kind === 'borders' && right !== (c.borders.length === 0 ? 'None' : c.borders.length === 1 ? '1 country' : `${c.borders.length} countries`)) out.push(`${a} borders: ${right}`);
      if (kind === 'region' && (right !== f.SUBS[c.sub] || q.options.some(o => typeof o !== 'string' || /^\d+$/.test(o)))) out.push(`${a} region: ${JSON.stringify(q.options)}`);
      if (kind === 'capitalOf') { const t = f.POOL.map(x => C[x]).find(x => x.name === right); if (!t || t.a2 === a || q.options.includes(c.name) || !q.prompt.startsWith(t.cap + ' is') && !q.prompt.includes(': ' + t.cap + ' is')) out.push(`${a} capitalOf: ${q.prompt} ${JSON.stringify(q.options)}`); if (c.borders.length && q.prompt.includes('neighbour') && !c.borders.includes(t.a2)) out.push(`${a} capitalOf: ${right} is not a neighbour`); }
      if (kind === 'most') { const pops = q.options.map(nm => f.POOL.map(x => C[x]).find(x => x.name === nm).pop); if (Math.max(...pops) !== pops[q.answer]) out.push(`${a} most: ${right}`); }
    }
  }
  return out.slice(0, 10);
});
eq(bad.join(' | '), '', 'every question has four different answers and the right one');
// on the 19th itself the question was still about the flag's own country, so that day's challenge stays the same for everyone
const B0 = await page('2026-11-19'); const old = await B0.evaluate(() => { const q = window.__fx.BONUS_MAKERS.capitalOf(window.__fx.C.BE); return q.options[q.answer]; }); eq(old, 'Belgium', 'unchanged on 19 November');
const be = await B.evaluate(() => { const q = window.__fx.BONUS_MAKERS.capitalOf(window.__fx.C.BE); return { p: q.prompt, o: q.options, r: q.options[q.answer] }; });
assert(be.p.endsWith('is the capital of which neighbour of Belgium?') && !be.o.includes('Belgium') && ['France', 'Germany', 'Netherlands', 'Luxembourg'].includes(be.r), 'from the 20th, Belgium is asked about a neighbour’s capital: ' + JSON.stringify(be));
const fj = await B.evaluate(() => window.__fx.BONUS_MAKERS.capitalOf(window.__fx.C.FJ).prompt); assert(fj.startsWith('Not far from Fiji: '), 'an island is asked about a nearby country: ' + fj);
// the gaps closed: Bolivia gets its capital, Egypt its region
const gaps = await B.evaluate(() => { const f = window.__fx, n = { BO: new Set(), EG: new Set() }; for (let i = 0; i < 300; i++) for (const a of ['BO', 'EG']) n[a].add(f.buildRound([a]).find(r => r.a2 === a).bonus.kind); return { BO: [...n.BO], EG: [...n.EG] }; });
assert(gaps.BO.includes('capital') && gaps.BO.includes('capitalOf'), 'Bolivia now gets capital questions: ' + gaps.BO);
assert(gaps.EG.includes('region') && !gaps.EG.includes('continent'), 'Egypt gets the region question, still not the continent: ' + gaps.EG);
const bo = await B.evaluate(() => window.__fx.BONUS_MAKERS.capital(window.__fx.C.BO)); eq(bo.options[bo.answer], 'Sucre', 'Bolivia’s capital is Sucre'); assert(!bo.options.includes('La Paz'), 'with La Paz kept out of the choices');
// a player is not given the same kind twice running for a country
const runs = await B.evaluate(() => {
  const f = window.__fx, seq = [];
  for (let i = 0; i < 40; i++) { const r = f.buildRound(['EG'], 'Alex')[0]; seq.push(r.bonus.kind); const all = JSON.parse(localStorage.getItem('fx-bq') || '{}'); const m = all.alex || {}; m.EG = [...(m.EG || []).filter(x => x !== r.bonus.kind), r.bonus.kind].slice(-3); all.alex = m; localStorage.setItem('fx-bq', JSON.stringify(all)); }
  return seq;
});
assert(runs.every((k, i) => !i || k !== runs[i - 1]), 'never the same kind twice in a row: ' + runs.join(','));
assert(runs.every((k, i) => i < 2 || k !== runs[i - 2]), 'nor the one before that: ' + runs.slice(0, 12).join(','));
eq(new Set(runs).size, 7, 'Egypt cycles through all seven kinds it can have');
// a bonus question opened in play is remembered for that player
await B.fill('#fx-name', 'Alex'); await B.click('#fx-setup [type=submit]'); await B.waitForFunction(() => window.__fx.state.screen === 'rules');
await B.click('[data-act=opt][data-k=mode][data-v=free]'); await B.click('[data-act=play]');
const s1 = await B.evaluate(() => window.__fx.state.q); await B.locator('#fx-panel .fx-opt').nth(s1.options.indexOf(s1.a2)).click(); await B.click('[data-act=bonus]');
const noted = await B.evaluate(a => (window.__fx.bqSeen('Alex')[a] || []).slice(-1)[0], s1.a2); eq(noted, s1.bonus.kind, 'the kind shown is remembered');
await B.screenshot({ path: 'b1-bonus.png' });

await browser.close();
console.log(errors.length ? errors.join('\n') : 'BONUS QUESTION CHECKS PASSED');
