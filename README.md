# Steve's journey to 1,000,000 and more

Sixty years of Steve's flying (1,547 legs, 1965–2025) as one three.js scene: a scroll story that ends in an explorable globe.
Live at https://nikwilliamson.github.io/flight-story/

## Develop
    npm install
    npm run dev

## Data
`src/data/flights.json` is generated from the master workbook, which stays out of this repo:

    npm run data -- "/path/to/Flight Log.xlsx"   # needs pandas + openpyxl

Fare and hotel never leave the script. Notes are kept in the data but never displayed.

## Deploy
Every push to `main` builds and deploys to GitHub Pages (`.github/workflows/deploy.yml`). Pull requests build only.

## Debug hash params
- `#ch=hockey` scrolls to the end of a chapter (ids in `src/story/chapters.ts`); `#ch=jump&p=0.5` stops part-way through.
- `#shot=hockey` frames one chapter's shot (names in `src/story/shots.ts`); `#tour` steps through all of them.
- `#hl=trip-266` lights a set of legs (`airport-MCO`, `airline-UA`, `family-B747`, `plane-G-VIRG` work too).
- `#raw` (no post effects), `#noui` (globe only), `#classic` (stylized atmosphere only), `#probe` (exposes camera, timeline and scroll state on window).
