import { chromium } from 'playwright';
import path from 'path';
const url = 'file://' + path.resolve('test.html');
const browser = await chromium.launch({ executablePath: process.env.FX_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
async function mk(w,h,scheme){ const ctx = await browser.newContext({viewport:{width:w,height:h}, deviceScaleFactor:2, colorScheme:scheme}); const p = await ctx.newPage(); p.on('pageerror',e=>errors.push('pageerror '+e.message)); p.on('console',m=>{ if(m.type()==='error') errors.push('console '+m.text()); }); await p.goto(url); await p.waitForTimeout(300); return p; }
const st = p => p.evaluate(()=>JSON.parse(JSON.stringify(window.__fx.state)));
const overflow = async (p,label) => { const o = await p.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:window.innerWidth,sh:document.documentElement.scrollHeight,ih:window.innerHeight})); if(o.sw>o.iw) errors.push(`overflow at ${label}: ${o.sw}>${o.iw}`); return o; };
const assert = (c,m)=>{ if(!c) errors.push('ASSERT '+m); };
const eq = (a,b,m)=>assert(a===b, `${m}: expected ${b}, got ${a}`);
const pickFlag = async (p, right) => { const s = await st(p); const idx = right ? s.q.options.indexOf(s.q.a2) : s.q.options.findIndex(o=>o!==s.q.a2 && !s.q.out.includes(o)); await p.locator('#fx-panel .fx-opt').nth(idx).click(); };
const pickBonus = async (p, right) => { const s = await st(p); const idx = right ? s.q.bonus.answer : (s.q.bonus.answer+1)%4; await p.locator('#fx-panel .fx-opt').nth(idx).click(); };
const wager = async (p, v) => { await p.click(`[data-act=wager][data-v="${v}"]`); };
const perfect = async (p, n) => { for (let k=0;k<n;k++){ if ((await st(p)).q.phase==='wager') await wager(p,0); await pickFlag(p,true); await p.click('[data-act=bonus]'); await pickBonus(p,true); await p.click('[data-act=next]'); } };
const toRules = async (p, name) => { await p.fill('#fx-name', name); await p.click('#fx-setup [type=submit]'); };
const opt = async (p,k,v) => p.click(`[data-act=opt][data-k=${k}][data-v=${v}]`);
const score = async p => (await st(p)).score;

// ---- A. screens 1 and 2
const p = await mk(390, 760, 'light');
await toRules(p,'Alex'); let s = await st(p); eq(s.screen,'rules','rules screen');
assert((await p.evaluate(()=>window.__fx.opts.mode))==='daily','daily preselected before it is played');
await p.screenshot({path:'u1-rules-daily.png', fullPage:true}); await overflow(p,'rules daily');
await opt(p,'mode','free'); await opt(p,'pool','world'); await opt(p,'clock','false');
assert(!(await p.textContent('#app')).includes('Speed bonus'),'no speed row without clock');
await opt(p,'clock','true'); assert((await p.textContent('#app')).includes('Speed bonus'),'speed row with clock'); await p.screenshot({path:'u2-rules-free.png', fullPage:true}); await overflow(p,'rules free');
await opt(p,'clock','false');
eq(await p.evaluate(()=>window.__fx.POOLS.known.codes.length),80,'well-known pool size');

// ---- C. free play, scripted arithmetic
await p.click('[data-act=play]'); s = await st(p); eq(s.mode,'free','free mode'); eq(s.clock,false,'no clock'); assert(await p.locator('#fx-clock-bar').count()===0,'no clock bar');
await perfect(p,2); eq(await score(p),300,'after 2');
await pickFlag(p,true); s = await st(p); eq(s.score,410,'3rd in a row pays +10'); await p.waitForTimeout(350); await p.screenshot({path:'u3-streak.png'});
await p.click('[data-act=bonus]'); await pickBonus(p,true); await p.click('[data-act=next]'); eq(await score(p),460,'after 3');
await p.click('[data-id=continent]'); await pickFlag(p,true); s = await st(p); eq(s.score,540,'hinted answer earns no streak bonus'); eq(s.streak,0,'a hint ends the streak'); eq(s.log[3].streakPts,0,'no streak pts'); assert((await p.textContent('#fx-panel')).includes('The hint ends your streak of 3'),'streak loss explained'); await p.click('[data-act=next]');
await perfect(p,1); eq(await score(p),690,'streak restarts from one after a hint'); eq((await st(p)).streak,1,'streak 1');
await pickFlag(p,false); s = await st(p); eq(s.score,690,'miss'); eq(s.streak,0,'streak reset'); await p.click('[data-act=next]');
await pickFlag(p,true); await p.click('[data-act=bonus]'); await pickBonus(p,false); await p.click('[data-act=next]'); eq(await score(p),790,'bonus missed');
await perfect(p,2); eq(await score(p),1100,'after 9');
s = await st(p); eq(s.q.phase,'wager','final flag opens with the wager'); assert(await p.locator('.fx-plate.sealed').count()===1,'flag sealed'); assert(!(await p.locator('.fx-flag').isVisible()),'flag hidden while sealed');
await p.screenshot({path:'u4-wager.png'}); await overflow(p,'wager');
await wager(p,250); s = await st(p); eq(s.q.phase,'guess','guess after wager'); eq(s.q.wager,250,'stake'); assert(await p.locator('.fx-hint:disabled').count()===3,'hints barred'); assert(await p.locator('.fx-flag').isVisible(),'flag shown');
await p.click('[data-id=fifty]',{force:true}).catch(()=>{}); eq((await st(p)).q.hints.length,0,'hint refused on wagered flag');
await pickFlag(p,true); eq(await score(p),1460,'wager won'); eq(await p.locator('canvas').count(),0,'no confetti before the last answer'); await p.waitForTimeout(350); await p.screenshot({path:'u5-wager-won.png'});
await p.click('[data-act=bonus]'); await pickBonus(p,true); await p.click('[data-act=next]');
s = await st(p); eq(s.screen,'end','ended'); eq(s.score,1510,'final'); eq(s.place,1,'placed'); eq(await p.locator('canvas').count(),1,'confetti on the results screen');
const tot = await p.evaluate(()=>window.__fx.totals(window.__fx.state.log)); console.log('totals', JSON.stringify(tot));
eq(tot.base-tot.cost+tot.bonus+tot.streak+tot.speed+tot.wager, 1510, 'breakdown adds up'); eq(tot.streak,30,'streak total'); eq(tot.wager,250,'wager total');
eq(await p.evaluate(()=>window.__fx.stamps('Alex').length),9,'nine stamps'); eq(s.newStamps,9,'new stamps counted');
await p.waitForTimeout(3200); await p.screenshot({path:'u6-end.png', fullPage:true}); await overflow(p,'end');
await p.click('[data-act=passport]'); eq((await st(p)).screen,'passport','passport'); eq((await st(p)).pp,0,'opens on the cover'); assert(await p.locator('.pp-cover').count()===1,'cover shown');
await p.screenshot({path:'x1-cover.png'}); await overflow(p,'passport cover');
await p.click('#pp-book'); eq((await st(p)).pp,1,'tap opens it'); await p.waitForTimeout(200); await p.screenshot({path:'x2-turning.png'}); await p.waitForTimeout(900);
eq(await p.locator('.pp-leaf').count(),1,'one leaf after the turn'); assert((await p.textContent('#pp-book')).includes('Explorer of the world'),'identity page'); await p.screenshot({path:'x3-id.png'}); await overflow(p,'passport id');
const nPages = await p.evaluate(()=>window.__fx.ppPages().length); let seen = 0, shot = false;
for (let k=2;k<nPages;k++){ await p.click('[data-act=pp-next]'); await p.waitForTimeout(950); const c = await p.locator('.pp-stamp').count(); seen += c; if (c>=2 && !shot) { shot = true; await p.screenshot({path:'x4-stamps.png'}); await overflow(p,'passport stamps'); } }
eq(seen,9,'nine stamps across the pages'); eq((await st(p)).pp,nPages-1,'last page'); assert(await p.locator('[data-act=pp-next]').isDisabled(),'no next on last page');
await p.click('[data-act=pp-prev]'); await p.waitForTimeout(950); eq((await st(p)).pp,nPages-2,'previous page'); eq(await p.locator('.pp-leaf').count(),1,'one leaf after turning back');
await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(950); eq((await st(p)).pp,nPages-3,'arrow key turns back');
await p.click('[data-act=back]'); eq((await st(p)).screen,'end','back to end');
await p.click('[data-act=board]'); assert(await p.locator('[data-act=tab][aria-pressed=true]').textContent()==='Whole world','world tab'); eq(await p.locator('.fx-hrow.hot').count(),1,'hot row');
await p.screenshot({path:'u8-board.png', fullPage:true}); await overflow(p,'board');
// ---- D. play again, lose a 500 wager
await p.click('[data-act=again]'); s = await st(p); eq(s.screen,'play','again'); await perfect(p,9); eq(await score(p),1500,'nine perfect');
eq(await p.locator('[data-act=wager]').count(),3,'three wager choices'); await wager(p,250); await pickFlag(p,false); s = await st(p); eq(s.score,1250,'wager lost'); eq(s.log[9].wagerPts,-250,'entry wager'); await p.waitForTimeout(300); await p.screenshot({path:'u9-wager-lost.png'});
await p.click('[data-act=next]'); eq((await st(p)).place,2,'second place');
// low score cannot wager
await p.click('[data-act=again]'); for (let k=0;k<9;k++){ await pickFlag(p,false); await p.click('[data-act=next]'); } s = await st(p); eq(s.q.phase,'guess','no wager offered with nothing to risk');
await p.click('[data-act=end-early]'); await p.click('[data-act=end-early]');
// ---- E. clock
await p.click('[data-act=choose]'); eq(await p.evaluate(()=>window.__fx.opts.mode),'daily','daily still preselected');
await opt(p,'mode','free'); await opt(p,'pool','known'); await opt(p,'clock','true'); await p.click('[data-act=play]');
s = await st(p); eq(s.clock,true,'clock on'); eq(s.table,'known','known table'); assert(s.round.every(r=>['US','CA','MX','BR','AR','CL','CO','PE','CU','JM','UY','VE','GB','IE','FR','DE','IT','ES','PT','NL','BE','CH','AT','SE','NO','DK','FI','IS','PL','CZ','HU','GR','TR','RU','UA','HR','RO','CN','JP','KR','KP','IN','PK','BD','TH','VN','PH','ID','MY','SG','SA','AE','IL','IR','IQ','NP','LK','EG','MA','NG','KE','ZA','GH','ET','TN','DZ','AU','NZ','PA','CR','DO','EC','BG','RS','AL','TW','QA','LB','SN','CM'].includes(r.a2)),'all from well-known pool');
assert(await p.locator('#fx-clock-bar').count()===1,'clock bar'); await p.waitForTimeout(250); assert(/\d+ s/.test(await p.textContent('#fx-pos')),'seconds shown');
await p.screenshot({path:'u10-clock.png'});
const back = (p,sec)=>p.evaluate(sec=>{ window.__fx.state.q.t0 = Date.now()-sec*1000; },sec);
await back(p,2); await pickFlag(p,true); eq((await st(p)).log[0].speedPts,30,'within 3s +30'); await p.click('[data-act=bonus]'); await pickBonus(p,true); await p.click('[data-act=next]');
await back(p,4.5); await pickFlag(p,true); eq((await st(p)).log[1].speedPts,15,'within 6s +15'); await p.click('[data-act=bonus]'); await pickBonus(p,true); await p.click('[data-act=next]');
await back(p,7); await pickFlag(p,true); eq((await st(p)).log[2].speedPts,0,'after 6s +0'); await p.click('[data-act=bonus]'); await pickBonus(p,true); await p.click('[data-act=next]');
eq(await score(p), 100+30+50 + 100+15+50 + 100+10+0+50, 'clock arithmetic');
await back(p,15.5); await p.waitForTimeout(500); s = await st(p); eq(s.q.phase,'result','timed out'); eq(s.log[3].timedOut,true,'timeout flagged'); eq(s.streak,0,'timeout resets streak');
await p.waitForTimeout(300); await p.screenshot({path:'u11-timeout.png'}); await overflow(p,'timeout');
await p.click('[data-act=next]'); await p.click('[data-act=end-early]'); await p.click('[data-act=end-early]');
const known = await p.evaluate(()=>window.__fx.tableRows('known')); eq(known.length,1,'known table entry'); eq(known[0].clock,true,'clock flag saved');
// ---- F. daily
await p.click('[data-act=choose]'); await p.click('[data-act=play]'); s = await st(p); eq(s.mode,'daily','daily'); eq(s.practice,false,'first try counts'); eq(s.clock,false,'daily has no clock');
const dailyRound = JSON.stringify(s.round);
await perfect(p,10); s = await st(p); eq(s.score,2180-500-0, 'perfect untimed round without a wager = 1680');
assert(await p.locator('#fx-share').count()===1,'share box'); console.log((await p.textContent('#fx-share')).replace(/\n/g,' | '));
await p.waitForTimeout(3000); await p.screenshot({path:'u12-daily-end.png'}); await overflow(p,'daily end');
await p.click('[data-act=copy]'); await p.waitForTimeout(200); console.log('copy button says:', await p.textContent('[data-act=copy]'));
await p.click('[data-act=board]'); assert(await p.locator('[data-act=tab][aria-pressed=true]').textContent()==='Today','today tab'); eq(await p.locator('.fx-hrow:not(.empty)').count(),1,'daily row');
await p.click('[data-act=tab][data-v=known]'); eq(await p.locator('.fx-hrow:not(.empty)').count(),1,'known tab row'); await p.screenshot({path:'u13-board-known.png', fullPage:true});
await p.click('[data-act=back]'); await p.click('[data-act=choose]'); eq(await p.evaluate(()=>window.__fx.opts.mode),'free','free preselected once daily is played');
assert((await p.textContent('#app')).includes('You scored 1,680 today'),'daily status shown');
await opt(p,'mode','daily'); await p.click('[data-act=play]'); s = await st(p); eq(s.practice,true,'replay is practice'); eq(JSON.stringify(s.round),dailyRound,'replay has the same round');
await p.click('[data-act=end-early]'); await p.click('[data-act=end-early]'); assert((await p.textContent('#app')).includes('Practice replay'),'practice label'); eq(await p.evaluate(()=>window.__fx.tableRows('daily').length),1,'still one daily row');
// per-player settings: Alex last chose well-known + clock; a new name starts from the defaults; Alex's come back
const opts = p => p.evaluate(()=>({pool:window.__fx.opts.pool, clock:window.__fx.opts.clock}));
await p.click('[data-act=change-player]'); await toRules(p,'Mia'); eq(JSON.stringify(await opts(p)),JSON.stringify({pool:'world',clock:false}),'new player gets defaults');
await opt(p,'mode','free'); assert(await p.locator('[data-k=pool][data-v=world][aria-pressed=true]').count()===1,'world shown selected for Mia');
await p.click('[data-act=rules-back]'); await toRules(p,'alex'); eq(JSON.stringify(await opts(p)),JSON.stringify({pool:'known',clock:true}),'returning player gets their own settings');
await p.click('[data-act=rules-back]'); await toRules(p,'Mia'); eq(JSON.stringify(await opts(p)),JSON.stringify({pool:'world',clock:false}),'and Mia keeps hers');
// same daily round for a different person in a different browser
const p2 = await mk(390, 760, 'light'); await toRules(p2,'Morgan'); await p2.click('[data-act=play]'); eq(JSON.stringify((await st(p2)).round),dailyRound,'daily round identical across devices');
// ---- G. mute persists
await p2.click('[data-act=mute]'); eq(await p2.evaluate(()=>localStorage.getItem('fx-mute')),'true','mute stored'); assert((await p2.textContent('[data-act=mute]')).includes('off'),'mute label');
// ---- H. small dark screens
const m = await mk(360, 640, 'dark'); await toRules(m,'Wwwwwwwwwwwwww'); await opt(m,'mode','free'); await opt(m,'clock','true'); await m.screenshot({path:'v1-rules-small.png', fullPage:true}); await overflow(m,'small rules');
await m.click('[data-act=play]'); await m.waitForTimeout(300); await m.screenshot({path:'v2-clock-small.png'}); let o = await overflow(m,'small clock'); console.log('small phone play: panel bottom', await m.evaluate(()=>document.querySelector('#fx-panel').getBoundingClientRect().bottom), 'viewport', o.ih);
await perfect(m,9); await m.waitForTimeout(200); await m.screenshot({path:'v3-wager-small.png'}); await overflow(m,'small wager'); await wager(m,100); await pickFlag(m,true); await m.click('[data-act=bonus]'); await pickBonus(m,true); await m.click('[data-act=next]');
await m.waitForTimeout(3000); await m.click('[data-act=board]'); await m.screenshot({path:'v4-board-small.png', fullPage:true}); await overflow(m,'small board');
await m.click('[data-act=back]'); await m.click('[data-act=passport]'); await m.screenshot({path:'v5-passport-small.png'}); await overflow(m,'small passport'); await m.click('#pp-book'); await m.waitForTimeout(950); await m.click('[data-act=pp-next]'); await m.waitForTimeout(950); await m.screenshot({path:'v6-passport-page-small.png'}); await overflow(m,'small passport page');
const d = await mk(1280, 860, 'light'); await toRules(d,'Grandma Rose'); await d.screenshot({path:'w1-rules-desktop.png'}); await d.click('[data-act=play]'); await perfect(d,3); await d.screenshot({path:'w2-play-desktop.png'}); await overflow(d,'desktop');
console.log(errors.length? 'ERRORS:\n'+errors.join('\n') : 'ALL CHECKS PASSED');
await browser.close();
