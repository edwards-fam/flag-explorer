import { chromium } from 'playwright';
import path from 'path';
const url = 'file://' + path.resolve('test.html');
const browser = await chromium.launch({ executablePath: process.env.FX_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const [w,h,clock] of [[320,568,true],[360,640,true],[375,667,true],[390,700,true],[390,740,true],[390,760,false],[390,844,true],[430,932,true]]) {
  const ctx = await browser.newContext({viewport:{width:w,height:h}}); const p = await ctx.newPage(); await p.goto(url); await p.waitForTimeout(200);
  const title = await p.evaluate(()=>{ const h=document.querySelector('h1'); return {h:h.scrollWidth, band:h.clientWidth, lines: Math.round(h.getBoundingClientRect().height)}; });
  await p.fill('#fx-name','Alex'); await p.click('#fx-setup [type=submit]');
  await p.click('[data-act=opt][data-k=mode][data-v=free]'); await p.click(`[data-act=opt][data-k=clock][data-v=${clock}]`);
  const picks = await p.evaluate(()=>[...document.querySelectorAll('.fx-pick')].filter(b=>b.getBoundingClientRect().height>46).map(b=>b.textContent.trim()));
  await p.click('[data-act=play]'); await p.waitForTimeout(250);
  const r = await p.evaluate(()=>{
    const opts=[...document.querySelectorAll('#fx-panel .fx-opt')]; const last=opts[opts.length-1].getBoundingClientRect().bottom;
    const lab=opts[0].children[1]; const bad=[]; const btn=opts[0];
    const longest={};
    for (const c of Object.values(window.__fx.C)){ for (const name of [c.name, c.cap]) { lab.textContent=name; window.__fx.fitOpts(); lab.style.overflowWrap='normal'; if (lab.scrollWidth>lab.clientWidth) bad.push(name); lab.style.overflowWrap=''; const f=lab.style.fontSize||'1rem'; longest[f]=(longest[f]||0)+1; } }
    bad.push(JSON.stringify(longest));
    return {last:Math.round(last), bad, sw:document.documentElement.scrollWidth};
  });
  console.log(`${w}x${h}`, 'title right', title.h, '/', title.band, 'h', title.lines, '| answers end', r.last, 'of', h, r.last<=h?'fits':'SCROLL '+(r.last-h), '| wrapped picks', JSON.stringify(picks), '| names that break:', r.bad.join(', ')||'none', r.sw>w?'OVERFLOW':'' );
  await ctx.close();
}
await browser.close();
