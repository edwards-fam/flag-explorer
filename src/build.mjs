// Builds the game from src/template.html and the flag data.
//   node build.mjs                 → the hosted site in ../docs (what GitHub Pages serves)
//   node build.mjs --artifact FILE → the single-file version published as a Claude artifact
//   node build.mjs --test          → test.html, with the debug handle the automated playthroughs use
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

const args = process.argv.slice(2), mode = args.includes('--artifact') ? 'artifact' : args.includes('--test') ? 'test' : 'site';
const countries = JSON.parse(fs.readFileSync('countries.json', 'utf8')), flags = JSON.parse(fs.readFileSync('flags.json', 'utf8'));
const subs = [...new Set(countries.map(c => c.sub))];
const rows = countries.map(o => [o.a2, o.name, o.cap, o.cont, subs.indexOf(o.sub), o.pop, o.lat, o.lng, o.borders.join(' '), o.decoys.join(' '), o.ar]);
const data = JSON.stringify({ c: rows, f: flags }).replace(/</g, '\\u003c');
let tpl = fs.readFileSync('template.html', 'utf8');
if (!tpl.includes('/*__DATA__*/null')) throw new Error('data marker missing from template.html');
tpl = tpl.replace('/*__DATA__*/null', () => data);
const stripDebug = html => html.replace(/\n\s*window\.__fx = .*\n/, '\n');

if (mode === 'artifact') {
  const out = args[args.indexOf('--artifact') + 1];
  if (!out) throw new Error('give the output file after --artifact');
  fs.writeFileSync(out, stripDebug(tpl));
  console.log('artifact →', out, (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
  process.exit(0);
}

// The hosted and test pages carry their own styles and typefaces instead of loading them from other sites.
execSync('npx tailwindcss -c tw.config.cjs -i tw.in.css -o tw.out.css --minify', { stdio: 'pipe' });
const tailwind = fs.readFileSync('tw.out.css', 'utf8');
let body = tpl.replace(/<title>[^<]*<\/title>\s*/, '').replace(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>\s*/, '').replace(/<script src="https:\/\/cdn\.tailwindcss[^>]+><\/script>\s*/, '');
if (/fonts\.googleapis|cdn\.tailwindcss/.test(body)) throw new Error('an outside stylesheet or script is still referenced');

const FONTS = [['barlow-condensed', [500, 600, 700]], ['figtree', [400, 500, 600, 700]], ['ibm-plex-mono', [500, 600]]];
const fontFiles = [];
function fontCss(urlFor) {
  let css = '';
  for (const [pkg, weights] of FONTS) for (const w of weights) {
    const src = fs.readFileSync(`node_modules/@fontsource/${pkg}/${w}.css`, 'utf8');
    for (const block of src.match(/@font-face\s*{[^}]*}/g)) {
      const file = (block.match(/files\/([\w-]+\.woff2)/) || [])[1];
      if (!file || !/-latin(-ext)?-\d+-normal\.woff2$/.test(file)) continue;
      fontFiles.push([pkg, file]);
      css += block.replace(/src:[^;]*;/, `src: url(${urlFor(pkg, file)}) format('woff2');`).replace(/\s+/g, ' ') + '\n';
    }
  }
  return css;
}
const reset = `html{-webkit-text-size-adjust:100%}body{margin:0;min-height:100dvh;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)}img{max-width:100%}[hidden]{display:none!important}`;

if (mode === 'test') {
  const css = fontCss((pkg, file) => `data:font/woff2;base64,${fs.readFileSync(`node_modules/@fontsource/${pkg}/files/${file}`).toString('base64')}`);
  fs.writeFileSync('test.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Flag Explorer (test)</title><style>:root{color-scheme:light}${reset}</style><style>${css}</style><style>${tailwind}</style></head><body>${body}</body></html>`);
  console.log('test.html written');
  process.exit(0);
}

// ---------- the hosted site ----------
const site = path.resolve('../docs');
fs.mkdirSync(path.join(site, 'fonts'), { recursive: true });
fs.mkdirSync(path.join(site, 'icons'), { recursive: true });
const css = fontCss((pkg, file) => `fonts/${file}`);
for (const [pkg, file] of fontFiles) fs.copyFileSync(`node_modules/@fontsource/${pkg}/files/${file}`, path.join(site, 'fonts', file));
for (const f of fs.readdirSync('site')) if (f !== 'sw.js' && f !== 'shell.html') fs.cpSync(path.join('site', f), path.join(site, f), { recursive: true });
fs.writeFileSync(path.join(site, '.nojekyll'), '');

const shell = fs.readFileSync('site/shell.html', 'utf8');
const html = shell.replace('/*__RESET__*/', () => reset).replace('/*__FONTS__*/', () => css).replace('/*__TAILWIND__*/', () => tailwind).replace('<!--__GAME__-->', () => stripDebug(body));
fs.writeFileSync(path.join(site, 'index.html'), html);

// The service worker's name changes whenever anything it stores changes, which is how installed copies learn there is an update.
const precache = ['./', 'manifest.webmanifest', ...fs.readdirSync(path.join(site, 'icons')).map(f => 'icons/' + f), ...fontFiles.filter(([, f]) => !f.includes('-ext-')).map(([, f]) => 'fonts/' + f)];
const hash = crypto.createHash('sha256');
for (const f of precache) hash.update(fs.readFileSync(path.join(site, f === './' ? 'index.html' : f)));
const version = hash.digest('hex').slice(0, 12);
fs.writeFileSync(path.join(site, 'sw.js'), fs.readFileSync('site/sw.js', 'utf8').replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(precache)));
fs.writeFileSync(path.join(site, 'version.txt'), version + '\n');
console.log('site →', site, '| index.html', (html.length / 1024).toFixed(0) + ' KB', '| version', version, '| stored for offline use:', precache.length, 'files');
