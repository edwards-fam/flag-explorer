# Flag Explorer

A flag-guessing game for family and friends. Name the country each flag flies over: ten flags a round, a daily challenge that is the same for everyone, pass and play for up to eight on one device, and a passport that collects a stamp for every flag you name.

**Play it:** https://edwards-fam.github.io/flag-explorer/

On a phone, open the link and choose "Add to Home Screen" from the browser's share menu. The game then opens like an app and works without a connection.

## What is in this repository

| Folder | What it holds |
|---|---|
| `docs/` | The published site. GitHub Pages serves this folder as it is. Do not edit it by hand; it is rebuilt from `src/`. |
| `src/template.html` | The game: styles, markup and script in one file. The rules and scoring numbers sit in a labelled block at the top of the script. |
| `src/countries.json`, `src/flags.json` | The 197 countries and their flags, embedded into the page when it is built. |
| `src/site/` | What the hosted version adds: the page shell, the service worker (offline play and updates), the web manifest and the app icons. |
| `src/build.mjs` | Builds the site into `docs/`. |
| `src/play3.mjs`, `src/play4.mjs`, `src/site-test.mjs` | Automated playthroughs that check scoring, pass and play, and the hosted site. |

## Building

```
cd src
npm install
npm run build      # rebuilds docs/
npm test           # runs every automated check (needs a Chromium for Playwright)
```

Everything a player saves (scores, passport, settings) stays in their own browser. The site sets no cookies and sends nothing anywhere.

## Credits

- Flag artwork: public-domain drawings from the [country-flags](https://github.com/hampusborgos/country-flags) project.
- Country facts: [mledoze/countries](https://github.com/mledoze/countries). Population figures: World Bank.
- Typefaces: Barlow Condensed, Figtree and IBM Plex Mono, each under the SIL Open Font License.
