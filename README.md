# CricMobile

Offline 3D cricket for iPhone (portrait). T20 / ODI / Test / Practice nets, plus series & tournaments:
Test / ODI / T20I bilateral series, ODI World Cup, T20 World Cup, IPL, Big Bash, PSL, SA20, CPL, BPL and LPL.
35 national teams and 51 league teams, built from `../MalePlayers.csv`.

## Install on iPhone (works offline after first load)
1. Host the `dist/` folder anywhere static (e.g. drag the folder onto https://app.netlify.com/drop, or GitHub Pages).
2. Open the URL in Safari on the iPhone -> Share -> Add to Home Screen.
3. Launch from the home screen icon once while online; after that it runs fully offline (service worker cache).

`dist/cricmobile.html` is a single self-contained file (no network requests) if you prefer to host only one file.

## Player data
`../MalePlayers.csv` is bundled at build time. Edit it and rebuild to change players. Teams come from the
"Associated teams" column; the team list, kits and categories are in `TEAMS` in `src/data.js`.
Default XIs per format are picked from the ratings and the CSV batting positions (league XIs respect overseas limits).
Unknown skin colours are guessed from players of the same nationality. Fielding is derived from overall + age.

In-game edits (Teams & Players -> tap a player) and CSV import still work:
team,name,number,age,role,bat_hand,bowl_style,overall,batting,bowling,fielding,t20_pos,odi_pos,test_pos

## Build
npm install && node build.mjs
