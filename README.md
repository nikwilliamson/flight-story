# Steve's journey to 1,000,000 and more

Sixty years of Steve's flying (1,547 legs, 1965–2025) as one three.js scene: a scroll story that ends in an explorable globe.
Live at https://nikwilliamson.github.io/flight-story/

## Develop
    npm install
    npm run dev

## Data
`src/data/flights.json` is generated from the master workbook, which stays out of this repo:

    npm run data -- "/path/to/Flight Log.xlsx"   # needs pandas + openpyxl

Fare, hotel and Steve's notes never leave the script, and his trip purposes only when they are on the shown list (`src/content/trip-names.json`); `npm run check` fails on anything private. The repo and the site are public.

## Plane photos
`public/planes/<TAIL>.webp` plus `public/planes/manifest.json` (file, author, licence and source per tail; tails without a usable photo under `missing`). Openly licensed Wikimedia Commons photos only, so credit the author and licence wherever a photo is shown. After adding flights, run the **Plane photos** workflow (Actions tab) or locally:

    pip install pillow && python scripts/fetch_tail_photos.py   # --all to re-pick every tail

## Deploy
Every push to `main` builds and deploys to GitHub Pages (`.github/workflows/deploy.yml`). Pull requests build only.

## Share links
After the story the tabs take over (Explore, Trips, Airports, Planes, Airlines, Log). Each tab and every row has a link:
`#trips`, `#log`, `#trip-266`, `#airport-mco`, `#plane-g-virg`, `#family-b747`, `#airline-ua`, `#decade-1990`, `#leg-1385`.
Opening one goes straight to the end of the story, opens its tab and flies the globe to it.
Homes have links too (`#home-kix-2000`). A visitor who arrives on a link sees Journey as "Start the journey" until they've been to the story.

## Keys
- `→` / `←` step a chapter at a time; the page still scrolls freely.
- `Esc` closes the sheet, then clears the selection.

## Debug hash params
- `#ch=hockey` scrolls to the end of a chapter (ids in `src/story/chapters.ts`); `#ch=jump&p=0.5` stops part-way through.
- `#shot=hockey` frames one chapter's shot (names in `src/story/shots.ts`); `#tour` steps through all of them.
- `#hl=trip-266` lights a set of legs (`airport-MCO`, `airline-UA`, `family-B747`, `plane-G-VIRG` work too).
- `#raw` (no post effects), `#noui` (globe only), `#classic` (stylized atmosphere only), `#probe` (exposes camera, timeline, scroll state and the store on window).
