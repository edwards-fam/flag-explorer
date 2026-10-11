import { chromium } from 'playwright';
import path from 'path';
const url = 'file://' + path.resolve('test.html');
const browser = await chromium.launch({ executablePath: process.env.FX_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
async function mk(w,h,scheme){ const ctx = await browser.newContext({viewport:{width:w,height:h}, deviceScaleFactor:2, colorScheme:scheme}); const p = await ctx.newPage(); p.on('pageerror',e=>errors.push('pageerror '+e.message)); p.on('console',m=>{ if(m.type()==='error') errors.push('console '+m.text()); }); await p.goto(url); await p.waitForTimeout(300); return p; }
const st = p => p.evaluate(()=>JSON.parse(JSON.stringify(window.__fx.state)));
const mt = p => p.evaluate(()=>JSON.parse(JSON.stringify(window.__fx.match)));
const who = p => p.evaluate(()=>window.__fx.player.name);
const overflow = async (p,label) => { const o = await p.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:window.innerWidth})); if(o.sw>o.iw) errors.push(`overflow at ${label}: ${o.sw}>${o.iw}`); };
const assert = (c,m)=>{ if(!c) errors.push('ASSERT '+m); };
const eq = (a,b,m)=>assert(a===b, `${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const pickFlag = async (p, right) => { const s = await st(p); const idx = right ? s.q.options.indexOf(s.q.a2) : s.q.options.findIndex(o=>o!==s.q.a2 && !s.q.out.includes(o)); await p.locator('#fx-panel .fx-opt').nth(idx).click(); };
const pickBonus = async (p, right) => { const s = await st(p); const idx = right ? s.q.bonus.answer : (s.q.bonus.answer+1)%4; await p.locator('#fx-panel .fx-opt').nth(idx).click(); };
const opt = async (p,k,v) => p.click(`[data-act=opt][data-k=${k}][data-v="${v}"]`);
const txt = (p, sel='#app') => p.textContent(sel);
// one whole turn: flag, optional bonus, then hand over
async function turn(p, { flag = true, bonus = null, wager = 0 } = {}) {
  await p.click('[data-act=ready]');
  if ((await st(p)).q.phase === 'wager') await p.click(`[data-act=wager][data-v="${wager}"]`);
  await pickFlag(p, flag);
  if (flag && bonus !== null) { await p.click('[data-act=bonus]'); await pickBonus(p, bonus); }
  await p.click('[data-act=next]');
}

// ---- A. two players, five flags each, scripted arithmetic
const p = await mk(390, 844, 'light');
await p.fill('#fx-name','Alex'); await p.click('#fx-setup [type=submit]');
await opt(p,'mode','party'); eq(await p.locator('.fx-guest').count(),1,'a blank second player is offered');
await p.screenshot({path:'q1-party-setup.png', fullPage:true}); await overflow(p,'party setup');
await p.click('[data-act=play]'); assert((await txt(p,'#fx-party-err')).includes('Give every player a name'),'blank name refused'); eq((await st(p)).screen,'rules','still on rules');
await p.fill('.fx-guest','alex'); await p.click('[data-act=play]'); assert((await txt(p,'#fx-party-err')).includes('share a name'),'duplicate name refused');
await p.fill('.fx-guest','Robin'); eq(await txt(p,'#fx-party-err'),'','error clears on typing');
await opt(p,'pool','world'); eq(await p.inputValue('.fx-guest'),'Robin','name survives a re-render');
await opt(p,'clock','false'); await opt(p,'each','5');
await p.screenshot({path:'q2-party-ready.png', fullPage:true});
await p.click('[data-act=play]');
let s = await st(p), m = await mt(p);
eq(s.screen,'pass','hand-over screen first'); eq(m.seats.length,2,'two seats'); eq(m.turn,0,'seat 0 opens'); eq(await who(p),'Alex','Alex first');
assert((await txt(p)).includes('First to play'),'opening wording'); eq(await p.locator('.fx-flag').count(),0,'no flag on the hand-over screen');
const codes = m.seats.flatMap(x=>x.S.round.map(r=>r.a2)); eq(new Set(codes).size,10,'ten different flags dealt');
const known = await p.evaluate(()=>[...window.__fx.KNOWN]);
for (let k=0;k<5;k++) eq(known.includes(m.seats[0].S.round[k].a2), known.includes(m.seats[1].S.round[k].a2), `flag ${k+1} from the same shelf for both`);
await p.screenshot({path:'q3-pass-first.png', fullPage:true}); await overflow(p,'pass first');
await p.click('[data-act=ready]'); s = await st(p); eq(s.screen,'play','play after ready'); eq(s.q.phase,'guess','guessing');
assert(await p.locator('#fx-tip').count()===1,'tip on a new player\'s first flag'); assert((await txt(p,'#fx-head')).includes('Flag 1 of 5'),'five-flag progress'); eq(await p.locator('.fx-seg').count(),5,'five bars');
await p.waitForTimeout(350); await p.screenshot({path:'q4-party-play.png'}); await overflow(p,'party play');
await pickFlag(p,true); await p.click('[data-act=bonus]'); await pickBonus(p,true);
assert((await txt(p,'[data-act=next]')).includes('Pass to Robin'),'button names the next player'); await p.screenshot({path:'q5-party-result.png', fullPage:true});
await p.click('[data-act=next]'); s = await st(p); eq(s.screen,'pass','hand-over'); eq(await who(p),'Robin','Robin next'); assert((await txt(p)).includes('Pass it on'),'pass wording');
eq((await mt(p)).seats[0].S.score,150,'Alex banked 150'); await p.screenshot({path:'q6-pass.png', fullPage:true});
await p.click('[data-act=ready]'); assert(await p.locator('#fx-tip').count()===1,'Robin gets her own tip'); await pickFlag(p,false); await p.click('[data-act=next]');
eq(await who(p),'Alex','back to Alex'); assert((await txt(p)).includes('Flag 2 of 5'),'second flag');
await p.click('[data-act=ready]'); eq(await p.locator('#fx-tip').count(),0,'no tip on a second flag'); await pickFlag(p,true); await p.click('[data-act=bonus]'); await pickBonus(p,true); await p.click('[data-act=next]');
await turn(p,{flag:true,bonus:false});                                   // Robin 2
await turn(p,{flag:true,bonus:true}); await turn(p,{flag:true,bonus:false});   // 3
await turn(p,{flag:true,bonus:true}); await turn(p,{flag:true,bonus:false});   // 4
m = await mt(p); eq(m.seats[0].S.score,620,'Alex after four'); eq(m.seats[1].S.score,310,'Robin after four');
assert((await txt(p)).includes('the final flag'),'final flag announced'); await p.click('[data-act=ready]'); s = await st(p); eq(s.q.phase,'wager','wager opens the last flag in a short game too');
await p.screenshot({path:'q7-party-wager.png'}); await p.click('[data-act=wager][data-v="100"]'); await pickFlag(p,true); await p.click('[data-act=bonus]'); await pickBonus(p,true);
assert((await txt(p,'[data-act=next]')).includes('Pass to Robin'),'still one turn to go'); await p.click('[data-act=next]');
await p.click('[data-act=ready]'); await p.click('[data-act=wager][data-v="0"]'); await pickFlag(p,true); await p.click('[data-act=bonus]'); await pickBonus(p,false);
assert((await txt(p,'[data-act=next]')).includes('See who won'),'last button'); eq(await p.locator('canvas').count(),0,'no confetti before the end'); await p.click('[data-act=next]');
s = await st(p); m = await mt(p); eq(s.screen,'match','result screen'); eq(m.over,true,'match over'); eq(m.seats[0].S.score,890,'Alex final'); eq(m.seats[1].S.score,420,'Robin final');
eq((await txt(p,'#fx-winner')).trim(),'Alex wins','winner named'); assert((await txt(p)).includes('by 470 over Robin'),'margin'); eq(await p.locator('canvas').count(),1,'confetti for the winner');
eq(await who(p),'Alex','controls back with the host');
eq(await p.evaluate(()=>window.__fx.tableRows('world').length),0,'five-flag games stay off the table'); assert((await txt(p)).includes('stay off the high scores table'),'says so');
eq(await p.evaluate(()=>window.__fx.stamps('Alex').length),5,'Alex stamps'); eq(await p.evaluate(()=>window.__fx.perfects('Alex').length),0,'five flawless flags are not a perfect round'); eq(await p.locator('.fx-gold-star').count(),0,'no gold star in a five-flag game'); eq(await p.locator('#fx-flawless').count(),0,'no perfect line'); eq(await p.evaluate(()=>window.__fx.stamps('Robin').length),4,'Robin stamps');
await p.waitForTimeout(3300); await p.screenshot({path:'q8-match.png', fullPage:true}); await overflow(p,'match');
await p.click('[data-act=board]'); eq((await st(p)).screen,'board','board'); eq(await p.locator('[data-act=again]').count(),0,'no single-player replay button here'); await p.click('[data-act=back]'); eq((await st(p)).screen,'match','back to the result');
await p.click('[data-act=rematch]'); m = await mt(p); eq(m.turn,1,'rematch: the other player opens'); eq(await who(p),'Robin','Robin opens'); eq(m.seats[0].S.score,0,'scores reset');
await turn(p,{flag:true,bonus:true});
await p.click('[data-act=end-early]'); eq((await st(p)).screen,'pass','first tap only arms it'); await p.click('[data-act=end-early]');
s = await st(p); m = await mt(p); eq(s.screen,'match','ended early'); eq((await txt(p,'#fx-winner')).trim(),'Robin wins','winner of the short game'); assert((await txt(p)).includes('the only player to score'),'sole scorer wording');
await p.click('[data-act=choose]'); s = await st(p); eq(s.screen,'rules','rules'); eq(await p.evaluate(()=>window.__fx.opts.mode),'party','pass and play still chosen'); eq(await p.inputValue('.fx-guest'),'Robin','line-up remembered'); eq(await p.evaluate(()=>window.__fx.match),null,'match cleared');
// a single-player round afterwards behaves as before, with no tip for a known player
await opt(p,'mode','free'); await p.click('[data-act=play]'); eq(await p.locator('#fx-tip').count(),0,'no tip for a player who has played'); eq(await p.locator('.fx-seg').count(),10,'ten bars again');
assert((await txt(p,'[data-act=end-early]')).includes('End round early'),'single wording');

// ---- B. three players, ten flags each, against the clock, small dark phone with larger text
const b = await mk(375, 667, 'dark');
await b.click('[data-act=text]'); eq(await b.evaluate(()=>document.documentElement.dataset.text),'large','larger text on'); await overflow(b,'large setup');
await b.fill('#fx-name','Wwwwwwwwwwwwww'); await b.click('#fx-setup [type=submit]'); await overflow(b,'large rules');
await opt(b,'mode','party'); await b.fill('.fx-guest','Grandma Rose'); await b.click('[data-act=guest-add]'); await b.locator('.fx-guest').nth(1).fill('Morgan');
for (let k=0;k<5;k++) await b.click('[data-act=guest-add]'); eq(await b.locator('.fx-guest').count(),7,'eight players at most'); eq(await b.locator('[data-act=guest-add]').count(),0,'add button gone at eight');
await opt(b,'pool','world'); await opt(b,'each','10'); eq(await b.evaluate(()=>window.__fx.opts.each),10,'eight can play ten each from the whole world');
await opt(b,'pool','known'); eq(await b.evaluate(()=>window.__fx.opts.each),10,'eight at ten each fits the well-known set of 80'); assert(!(await b.locator('[data-k=each][data-v="10"]').isDisabled()),'ten each allowed'); eq(await b.locator('#fx-each-note').count(),0,'no warning');
await b.screenshot({path:'r0-eight-setup-large.png', fullPage:true}); await overflow(b,'large eight setup');
for (let k=0;k<5;k++) await b.locator('[data-act=guest-del]').nth(2).click(); eq(await b.locator('.fx-guest').count(),2,'removed'); eq(await b.locator('.fx-guest').nth(1).inputValue(),'Morgan','others kept'); assert(!(await b.locator('[data-k=each][data-v="10"]').isDisabled()),'ten each allowed again for three');
const before = await b.locator('[data-act=guest-ava]').first().textContent(); await b.locator('[data-act=guest-ava]').first().click(); assert((await b.locator('[data-act=guest-ava]').first().textContent())!==before,'tapping a face changes it');
await opt(b,'each','10'); await opt(b,'clock','true'); await opt(b,'pool','known'); await b.screenshot({path:'r1-party-setup-large.png', fullPage:true}); await overflow(b,'large party setup');
await b.click('[data-act=play]'); await b.screenshot({path:'r2-pass-large.png', fullPage:true}); await overflow(b,'large pass');
m = await mt(b); eq(m.seats.length,3,'three seats'); eq(new Set(m.seats.flatMap(x=>x.S.round.map(r=>r.a2))).size,30,'thirty different flags');
await b.click('[data-act=ready]'); assert(await b.locator('#fx-clock-bar').count()===1,'clock runs'); await b.waitForTimeout(300); await b.screenshot({path:'r3-play-large.png', fullPage:true}); await overflow(b,'large play');
await pickFlag(b,true); await b.click('[data-act=bonus]'); await pickBonus(b,true); await overflow(b,'large result'); await b.click('[data-act=next]');
for (let k=1;k<30;k++) { await turn(b,{flag:true,bonus:true,wager:0}); }
s = await st(b); m = await mt(b); eq(s.screen,'match','ten-flag match ends'); const sc = m.seats.map(x=>x.S.score); eq(sc[0],sc[1],'level scores'); eq(sc[1],sc[2],'level scores');
eq(sc[0],1500+180+300,'perfect timed ten: flags and bonuses, streak, speed');
eq((await txt(b,'#fx-winner')).trim(),'A tie at the top','tie wording'); assert((await txt(b)).includes('Wwwwwwwwwwwwww, Grandma Rose and Morgan finish level'),'all three named');
eq(await b.evaluate(()=>window.__fx.tableRows('known').length),3,'ten-flag games go on the table'); assert((await txt(b)).includes('High scores:'),'placings shown');
assert((await txt(b,'#fx-flawless')).includes('Wwwwwwwwwwwwww, Grandma Rose and Morgan'),'all three perfect rounds named'); eq(await b.locator('#fx-final .fx-gold-star').count(),3,'a gold star by each name'); eq(await b.evaluate(()=>window.__fx.perfects('Grandma Rose').length),1,'gold stamp filed for a guest'); eq(await b.locator('canvas').count(),1,'gold confetti');
await b.waitForTimeout(3300); await b.screenshot({path:'r4-match-large.png', fullPage:true}); await overflow(b,'large match');
await b.click('[data-act=board]'); eq(await b.locator('.fx-hrow.hot').count(),3,'all three new entries marked'); eq(await b.locator('.fx-hrow .fx-gold-star').count(),3,'three gold stars on the table'); assert((await txt(b,'#fx-star-key')).includes('perfect round'),'the star is explained'); await b.screenshot({path:'r5-board-large.png', fullPage:true}); await overflow(b,'large board');
await b.click('[data-act=back]'); await b.click('[data-act=change-player]'); eq((await st(b)).screen,'start','start'); eq(await b.evaluate(()=>window.__fx.match),null,'match cleared on change of player');
// larger text through a single-player round, then switched off
await b.fill('#fx-name','Morgan'); await b.click('#fx-setup [type=submit]'); await opt(b,'mode','free'); await opt(b,'clock','false'); await b.click('[data-act=play]'); eq(await b.locator('#fx-tip').count(),0,'Morgan already had her tip in the group game');
for (let k=0;k<10;k++){ if ((await st(b)).q.phase==='wager') { await b.screenshot({path:'r6-wager-large.png'}); await overflow(b,'large wager'); await b.click('[data-act=wager][data-v="250"]'); } await pickFlag(b,true); await b.click('[data-act=bonus]'); await pickBonus(b,true); await b.click('[data-act=next]'); }
s = await st(b); eq(s.screen,'end','single round ends'); eq(s.score,1930,'best possible untimed round'); eq(s.perfect,true,'perfect round recognised'); eq((await txt(b,'#fx-perfect')).trim(),'Perfect round','announced on the results screen'); assert((await txt(b,'main')).includes('World Ambassador · earned by Morgan'),'rank still shown'); eq(await b.evaluate(()=>window.__fx.perfects('Morgan').length),2,'second gold stamp for Morgan'); assert((await txt(b,'#fx-perfect-rule').catch(()=>'x'))!==null,'ok'); await b.waitForTimeout(3200); await b.screenshot({path:'r7-end-large.png', fullPage:true}); await overflow(b,'large end');
await b.click('[data-act=passport]'); await overflow(b,'large passport cover'); await b.click('#pp-book'); await b.waitForTimeout(950); await b.screenshot({path:'r8-passport-id-large.png'}); await overflow(b,'large passport id');
await b.click('[data-act=pp-next]'); await b.waitForTimeout(950); eq(await b.locator('.pp-gold').count(),2,'two gold stamps on the perfect-rounds page'); await b.screenshot({path:'r9-passport-page-large.png'}); await overflow(b,'large passport page');
const fits = await b.evaluate(()=>{ const leaf=document.querySelector('.pp-leaf'); return leaf.scrollHeight<=leaf.clientHeight+1 && leaf.scrollWidth<=leaf.clientWidth+1; }); assert(fits,'passport page holds its stamps in larger text');
await b.click('[data-act=back]'); await b.click('[data-act=choose]'); await b.click('[data-act=text]'); eq(await b.evaluate(()=>document.documentElement.dataset.text),undefined,'larger text off'); 
await b.reload(); await b.waitForTimeout(300); eq(await b.evaluate(()=>document.documentElement.dataset.text),undefined,'setting remembered (off)');
await b.click('[data-act=text]'); await b.reload(); await b.waitForTimeout(300); eq(await b.evaluate(()=>document.documentElement.dataset.text),'large','setting remembered (on)');

// ---- C. ranks by score
const r = await mk(390, 844, 'light');
await r.fill('#fx-name','Sam'); await r.click('#fx-setup [type=submit]'); await opt(r,'mode','free'); await r.click('[data-act=play]');
assert(await r.locator('#fx-tip').count()===1,'tip for a new single player'); await r.screenshot({path:'q9-tip.png'});
await pickFlag(r,false); await r.click('[data-act=next]'); eq(await r.locator('#fx-tip').count(),0,'tip gone on flag two');
await r.click('[data-act=end-early]'); await r.click('[data-act=end-early]'); eq((await txt(r,'main h1')).trim(),'Tourist','lowest rank');
await r.click('[data-act=again]'); eq(await r.locator('#fx-tip').count(),0,'tip shown once only');
for (let k=0;k<10;k++){ if ((await st(r)).q.phase==='wager') await r.click('[data-act=wager][data-v="250"]'); await pickFlag(r,true); await r.click('[data-act=bonus]'); await pickBonus(r,k!==4); await r.click('[data-act=next]'); }
s = await st(r); eq(s.screen,'end','round ends'); eq(s.perfect,false,'one bonus missed: not perfect'); eq(await r.locator('#fx-perfect').count(),0,'no perfect stamp'); eq(await r.evaluate(()=>window.__fx.perfects('Sam').length),0,'nothing filed');
await r.click('[data-act=again]');
for (let k=0;k<10;k++){ if ((await st(r)).q.phase==='wager') await r.click('[data-act=wager][data-v="0"]'); await pickFlag(r,true); await r.click('[data-act=bonus]'); await pickBonus(r,true); await r.click('[data-act=next]'); }
s = await st(r); eq(s.score,1680,'perfect with no wager'); eq(s.perfect,true,'the wager is irrelevant'); eq(await r.locator('#fx-perfect').count(),1,'perfect stamp shown'); eq(await r.evaluate(()=>window.__fx.perfects('Sam').length),1,'gold stamp filed');
await r.waitForTimeout(600); await r.screenshot({path:'t1-perfect-end.png', fullPage:true}); await overflow(r,'perfect end');
await r.click('[data-act=board]'); eq(await r.locator('.fx-hrow .fx-gold-star').count(),1,'one starred score; the near miss has none'); await r.waitForTimeout(5400); await r.screenshot({path:'t2-perfect-board.png', fullPage:true}); await overflow(r,'perfect board');
await r.click('[data-act=back]'); await r.click('[data-act=passport]'); await r.click('#pp-book'); await r.waitForTimeout(950); await r.click('[data-act=pp-next]'); await r.waitForTimeout(950); eq(await r.locator('.pp-gold').count(),1,'gold stamp in the passport'); await r.screenshot({path:'t3-perfect-passport.png', fullPage:true}); await overflow(r,'perfect passport');
await r.click('[data-act=back]'); await r.click('[data-act=choose]'); assert((await txt(r,'#fx-perfect-rule')).includes('Perfect round'),'explained on the points screen'); await r.screenshot({path:'t4-perfect-rule.png', fullPage:true});
// a lost wager cannot happen in a perfect round, and a player with none sees the empty gold page
const z = await mk(390, 844, 'dark'); await z.fill('#fx-name','Newcomer'); await z.click('#fx-setup [type=submit]'); await z.click('[data-act=passport]'); await z.click('#pp-book'); await z.waitForTimeout(950); await z.click('[data-act=pp-next]'); await z.waitForTimeout(950);
assert((await txt(z,'#pp-book')).includes('No perfect round yet'),'empty gold page explains itself'); await z.screenshot({path:'t5-perfect-empty.png'});

// ---- D. four players on a desktop, one flag in
const d = await mk(1280, 860, 'light');
await d.fill('#fx-name','Alex'); await d.click('#fx-setup [type=submit]'); await opt(d,'mode','party');
await d.fill('.fx-guest','Robin'); await d.click('[data-act=guest-add]'); await d.locator('.fx-guest').nth(1).fill('Casey'); await d.click('[data-act=guest-add]'); await d.locator('.fx-guest').nth(2).fill('Morgan');
await d.click('[data-act=play]'); eq((await mt(d)).seats.length,4,'four seats'); await turn(d,{flag:true,bonus:true}); await d.click('[data-act=ready]'); await d.waitForTimeout(400); await d.screenshot({path:'q10-party-desktop.png'}); await overflow(d,'desktop party');

// ---- F. eight players, five flags each, from the well-known set
const g = await mk(375, 667, 'light');
await g.fill('#fx-name','Alex'); await g.click('#fx-setup [type=submit]'); await opt(g,'mode','party'); await opt(g,'pool','known');
const crowd = ['Robin','Casey','Morgan','Grandma','Grandpa','Uncle Joe','Aunt Mary'];
for (let k=0;k<7;k++){ if (k) await g.click('[data-act=guest-add]'); await g.locator('.fx-guest').nth(k).fill(crowd[k]); }
await g.screenshot({path:'s1-eight-setup.png', fullPage:true}); await overflow(g,'eight setup');
await opt(g,'each','10'); await g.click('[data-act=play]'); m = await mt(g); eq(m.seats.length,8,'eight seats'); eq(m.each,10,'ten each');
let dealt = m.seats.flatMap(x=>x.S.round.map(r=>r.a2)); eq(new Set(dealt).size,80,'eighty different flags: the whole well-known set'); assert(dealt.every(a=>known.includes(a)),'all from the well-known set');
await g.click('[data-act=end-early]'); await g.click('[data-act=end-early]'); await g.click('[data-act=choose]'); await opt(g,'each','5');
await g.click('[data-act=play]'); m = await mt(g); eq(m.each,5,'five each');
dealt = m.seats.flatMap(x=>x.S.round.map(r=>r.a2)); eq(new Set(dealt).size,40,'forty different flags'); assert(dealt.every(a=>known.includes(a)),'all from the well-known set');
await g.screenshot({path:'s2-eight-pass.png', fullPage:true}); await overflow(g,'eight pass');
for (let k=0;k<40;k++) await turn(g,{flag:k%8!==3,bonus:k%2===0,wager:0});
s = await st(g); m = await mt(g); eq(s.screen,'match','eight-player game ends'); eq(await g.locator('#fx-final .fx-hrow').count(),8,'eight rows in the result'); eq(m.seats[3].S.score,0,'the player who missed everything has nothing');
await g.waitForTimeout(3300); await g.screenshot({path:'s3-eight-match.png', fullPage:true}); await overflow(g,'eight match');

// ---- G. the deck: a flag waits as long as the set allows before it comes round again
const k = await mk(390, 844, 'light');
const sim = await k.evaluate(() => {
  const fx = window.__fx, pool = fx.POOLS.known.codes, out = {};
  const run = (need, games) => { localStorage.removeItem('fx-seen'); const hist = []; let worst = 0, soonest = 99;
    for (let g = 0; g < games; g++) { const codes = fx.deck(pool, need).slice(0, need); if (new Set(codes).size !== need) return { broken: true }; fx.markSeen(codes);
      if (g) worst = Math.max(worst, codes.filter(c => hist[g - 1].includes(c)).length);
      for (const c of codes) for (let j = g - 1; j >= 0; j--) if (hist[j].includes(c)) { soonest = Math.min(soonest, g - j); break; }
      hist.push(codes); }
    return { worst, soonest }; };
  out.single = run(10, 40); out.four5 = run(20, 30); out.six5 = run(30, 30); out.four10 = run(40, 30); out.six10 = run(60, 30); out.eight10 = run(80, 10);
  // old saved data with a flag listed twice must not deal that flag twice
  localStorage.setItem('fx-seen', JSON.stringify([...pool, ...pool.slice(0, 30)])); const again = fx.deck(pool, 40); out.dupes = again.length - new Set(again).size; out.list = fx.seenList().length;
  return out; });
console.log('deck', JSON.stringify(sim));
assert(sim.single.soonest >= 5,'single rounds: no flag back within four rounds'); eq(sim.single.worst,0,'single rounds: nothing repeated from the round before');
eq(sim.four5.worst,0,'4 x 5: nothing repeated from the game before'); eq(sim.six5.worst,0,'6 x 5: nothing repeated from the game before');
eq(sim.four10.worst,0,'4 x 10 from 80 flags: nothing repeated from the game before'); eq(sim.six10.worst,40,'6 x 10 from 80 flags: only the unavoidable forty repeat'); assert(!sim.eight10.broken,'8 x 10 deals all eighty'); eq(sim.dupes,0,'no flag dealt twice from old data'); eq(sim.list,80,'history holds each flag once');

// ---- E. a page update in the middle of a pass-and-play game carries the whole game across
await pickFlag(d,false); await d.click('[data-act=next]'); await turn(d,{flag:true,bonus:false});      // seats 1 and 2 have played; seat 3 is on the hand-over screen
const snap = await d.evaluate(()=>JSON.stringify({ S: window.__fx.state, P: window.__fx.player, M: window.__fx.match }));
const ctx2 = await browser.newContext({viewport:{width:390,height:844}}); const e = await ctx2.newPage(); e.on('pageerror',x=>errors.push('pageerror '+x.message));
await e.addInitScript(data => { window.claude = { hot: { data: JSON.parse(data) } }; }, snap); await e.goto(url); await e.waitForTimeout(300);
s = await st(e); m = await mt(e); eq(s.screen,'pass','restored on the hand-over screen'); eq(await who(e),'Morgan','restored at the right seat'); eq(m.seats.map(x=>x.S.score).join(),'150,0,100,0','scores restored');
assert((await txt(e)).includes('Standings'),'standings once someone has played');
await turn(e,{flag:true,bonus:true}); eq(await who(e),'Alex','play carries on round the table'); m = await mt(e); eq(m.seats[3].S.score,150,'restored seat scores normally'); eq(m.seats[0].S.i,1,'Alex on his second flag');
await e.screenshot({path:'q11-restored.png', fullPage:true});
// a snapshot from before pass and play existed still restores a single-player round
const ctx3 = await browser.newContext({viewport:{width:390,height:844}}); const f = await ctx3.newPage(); f.on('pageerror',x=>errors.push('pageerror '+x.message));
await opt(r,'mode','free'); await r.click('[data-act=play]');
const solo = await r.evaluate(()=>JSON.stringify({ S: window.__fx.state, P: window.__fx.player }));
await f.addInitScript(data => { window.claude = { hot: { data: JSON.parse(data) } }; }, solo); await f.goto(url); await f.waitForTimeout(300);
eq((await st(f)).screen,'play','single round restored'); eq(await who(f),'Sam','single player restored'); eq(await f.evaluate(()=>window.__fx.match),null,'no match');

// ---- H. starting fresh: two taps on the high scores screen erase this device's scores and passports, and leave its settings
const h = await mk(390, 844, 'light');
await h.click('[data-act=board]'); eq(await h.locator('#fx-wipe').count(),0,'nothing to clear on a new device'); await h.click('[data-act=back]');
await h.evaluate(() => { const t = Date.now(), row = { name:'Alex', avatar:'🦊', score:1250, streak:9, clock:false, perfect:false, t };
  localStorage.setItem('fx-tables', JSON.stringify({ world:[row] })); localStorage.setItem('fx-bests', JSON.stringify({ 'world|alex':{ score:1250, streak:9 } }));
  localStorage.setItem('fx-passport', JSON.stringify({ alex:['FR','JP','BR'] })); localStorage.setItem('fx-perfect', JSON.stringify({ alex:[{ t, score:1250, table:'world', clock:false }] }));
  localStorage.setItem('fx-people', JSON.stringify({ alex:{ name:'Alex', avatar:'🦊' } })); localStorage.setItem('fx-mute', 'true'); localStorage.setItem('fx-text', 'true'); });
await h.reload(); await h.waitForTimeout(300);
await h.click('[data-act=board]'); await h.click('[data-act=tab][data-v=world]'); eq(await h.locator('.fx-hrow:not(.empty)').count(),1,'the saved score shows');
eq((await txt(h,'#fx-wipe')).trim(),'Start fresh on this device','start fresh is offered');
await h.click('#fx-wipe'); assert((await txt(h,'#fx-wipe')).includes('Tap again'),'it asks twice'); eq(await h.locator('.fx-hrow:not(.empty)').count(),1,'one tap clears nothing');
await h.screenshot({path:'w1-wipe-confirm.png', fullPage:true}); await overflow(h,'wipe confirm');
await h.click('[data-act=tab][data-v=known]'); eq((await txt(h,'#fx-wipe')).trim(),'Start fresh on this device','looking at another table withdraws the question');
await h.click('#fx-wipe'); await h.click('#fx-wipe');
eq(await h.locator('#fx-wipe').count(),0,'nothing left to clear');
eq(await h.evaluate(()=>['world','known','daily'].map(t=>window.__fx.tableRows(t).length).join()),'0,0,0','every table is empty');
eq(await h.evaluate(()=>window.__fx.stamps('Alex').length + window.__fx.perfects('Alex').length),0,'passport and gold stamps are gone');
eq(await h.evaluate(()=>localStorage.getItem('fx-mute') + localStorage.getItem('fx-text')),'truetrue','settings are kept');
await h.reload(); await h.waitForTimeout(300); await h.fill('#fx-name','Alex'); await h.click('#fx-setup [type=submit]');
assert((await txt(h)).includes('Passport · 0 of'),'a clean passport after reloading'); eq(await h.evaluate(()=>window.__fx.tableRows('world').length),0,'and clean tables');

await browser.close();
console.log(errors.length ? errors.join('\n') : 'ALL PARTY CHECKS PASSED');
