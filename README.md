# Isaac Armory & Playground

Unofficial, non-commercial fan project for *The Binding of Isaac: Rebirth*
(+ Afterbirth / Afterbirth+ / Repentance): an item encyclopedia (**Armory**),
a character-select screen (**Avatar Screen**), and a canvas sandbox room
(**Playground**) with live stat computation from the game's real formulas.

> **Legal stance.** The Binding of Isaac © Edmund McMillen / Nicalis. This
> repository contains **no game-owned binary assets** — no sprite sheets, no
> ripped images. The `data/` JSON stores only text and *URLs* to sprites hosted
> by the community wiki
> ([bindingofisaacrebirth.fandom.com](https://bindingofisaacrebirth.fandom.com)),
> which the app hot-loads at runtime with attribution. Wiki text content is used
> under [CC-BY-SA](https://www.fandom.com/licensing). Room tiles and props the
> app draws itself are original vector-pixel art in the game's palette.

## Quick start

```sh
pnpm install
pnpm scrape     # regenerate data/ from the wiki API (~10 min cold, seconds cached)
pnpm test       # 38 stat-engine tests, every expected value wiki-cited
pnpm dev        # run the app
pnpm build      # static production build (dist/)
```

## The three pillars

- **`/` Avatar Screen** — keyboard carousel over all 34 characters (arrows/A/D;
  **Tab** flips to the Tainted variant). Real character sprites with a stepped
  idle bob, engine-computed stat bars, pixel-heart health, starting items.
  **Enter** drops the selected character into the Playground.
- **`/armory`** — all 720 items + 189 trinkets on real game sprites. Filter by
  item pool (29 pools, Greed Mode toggleable), type, quality, DLC; fuzzy search
  over names and descriptions; sort by name / ID / quality / stat impact.
  Click any tile for the inspect view (quality stars, pools, stat deltas,
  behavior tags, unlock condition, devil/shop price, wiki link) and **Equip** it.
- **`/playground`** — a 480×270 fixed-timestep canvas room, integer-scaled with
  no smoothing. **WASD** moves (speed stat → px/s), **arrow keys** fire tears in
  4 directions (fire rate = tear delay, travel = range, velocity = shot speed).
  The room has rocks (bomb-only), multi-stage poop, spikes, animated fires,
  chaining TNT and a **punching-bag dummy** with floating damage numbers and a
  rolling DPS readout — equip Polyphemus and watch it spike. **E** drops bombs.
  The top door leads to the **Shop** (three priced pedestals from the real Shop
  item pool); **B** opens the quick-equip overlay; **`** (backtick) opens the
  debug spawner that puts any item on a pedestal — walk over it for the classic
  hold-above-head pickup pose. The left HUD recomputes live through
  `src/engine/stats.ts` with up/down stat flashes.

## Data pipeline (`scripts/scrape.ts`)

Talks to the wiki's **MediaWiki API** — never scrapes rendered HTML:

1. Enumerates `Category:Collectibles` / `Trinkets` / `Characters` (cmcontinue
   pagination) plus the `Added in <DLC>` categories.
2. Fetches each page's wikitext (`action=parse`, `redirects=1`) and parses the
   `{{infobox …}}` templates with a nested-template tokenizer (handles
   `{{hearts|red=3}}` inside field values, dual-form `{{infobox characters}}`,
   DLC-conditional renames like "No. 2, r: Number Two").
3. Fetches every `* (Item Pool)` page and inverts the `{{pool items}}` lists
   into per-item pool membership (per-pool DLC markers preserved).
4. Auto-extracts numeric stat modifiers from effect descriptions; hand-curated
   `data/overrides/stat-modifiers.json` overrides the tricky ones (every entry
   cites its wiki source). Character base stats are hand-transcribed from
   `Template:Character Tables` into `data/overrides/character-stats.json`.
5. Resolves sprite URLs in batches via `prop=imageinfo` — URLs only.
6. Writes `data/{items,trinkets,characters,pools}.json` (zod-validated) plus a
   parse-failure report at `data/report.md` (currently zero warnings).

Rate-limited to ~2 req/s with a descriptive User-Agent; every response is
cached in `data/.cache/`, so re-runs are offline and interrupted runs resume.

**Game-file hook:** drop the game's `items.xml` into `data/raw/` (gitignored —
never committed) and the scraper prefers it for IDs/qualities/charges.

## Stat engine (`src/engine/stats.ts`)

Pure, unit-tested implementation of the community-documented formulas:

- damage `3.5 × √(ups × 1.2 + 1) × charMult`, then flat bonuses, then item
  multipliers — ordering proven by the Polyphemus page's `(Damage + 4) × 2`;
  Magic Mushroom and Cricket's Head share one non-stacking ×1.5 slot
- tear delay `16 − 6 × √(tears × 1.3 + 1)` (linear branch below the sqrt
  domain), fire-rate multipliers, the delay-5 soft cap and its bypass items
  (Soy Milk hits exactly 15 tears/sec at base, as the wiki documents)
- speed clamped to [0.1, 2.0]; range/shot-speed floors; luck additive

`pnpm test` runs 38 cases; each expected value's wiki page is cited inline.

## Art & animation rules

All sprite motion is stepped (`steps()` in CSS, frame counters on canvas) —
no easing on pixel art. `image-rendering: pixelated` everywhere; canvas uses
`imageSmoothingEnabled = false` and integer scaling only. Item, trinket and
character art is always the real game sprite hot-loaded from the wiki; only
things without a hosted sprite (floor, walls, props, tears) are drawn
originally, in the game's desaturated brown/blood palette.

## Deploying

`pnpm build` emits a fully static `dist/` (relative base + hash routing), so it
works as-is on GitHub Pages, Vercel, Netlify or any static file host.
