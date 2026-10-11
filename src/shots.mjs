import { chromium } from 'playwright';
import path from 'path';
const url = 'file://' + path.resolve('test.html');
const browser = await chromium.launch({ executablePath: process.env.FX_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
async function mk(w,h,scheme){ const ctx = await browser.newContext({viewport:{width:w,height:h}, deviceScaleFactor:2, colorScheme:scheme}); const p = await ctx.newPage(); p.on('pageerror',e=>console.log('pageerror '+e.message)); await p.goto(url); await p.waitForTimeout(300); return p; }
const st = p => p.evaluate(()=>JSON.parse(JSON.stringify(window.__fx.state)));
const pickFlag = async (p, right) => { const s = await st(p); const idx = right ? s.q.options.indexOf(s.q.a2) : s.q.options.findIndex(o=>o!==s.q.a2 && !s.q.out.includes(o)); await p.locator('#fx-panel .fx-opt').nth(idx).click(); };
const pickBonus = async (p, right) => { const s = await st(p); const idx = right ? s.q.bonus.answer : (s.q.bonus.answer+1)%4; await p.locator('#fx-panel .fx-opt').nth(idx).click(); };
const opt = async (p,k,v) => p.click(`[data-act=opt][data-k=${k}][data-v=${v}]`);
for (const [tag,w,h,scheme] of [['L',390,844,'light'],['D',390,844,'dark']]) {
  const p = await mk(w,h,scheme);
  await p.screenshot({path:`y${tag}1-setup.png`, fullPage:true});
  await p.fill('#fx-name','Alex'); await p.locator('button.fx-ava').nth(3).click(); await p.screenshot({path:`y${tag}1b-setup.png`, fullPage:true});
  await p.click('#fx-setup [type=submit]'); await opt(p,'mode','free'); await p.screenshot({path:`y${tag}2-rules.png`, fullPage:true});
  await p.click('[data-act=play]'); await p.waitForTimeout(400); await p.screenshot({path:`y${tag}3-guess.png`});
  await pickFlag(p,true); await p.waitForTimeout(400); await p.screenshot({path:`y${tag}4-right.png`});
  await p.click('[data-act=bonus]'); await p.waitForTimeout(300); await p.screenshot({path:`y${tag}5-bonus.png`});
  await pickBonus(p,true); await p.waitForTimeout(400); await p.screenshot({path:`y${tag}6-bonusdone.png`});
  await p.click('[data-act=next]'); await p.click('[data-id=continent]'); await p.click('[data-id=fifty]'); await p.waitForTimeout(300); await p.screenshot({path:`y${tag}7-hints.png`});
  await pickFlag(p,false); await p.waitForTimeout(400); await p.screenshot({path:`y${tag}8-wrong.png`, fullPage:true});
  await p.click('[data-act=next]');
  for (let k=0;k<7;k++){ await pickFlag(p,true); await p.click('[data-act=bonus]'); await pickBonus(p,k%2===0); await p.click('[data-act=next]'); }
  await p.waitForTimeout(300); await p.screenshot({path:`y${tag}9-wager.png`});
  await p.click('[data-act=wager][data-v="100"]'); await pickFlag(p,true); await p.click('[data-act=bonus]'); await pickBonus(p,true); await p.click('[data-act=next]');
  await p.waitForTimeout(3300); await p.screenshot({path:`y${tag}10-end.png`, fullPage:true});
  await p.click('[data-act=board]'); await p.screenshot({path:`y${tag}11-board.png`, fullPage:true});
  await p.click('[data-act=back]'); await p.click('[data-act=passport]'); await p.screenshot({path:`y${tag}12-passport.png`, fullPage:true});
  await p.click('#pp-book'); await p.waitForTimeout(950); await p.screenshot({path:`y${tag}13-id.png`, fullPage:true});
}
await browser.close();
