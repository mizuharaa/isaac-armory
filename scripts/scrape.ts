/**
 * Isaac Armory data scraper.
 *
 * Talks to the bindingofisaacrebirth.fandom.com MediaWiki API (never rendered
 * HTML), parses infobox templates, inverts item-pool pages, merges curated
 * overrides, and writes normalized JSON + a parse-failure report.
 *
 * Resumable: every API response is cached in data/.cache/ (see lib/api.ts).
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  categoryMembers,
  fileUrls,
  getLiveRequestCount,
  pageImages,
  pageWikitext,
} from "./lib/api";
import { findInfobox, KNOWN_CHARACTER_FIELDS, KNOWN_ITEM_FIELDS } from "./lib/infobox";
import { fetchPoolDrafts } from "./lib/pools";
import {
  CharacterSchema,
  ItemSchema,
  PoolSchema,
  type Character,
  type Dlc,
  type Item,
  type Pool,
  type StatModifiers,
} from "./lib/schema";
import { nameKey, slugify } from "./lib/slug";
import { extractBehaviorTags, extractStatModifiers } from "./lib/statExtract";
import { stripWikitext } from "./lib/wikitext";

const DATA_DIR = path.resolve("data");

// ---------------------------------------------------------------------------
// Report collector
// ---------------------------------------------------------------------------
const report = {
  skippedNoInfobox: [] as string[],
  parseWarnings: [] as string[],
  ambiguousStats: [] as { title: string; hints: string[] }[],
  unresolvedPoolNames: [] as { pool: string; name: string }[],
  missingPoolPages: [] as string[],
  missingImages: [] as string[],
  unknownInfoboxFields: {} as Record<string, number>,
  notes: [] as string[],
};

function noteUnknownFields(kind: "item" | "character", fields: Record<string, string>) {
  const known = kind === "item" ? KNOWN_ITEM_FIELDS : KNOWN_CHARACTER_FIELDS;
  for (const key of Object.keys(fields)) {
    if (!known.has(key)) {
      const tag = `${kind}:${key}`;
      report.unknownInfoboxFields[tag] = (report.unknownInfoboxFields[tag] ?? 0) + 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Field parsers
// ---------------------------------------------------------------------------
function parseId(raw: string | undefined, title: string): number | null {
  if (!raw) {
    report.parseWarnings.push(`${title}: infobox has no id field`);
    return null;
  }
  const n = parseInt(stripWikitext(raw), 10);
  if (Number.isNaN(n)) {
    report.parseWarnings.push(`${title}: unparseable id "${raw}"`);
    return null;
  }
  return n;
}

function parseQuality(raw: string | undefined, title: string): Item["quality"] {
  if (!raw) return null;
  // When the field lists per-DLC values, prefer the one marked {{dlc|r…}}.
  const repentance = raw.match(/\{\{dlc\|r[^}]*\}\}\s*:?\s*([0-4])/i);
  const nums = [...stripWikitext(raw).matchAll(/[0-4]/g)].map((m) => parseInt(m[0], 10));
  if (nums.length === 0) return null;
  if (nums.length > 1 && !repentance) {
    report.parseWarnings.push(`${title}: multiple quality values "${raw}" — took last`);
  }
  const val = repentance ? parseInt(repentance[1], 10) : nums[nums.length - 1];
  return val as Item["quality"];
}

function parseRecharge(raw: string | undefined): Item["recharge"] {
  if (!raw) return undefined;
  const s = stripWikitext(raw).toLowerCase();
  if (!s) return undefined;
  if (/one[\s-]?time/.test(s)) return "one_time";
  if (/unlimited|none/.test(s)) return "unlimited";
  if (/second|timed/.test(s)) return "timed";
  const m = s.match(/\d+/);
  if (m) return parseInt(m[0], 10);
  return "timed";
}

// ---------------------------------------------------------------------------
// Overrides
// ---------------------------------------------------------------------------
interface StatOverride {
  source: string;
  statModifiers: StatModifiers;
  behaviorTags?: string[];
  note?: string;
}

async function loadJson<T>(rel: string): Promise<T> {
  return JSON.parse(await readFile(path.join(DATA_DIR, rel), "utf8")) as T;
}

/** Repentance display formula; the stat engine (Milestone 2) owns the real math. */
function derivedTearDelay(tearsDelta: number): number {
  const arg = Math.max(0, 1.3 * tearsDelta + 1);
  return Math.round((16 - 6 * Math.sqrt(arg)) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Items & trinkets
// ---------------------------------------------------------------------------
interface BuildContext {
  dlcByTitle: Map<string, Dlc>;
  statOverrides: Record<string, StatOverride>;
}

function buildItem(
  page: { title: string; wikitext: string },
  ctx: BuildContext,
): Item | null {
  const infobox = findInfobox(page.wikitext);
  if (!infobox || infobox.kind === "character") {
    report.skippedNoInfobox.push(page.title);
    return null;
  }
  noteUnknownFields("item", infobox.fields);
  const f = infobox.fields;

  const name = f.name ? stripWikitext(f.name) : page.title;
  const slug = slugify(page.title);
  const description = f.description ? stripWikitext(f.description) : "";
  const override = ctx.statOverrides[slug];

  let statModifiers: StatModifiers = {};
  let statModifiersSource: Item["statModifiersSource"] = "none";
  if (override) {
    statModifiers = override.statModifiers;
    statModifiersSource = "override";
  } else if (description) {
    const { mods, ambiguous } = extractStatModifiers(description);
    if (Object.keys(mods).length > 0) {
      statModifiers = mods;
      statModifiersSource = "auto";
    }
    if (ambiguous.length > 0) report.ambiguousStats.push({ title: page.title, hints: ambiguous });
  }

  const behaviorTags = [
    ...new Set([
      ...(f.tags ? stripWikitext(f.tags).split(/\s+/).filter(Boolean) : []),
      ...extractBehaviorTags(description),
      ...(override?.behaviorTags ?? []),
    ]),
  ];

  const devilPriceRaw = f["devil price"] ? parseInt(stripWikitext(f["devil price"]), 10) : NaN;

  const item: Item = {
    id: parseId(f.id, page.title),
    slug,
    name,
    wikiTitle: page.title,
    type: infobox.kind,
    quality: parseQuality(f.quality, page.title),
    pools: [],
    quote: f.quote ? stripWikitext(f.quote) : "",
    description,
    recharge: infobox.kind === "active" ? parseRecharge(f.recharge) : undefined,
    devilPrice: Number.isNaN(devilPriceRaw) ? undefined : devilPriceRaw,
    statModifiers,
    statModifiersSource,
    behaviorTags,
    spawnSources:
      infobox.kind === "trinket" && f.pool
        ? stripWikitext(f.pool).split(",").map((s) => s.trim()).filter(Boolean)
        : undefined,
    imageUrl: null,
    dlc: ctx.dlcByTitle.get(page.title) ?? "rebirth",
    unlockCondition: f["unlocked by"] ? stripWikitext(f["unlocked by"]) : undefined,
  };
  return item;
}

async function fetchPages(
  titles: string[],
  label: string,
): Promise<{ title: string; wikitext: string }[]> {
  const out: { title: string; wikitext: string }[] = [];
  const seen = new Set<string>();
  let done = 0;
  for (const title of titles) {
    const page = await pageWikitext(title);
    done++;
    if (done % 50 === 0) console.log(`  ${label}: ${done}/${titles.length}`);
    if (!page) {
      report.parseWarnings.push(`${title}: page fetch failed`);
      continue;
    }
    if (seen.has(page.title)) continue; // redirect duplicate
    seen.add(page.title);
    out.push(page);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------
const CHARACTER_IMAGE_OVERRIDES: Record<string, string> = {
  "??? (Character)": "File:Blue Baby App.png",
  "Tainted ???": "File:Tainted Blue Baby App.png",
  "Jacob and Esau": "File:Jacob App.png",
  "Tainted Eden": "File:Character Tainted Eden appearance.png",
};

async function resolveImages(
  records: { wikiTitle: string; imageUrl: string | null }[],
  guess: (wikiTitle: string) => string,
  fallbackPattern: RegExp,
): Promise<void> {
  const guesses = new Map(records.map((r) => [r.wikiTitle, guess(r.wikiTitle)]));
  const resolved = await fileUrls([...guesses.values()]);
  const missing: { wikiTitle: string; imageUrl: string | null }[] = [];
  for (const record of records) {
    const url = resolved.get(guesses.get(record.wikiTitle)!);
    if (url) record.imageUrl = url;
    else missing.push(record);
  }

  // Fallback: look at the page's actual image list and pick the best match.
  const fallbackPicks = new Map<string, string>();
  for (const record of missing) {
    const files = await pageImages(record.wikiTitle);
    const pick =
      files.find((t) => fallbackPattern.test(t)) ??
      files.find((t) => /\.png$/i.test(t));
    if (pick) fallbackPicks.set(record.wikiTitle, pick);
  }
  const fallbackResolved = await fileUrls([...new Set(fallbackPicks.values())]);
  for (const record of missing) {
    const pick = fallbackPicks.get(record.wikiTitle);
    const url = pick ? fallbackResolved.get(pick) : undefined;
    if (url) record.imageUrl = url;
    else report.missingImages.push(record.wikiTitle);
  }
}

// ---------------------------------------------------------------------------
// items.xml hook (optional, gitignored — game files never committed)
// ---------------------------------------------------------------------------
async function applyItemsXml(items: Item[]): Promise<void> {
  const xmlPath = path.join(DATA_DIR, "raw", "items.xml");
  if (!existsSync(xmlPath)) {
    report.notes.push(
      "data/raw/items.xml not present — wiki is the source of truth for IDs/qualities.",
    );
    return;
  }
  const xml = await readFile(xmlPath, "utf8");
  const byName = new Map<string, Record<string, string>>();
  for (const tag of xml.matchAll(/<(passive|active|familiar|trinket)\b([^>]*?)\/?>/g)) {
    const attrs: Record<string, string> = { _tag: tag[1] };
    for (const a of tag[2].matchAll(/(\w+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    if (attrs.name) byName.set(nameKey(attrs.name), attrs);
  }
  let matched = 0;
  for (const item of items) {
    const attrs = byName.get(nameKey(item.name)) ?? byName.get(nameKey(item.wikiTitle));
    if (!attrs) continue;
    matched++;
    if (attrs.id) item.id = parseInt(attrs.id, 10);
    if (attrs.quality) item.quality = parseInt(attrs.quality, 10) as Item["quality"];
    if (attrs.maxcharges && item.type === "active") item.recharge = parseInt(attrs.maxcharges, 10);
  }
  report.notes.push(
    `items.xml found: ${matched}/${items.length} records overridden with game data (IDs, qualities, charges).`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("== Isaac Armory scraper ==");

  const statOverridesFile = await loadJson<{ overrides: Record<string, StatOverride> }>(
    "overrides/stat-modifiers.json",
  );
  const curated = await loadJson<{
    characters: Record<string, any>;
  }>("overrides/character-stats.json");

  // -- Enumerate ------------------------------------------------------------
  console.log("Enumerating categories…");
  const [collectibleTitles, trinketTitles, characterTitles] = [
    await categoryMembers("Collectibles"),
    await categoryMembers("Trinkets"),
    await categoryMembers("Characters"),
  ];
  console.log(
    `  ${collectibleTitles.length} collectible pages, ${trinketTitles.length} trinket pages, ${characterTitles.length} character pages`,
  );

  const dlcByTitle = new Map<string, Dlc>();
  const dlcCategories: [string, Dlc][] = [
    ["Added in Afterbirth", "afterbirth"],
    ["Added in Afterbirth+", "afterbirth_plus"],
    ["Added in Repentance", "repentance"],
  ];
  for (const [category, dlc] of dlcCategories) {
    for (const title of await categoryMembers(category)) {
      if (!dlcByTitle.has(title)) dlcByTitle.set(title, dlc);
    }
  }
  console.log(`  DLC categories mapped for ${dlcByTitle.size} pages`);

  const ctx: BuildContext = { dlcByTitle, statOverrides: statOverridesFile.overrides };

  // -- Items & trinkets -----------------------------------------------------
  console.log("Fetching collectible pages…");
  const collectiblePages = await fetchPages(collectibleTitles, "collectibles");
  const items = collectiblePages
    .map((p) => buildItem(p, ctx))
    .filter((i): i is Item => i !== null && i.type !== "trinket");

  console.log("Fetching trinket pages…");
  const trinketPages = await fetchPages(trinketTitles, "trinkets");
  const trinkets = trinketPages
    .map((p) => buildItem(p, ctx))
    .filter((i): i is Item => i !== null && i.type === "trinket");

  // Slug uniqueness within each file.
  for (const list of [items, trinkets]) {
    const seen = new Map<string, Item>();
    for (const item of list) {
      const clash = seen.get(item.slug);
      if (clash) {
        report.parseWarnings.push(`slug collision: "${item.wikiTitle}" vs "${clash.wikiTitle}"`);
        item.slug = `${item.slug}-${item.id ?? "x"}`;
      }
      seen.set(item.slug, item);
    }
  }

  // -- Pools ----------------------------------------------------------------
  console.log("Fetching item-pool pages…");
  const poolDrafts = await fetchPoolDrafts(
    (m) => console.log(`  ${m}`),
    (t) => report.missingPoolPages.push(t),
  );

  const slugByKey = new Map<string, string>();
  for (const item of items) {
    slugByKey.set(nameKey(item.name), item.slug);
    slugByKey.set(nameKey(item.wikiTitle), item.slug);
  }
  const resolveItemName = (name: string): string | null => {
    const key = nameKey(name);
    return (
      slugByKey.get(key) ??
      slugByKey.get(key.replace(/^the /, "")) ??
      slugByKey.get(`the ${key}`) ??
      null
    );
  };

  const itemsBySlug = new Map(items.map((i) => [i.slug, i]));
  const pools: Pool[] = [];
  for (const draft of poolDrafts) {
    const poolSlug = slugify(draft.name) + (draft.greedMode ? "-greed" : "");
    const resolvedEntries: Pool["items"] = [];
    for (const entry of draft.entries) {
      const slug = resolveItemName(entry.name);
      if (!slug) {
        report.unresolvedPoolNames.push({ pool: draft.wikiTitle, name: entry.name });
        continue;
      }
      resolvedEntries.push({ slug, ...(entry.dlc ? { dlc: entry.dlc } : {}) });
      const item = itemsBySlug.get(slug)!;
      if (!item.pools.includes(poolSlug)) item.pools.push(poolSlug);
    }
    pools.push({
      slug: poolSlug,
      name: draft.name,
      wikiTitle: draft.wikiTitle,
      greedMode: draft.greedMode,
      items: resolvedEntries,
    });
  }

  // -- Characters -----------------------------------------------------------
  console.log("Fetching character pages…");
  const characterPages = await fetchPages(characterTitles, "characters");
  const characterPageBySlug = new Map<string, { title: string; unlockCondition?: string }>();
  for (const page of characterPages) {
    const infobox = findInfobox(page.wikitext);
    if (!infobox || infobox.kind !== "character") continue;
    noteUnknownFields("character", infobox.fields);
    characterPageBySlug.set(slugify(page.title), {
      title: page.title,
      unlockCondition: infobox.fields["unlocked by"]
        ? stripWikitext(infobox.fields["unlocked by"])
        : undefined,
    });
  }

  const characters: Character[] = [];
  for (const [slug, c] of Object.entries(curated.characters)) {
    const scraped = characterPageBySlug.get(slug);
    if (!scraped) {
      report.parseWarnings.push(`curated character "${slug}" has no matching wiki page — check slug`);
    }
    const stats = {
      ...c.stats,
      tearDelay: derivedTearDelay(c.stats.tearsDelta ?? 0),
    };
    const altForm = c.altForm
      ? {
          ...c.altForm,
          stats: c.altForm.stats
            ? {
                ...c.altForm.stats,
                ...(c.altForm.stats.tearsDelta !== undefined
                  ? { tearDelay: derivedTearDelay(c.altForm.stats.tearsDelta) }
                  : {}),
              }
            : undefined,
        }
      : undefined;
    characters.push({
      slug,
      name: c.name,
      tainted: c.tainted,
      baseStats: stats,
      health: c.health,
      startingItems: (c.startingItems ?? [])
        .map((name: string) => {
          const resolved = resolveItemName(name);
          if (!resolved) report.parseWarnings.push(`character "${slug}": starting item "${name}" unresolved`);
          return resolved ?? slugify(name);
        }),
      startingTrinkets: c.startingTrinkets?.map((n: string) => slugify(n)),
      innate: c.innate,
      startingPickups: c.startingPickups,
      altForm,
      imageUrl: null,
      wikiTitle: scraped?.title ?? c.name,
      dlc: c.dlc,
      unlockCondition: scraped?.unlockCondition,
      notes: c.notes,
    });
  }

  // -- Images ---------------------------------------------------------------
  console.log("Resolving image URLs…");
  await resolveImages(items, (t) => `File:Collectible ${t} icon.png`, /icon\.png$/i);
  await resolveImages(trinkets, (t) => `File:Trinket ${t} icon.png`, /icon\.png$/i);
  await resolveImages(
    characters,
    (t) => CHARACTER_IMAGE_OVERRIDES[t] ?? `File:${t} App.png`,
    /(App\.png|appearance\.png)$/i,
  );

  // -- items.xml hook ---------------------------------------------------------
  await applyItemsXml([...items, ...trinkets]);

  // -- Validate ---------------------------------------------------------------
  console.log("Validating…");
  let schemaErrors = 0;
  const validate = (records: unknown[], schema: { safeParse: (v: unknown) => any }, label: string) => {
    for (const record of records) {
      const result = schema.safeParse(record);
      if (!result.success) {
        schemaErrors++;
        const name = (record as any)?.slug ?? "?";
        report.parseWarnings.push(`${label} "${name}" failed schema: ${result.error.issues[0]?.message}`);
      }
    }
  };
  validate(items, ItemSchema, "item");
  validate(trinkets, ItemSchema, "trinket");
  validate(characters, CharacterSchema, "character");
  validate(pools, PoolSchema, "pool");

  const countOk = items.length >= 700 && trinkets.length >= 180 && characters.length === 34;
  if (!countOk) {
    report.parseWarnings.push(
      `count check FAILED: ${items.length} items (≥700), ${trinkets.length} trinkets (≥180), ${characters.length} characters (=34)`,
    );
  }

  // -- Write ------------------------------------------------------------------
  const byIdThenName = (a: Item, b: Item) =>
    (a.id ?? 1e9) - (b.id ?? 1e9) || a.name.localeCompare(b.name);
  items.sort(byIdThenName);
  trinkets.sort(byIdThenName);
  pools.sort((a, b) => Number(a.greedMode) - Number(b.greedMode) || a.name.localeCompare(b.name));

  const write = (rel: string, value: unknown) =>
    writeFile(path.join(DATA_DIR, rel), JSON.stringify(value, null, 2) + "\n");
  await write("items.json", items);
  await write("trinkets.json", trinkets);
  await write("characters.json", characters);
  await write("pools.json", pools);
  await writeFile(path.join(DATA_DIR, "report.md"), renderReport(items, trinkets, characters, pools));

  console.log("\n== Done ==");
  console.log(`items:       ${items.length}`);
  console.log(`trinkets:    ${trinkets.length}`);
  console.log(`characters:  ${characters.length}`);
  console.log(`pools:       ${pools.length}`);
  console.log(`live API requests this run: ${getLiveRequestCount()}`);
  console.log(`schema errors: ${schemaErrors}; see data/report.md for parse details`);
  if (schemaErrors > 0 || !countOk) process.exitCode = 1;
}

function renderReport(items: Item[], trinkets: Item[], characters: Character[], pools: Pool[]): string {
  const lines: string[] = [];
  const section = (title: string, body: string[]) => {
    lines.push(`## ${title} (${body.length})`, "");
    lines.push(...(body.length ? body.map((b) => `- ${b}`) : ["_none_"]), "");
  };
  lines.push("# Scrape report", "");
  lines.push(
    `Counts: **${items.length} items**, **${trinkets.length} trinkets**, **${characters.length} characters**, **${pools.length} pools**.`,
    "",
  );
  for (const note of report.notes) lines.push(`> ${note}`, "");
  section("Pages skipped (no recognized infobox)", report.skippedNoInfobox);
  section("Parse warnings", report.parseWarnings);
  section(
    "Ambiguous stat descriptions (need overrides in data/overrides/stat-modifiers.json)",
    report.ambiguousStats.map((a) => `**${a.title}** — ${a.hints.join("; ")}`),
  );
  section(
    "Unresolved pool item names",
    report.unresolvedPoolNames.map((u) => `${u.pool}: "${u.name}"`),
  );
  section("Missing/empty pool pages", report.missingPoolPages);
  section("Records without an image URL", report.missingImages);
  section(
    "Unknown infobox fields (extend the parser?)",
    Object.entries(report.unknownInfoboxFields)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ×${v}`),
  );
  return lines.join("\n") + "\n";
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
