// Draws the app icons: the game's gold compass on passport navy. Run once; the PNGs are kept in site/icons.
import sharp from 'sharp';
import fs from 'fs';
const emblem = (cx, cy, scale) => `<g transform="translate(${cx} ${cy}) scale(${scale}) translate(-60 -60)" color="#E2BE6A">
  <circle cx="60" cy="60" r="57" fill="none" stroke="currentColor" stroke-width="1.8"/>
  <circle cx="60" cy="60" r="50.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-dasharray=".1 7.83"/>
  <circle cx="60" cy="60" r="44" fill="none" stroke="currentColor" stroke-width="1.2"/>
  <g transform="translate(60 60) scale(1.78) translate(-24 -24)">
    <path d="M24 24 34 14M24 24 34 34M24 24 14 34M24 24 14 14" stroke="currentColor" stroke-width="1.6" fill="none"/>
    <path d="M24 2.500 27.600 20.400 45.500 24 27.600 27.600 24 45.500 20.400 27.600 2.500 24 20.400 20.400Z" fill="currentColor"/>
    <path d="M24 2.500 24 24 20.400 20.400ZM45.500 24 24 24 27.600 20.400ZM24 45.500 24 24 27.600 27.600ZM2.500 24 24 24 20.400 27.600Z" fill="#14274A"/>
  </g>
</g>`;
const svg = (size, share, radius) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs><radialGradient id="g" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#1E3766"/><stop offset="1" stop-color="#101F3C"/></radialGradient></defs>
  <rect width="512" height="512" rx="${radius}" fill="url(#g)"/>
  ${emblem(256, 256, 512 * share / 120)}
</svg>`;
fs.mkdirSync('site/icons', { recursive: true });
const png = (file, size, share) => sharp(Buffer.from(svg(size, share, 0))).png().toFile('site/icons/' + file);
await png('icon-512.png', 512, .74);
await png('icon-192.png', 192, .74);
await png('apple-touch-icon.png', 180, .74);
await png('icon-maskable-512.png', 512, .56);          // extra margin: Android crops this one to a circle or squircle
fs.writeFileSync('site/icons/favicon.svg', svg(64, .8, 112));
console.log('icons written');
