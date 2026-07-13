# Isaac Armory & Playground

Unofficial, non-commercial fan project for *The Binding of Isaac: Rebirth* (and its DLC):
an item encyclopedia (**Armory**), a character-select screen (**Avatar Screen**), and a
canvas sandbox room (**Playground**) with live stat computation.

> **Legal stance.** The Binding of Isaac © Edmund McMillen / Nicalis. This repository
> contains **no game-owned binary assets** — no sprite sheets, no ripped images. The
> `data/` JSON stores only text and *URLs* to images hosted by the community wiki
> ([bindingofisaacrebirth.fandom.com](https://bindingofisaacrebirth.fandom.com)), which are
> hot-loaded at runtime with attribution. Wiki text content is used under
> [CC-BY-SA](https://www.fandom.com/licensing). Anything we draw ourselves is original
> placeholder pixel art in a similar style.

## Data pipeline

`pnpm scrape` runs `scripts/scrape.ts`, which talks to the wiki's **MediaWiki API**
(never scrapes rendered HTML):

1. Enumerates `Category:Collectibles`, `Category:Trinkets`, `Category:Characters`
   (with `cmcontinue` pagination) and the `Added in <DLC>` categories.
2. Fetches each page's wikitext (`action=parse`, `redirects=1`) and parses the
   `{{infobox …}}` templates with a nested-template tokenizer.
3. Fetches every `* (Item Pool)` page and inverts the `{{pool items}}` lists into
   per-item pool membership.
4. Auto-extracts stat modifiers from effect descriptions, then applies hand-curated
   overrides from `data/overrides/` (each entry cites its wiki source).
5. Resolves sprite URLs via `prop=imageinfo` (URLs only; nothing downloaded into the repo).
6. Writes `data/items.json`, `data/trinkets.json`, `data/characters.json`,
   `data/pools.json`, and a parse-failure report at `data/report.md`.

The scraper rate-limits itself to ~2 requests/second, sets a descriptive User-Agent, and
caches every raw API response in `data/.cache/` — re-runs are offline and instant, and an
interrupted run resumes where it left off.

**Optional source of truth:** if you own the game and drop its `items.xml` into
`data/raw/`, the scraper prefers it for IDs/qualities and uses the wiki only for
descriptions. `data/raw/` is gitignored — game files are never committed.

## Regenerating data

```sh
pnpm install
pnpm scrape          # ~10 min on a cold cache, seconds afterwards
```

Then check `data/report.md` for pages that failed to parse.
