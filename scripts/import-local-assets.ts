/**
 * Imports locally-extracted game assets (personal use only) into
 * public/assets/, which is GITIGNORED — these files must never be committed,
 * pushed, or deployed. Nicalis asks that unpacked resources not be
 * redistributed; this script only arranges them for YOUR local build.
 *
 * Source: a game copy extracted with the official tools/ResourceExtractor
 * (layout: <src>/resources + <src>/resources-dlc3, dlc3 wins).
 *
 * Usage: pnpm import-assets [srcDir]   (default: C:/Users/VNG/Downloads/Public)
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const SRC = process.argv[2] ?? "C:/Users/VNG/Downloads/Public";
const OUT = path.resolve("public/assets");
const LAYERS = [path.join(SRC, "resources"), path.join(SRC, "resources-dlc3")]; // later wins

const log: string[] = [];
const say = (m: string) => {
  console.log(m);
  log.push(m);
};

function ensure(dir: string) {
  mkdirSync(dir, { recursive: true });
}

/** PNG pixel size straight from the IHDR chunk — no image libs needed. */
function pngSize(file: string): { w: number; h: number } {
  const buf = readFileSync(file);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function* walk(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

/** All gfx files across layers, later layers overriding earlier by rel path. */
function collectGfx(): Map<string, string> {
  const byRel = new Map<string, string>();
  for (const layer of LAYERS) {
    const gfx = path.join(layer, "gfx");
    for (const file of walk(gfx)) {
      byRel.set(path.relative(gfx, file).replace(/\\/g, "/").toLowerCase(), file);
    }
  }
  return byRel;
}

const gfx = collectGfx();
say(`indexed ${gfx.size} gfx files from ${LAYERS.filter((l) => existsSync(l)).length} layers`);

function findOne(patterns: RegExp[]): string | null {
  for (const re of patterns) {
    for (const [rel, full] of gfx) if (re.test(rel)) return full;
  }
  return null;
}

// ---------------------------------------------------------------- items
function importNumbered(kind: "collectibles" | "trinkets", re: RegExp) {
  const dest = path.join(OUT, kind);
  ensure(dest);
  let n = 0;
  for (const [rel, full] of gfx) {
    const m = rel.match(re);
    if (!m) continue;
    copyFileSync(full, path.join(dest, `${parseInt(m[1], 10)}.png`));
    n++;
  }
  say(`${kind}: ${n} sprites`);
}
importNumbered("collectibles", /^items\/collectibles\/collectibles_(\d+)_[^/]+\.png$/);
importNumbered("trinkets", /^items\/trinkets\/trinket_(\d+)_[^/]+\.png$/);

// ---------------------------------------------------------------- characters
const characters: { slug: string; tainted: boolean; name: string }[] = JSON.parse(
  readFileSync(path.resolve("data/characters.json"), "utf8"),
).map((c: any) => ({ slug: c.slug, tainted: c.tainted, name: c.name }));

const norm = (s: string) => s.toLowerCase().replace(/^the/, "").replace(/[^a-z0-9]/g, "");

// character sheets: characters/costumes/character_###[b|x]_name.png
// ("b" = tainted variant sheet, "x" = Repentance-added character; color
// variants like _black are excluded by the single-name-segment pattern)
const sheets = new Map<string, { file: string; taintedSheet: boolean }>();
for (const [rel, full] of gfx) {
  const m = rel.match(/^characters\/costumes\/character_(\d+)([a-z]?)_([a-z0-9]+)\.png$/);
  if (m) sheets.set(`${norm(m[3])}${m[2] === "b" ? "b" : ""}`, { file: full, taintedSheet: m[2] === "b" });
}
// portraits: ui/stage/playerportrait_name.png ("_b" suffix = tainted)
const portraits = new Map<string, string>();
for (const [rel, full] of gfx) {
  const m = rel.match(/^ui\/stage\/playerportrait_([a-z0-9_]+)\.png$/);
  if (m) portraits.set(norm(m[1].replace(/_/g, "")), full);
}
say(`found ${sheets.size} character sheets, ${portraits.size} portraits`);

// manual disambiguation where names diverge from our slugs
const SHEET_ALIAS: Record<string, string> = {
  "blue-baby": "bluebaby",
  "tainted-blue-baby": "bluebabyb",
  "jacob-and-esau": "jacob",
  "tainted-lost": "lostb",
  "the-lost": "lost",
  "tainted-forgotten": "forgottenb",
  "the-forgotten": "forgotten",
  "tainted-jacob": "jacobb",
};
const PORTRAIT_ALIAS: Record<string, string> = {
  "blue-baby": "bluebaby",
  "jacob-and-esau": "jacob",
};

for (const c of characters) {
  const key = norm(c.slug.replace(/^tainted-/, ""));
  const sheetKey = SHEET_ALIAS[c.slug] ?? (c.tainted ? `${key}b` : key);
  const sheet =
    sheets.get(sheetKey) ??
    sheets.get(norm(sheetKey)) ??
    // tainted forms without their own sheet (Tainted Eden) reuse the base one
    (c.tainted ? sheets.get(key) : undefined);
  const portrait =
    portraits.get(norm(PORTRAIT_ALIAS[c.slug] ?? (c.tainted ? `${key}b` : key))) ??
    portraits.get(key);

  const dest = path.join(OUT, "characters", c.slug);
  ensure(dest);
  let overlays = 0;
  let hasHead = false;
  if (sheet) {
    copyFileSync(sheet.file, path.join(dest, "sheet.png"));
    // Costume overlays: the base sheet is only the SKIN — hair, eyepatches,
    // horns, scars etc. live in sibling character_<id>_*.png sheets on the
    // same grid. Allowlisted keywords keep alt-form full bodies (lazarus2,
    // thesoul, esau) from being composited over the base by mistake.
    const bm = path
      .basename(sheet.file)
      .toLowerCase()
      .match(/^character_(\d+[a-z]?)_([a-z0-9]+)\.png$/);
    if (bm) {
      const [, prefix, baseRest] = bm;
      // Custom heads (Azazel, Bethany, Jacob) have their OWN anm2 layout —
      // compositing their sheet flat produces scattered pixels. Export the
      // head sheet + parsed frames so the engine renders it properly.
      for (const [rel, full] of gfx) {
        const hm = rel.match(new RegExp(`^characters/character_${prefix}_([a-z0-9]*head[a-z0-9]*)\\.anm2$`));
        if (!hm) continue;
        // the anm2 names its own spritesheet — resolve it rather than guessing
        const sheetPath = readFileSync(full, "utf8").match(/Spritesheet Path="([^"]+)"/)?.[1];
        if (!sheetPath) continue;
        const png = gfx.get(`characters/${sheetPath.replace(/\\/g, "/").toLowerCase()}`);
        if (!png) continue;
        copyFileSync(png, path.join(dest, "headsheet.png"));
        parseAnm2File(full, path.join(dest, "headanim.json"), null, /^head$/);
        hasHead = true;
        break;
      }
      const overlayRe = new RegExp(`^characters/costumes/character_${prefix}_([a-z0-9_]+)\\.png$`);
      const colorRe = /_(black|blue|green|grey|red|white)$/;
      const partRe = /(hair|head|locks|eyepatch|fez|scars|wig|halo|wings?|horns?|body|bandage)/;
      // one overlay per part type — Eden alone has 40+ random hair sheets
      const usedParts = new Set<string>();
      for (const [rel, full] of [...gfx].sort(([a], [b]) => a.localeCompare(b))) {
        const om = rel.match(overlayRe);
        if (!om) continue;
        const rest = om[1];
        if (rest === baseRest || colorRe.test(rest)) continue;
        // full-size sheets with their own anm2 use a custom layout (Azazel's
        // head) — never composite those; small STRIPS (eyepatch, fez) align
        // with the head row regardless
        if (
          gfx.has(`characters/character_${prefix}_${rest}.anm2`) &&
          pngSize(full).h > 64
        ) continue;
        const part = rest.match(partRe)?.[1];
        if (!part || usedParts.has(part)) continue;
        usedParts.add(part);
        copyFileSync(full, path.join(dest, `overlay_${overlays++}.png`));
      }
      if (overlays || hasHead)
        say(`  ${c.slug}: +${overlays} overlay(s)${hasHead ? " + custom head" : ""}`);
    }
  } else say(`  ! no sheet for ${c.slug} (looked for "${sheetKey}")`);
  writeFileSync(path.join(dest, "manifest.json"), JSON.stringify({ overlays, head: hasHead }));
  if (portrait) copyFileSync(portrait, path.join(dest, "portrait.png"));
  else say(`  ! no portrait for ${c.slug}`);
}

// ---------------------------------------------------------------- environment
const ENV: [string, RegExp[]][] = [
  ["basement_walls.png", [/^backdrop\/01_basement\.png$/]],
  ["basement_nfloor.png", [/^backdrop\/01_basement_nfloor\.png$/]],
  ["basement_lfloor.png", [/^backdrop\/01_lbasementfloor\.png$/]],
  ["shop_walls.png", [/^backdrop\/0b_shop\.png$/]],
  ["shop_nfloor.png", [/^backdrop\/0b_shop_nfloor\.png$/]],
  ["shop_lfloor.png", [/^backdrop\/0b_lshopfloor\.png$/, /^backdrop\/0b_.*floor.*\.png$/]],
  ["rocks.png", [/^grid\/rocks_basement\.png$/, /^grid\/rocks\.png$/]],
  ["poop.png", [/^grid\/grid_poop\.png$/, /^grid\/.*poop.*\.png$/]],
  ["spikes.png", [/^grid\/grid_spikes\.png$/]],
  ["fireplace.png", [/^grid\/grid_fireplace\.png$/]],
  ["pit.png", [/^grid\/grid_pit\.png$/]],
  ["tnt.png", [/^grid\/grid_tnt\.png$/, /grid\/.*tnt.*\.png$/]],
  ["props.png", [/^grid\/props_01_basement\.png$/]],
  ["door.png", [/^grid\/door_01_normaldoor\.png$/, /^grid\/door.*normal.*\.png$/]],
  ["tears.png", [/^bulletatlas\.png$/]],
  ["tearpoof.png", [/effects\/effect_015_tearpoofnotear\.png$/, /effects\/.*tearpoof.*\.png$/]],
  ["bomb.png", [/items\/pick ups\/pickup_016_bomb\.png$/, /pick.*bomb.*\.png$/]],
  ["hearts.png", [/^ui\/ui_hearts\.png$/, /ui\/.*hearts.*\.png$/]],
  ["menubg.png", [/^ui\/main menu\/charactermenubg\.png$/]],
  ["charactermenu.png", [/^ui\/main menu\/charactermenu\.png$/]],
  ["punchingbag.png", [/.*punching.*\.png$/]],
  ["shopkeeper.png", [/shopkeeper.*\.png$/]],
  ["coins.png", [/items\/pick ups\/pickup_015_coin\.png$/, /pick.*coin.*\.png$/]],
  ["laser.png", [/^effects\/effect_018_lasereffects\.png$/]],
  ["laser_tech.png", [/^effects\/effect_018_technologylaser\.png$/]],
  ["laserimpact.png", [/^effects\/effect_050_laserimpact\.png$/]],
  ["explosion.png", [/^effects\/effect_029_explosion\.png$/]],
  ["incubus.png", [/^familiar\/familiar_shooters_80_incubus\.png$/]],
  ["knife2.png", [/^familiar\/familiar_knifepieces\.png$/]],
];
ensure(path.join(OUT, "env"));
const envManifest: Record<string, { w: number; h: number; src: string }> = {};
for (const [name, patterns] of ENV) {
  const found = findOne(patterns);
  if (!found) {
    say(`  ! env asset not found: ${name}`);
    continue;
  }
  const dest = path.join(OUT, "env", name);
  copyFileSync(found, dest);
  const { w, h } = pngSize(dest);
  envManifest[name] = { w, h, src: path.relative(SRC, found).replace(/\\/g, "/") };
  say(`env/${name}  ${w}x${h}  <- ${envManifest[name].src}`);
}
writeFileSync(path.join(OUT, "env", "manifest.json"), JSON.stringify(envManifest, null, 2));

// ---------------------------------------------------------------- anm2 parsing
function parseAnm2(
  relPath: string,
  outName: string,
  wanted: string[] | null,
  layerFilter: RegExp,
): void {
  const file = LAYERS.map((l) => path.join(l, "gfx", relPath)).filter(existsSync).pop();
  if (!file) {
    say(`  ! ${relPath} not found`);
    return;
  }
  parseAnm2File(file, path.join(OUT, "anim", outName), wanted, layerFilter);
  say(`anim/${outName} parsed`);
}

function parseAnm2File(
  file: string,
  outFile: string,
  wanted: string[] | null,
  layerFilter: RegExp,
): void {
  const xml = readFileSync(file, "utf8");
  const attrs = (tag: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const m of tag.matchAll(/(\w+)="([^"]*)"/g)) out[m[1]] = m[2];
    return out;
  };
  // layer id → name
  const layers = new Map<string, string>();
  for (const m of xml.matchAll(/<Layer\b[^>]*\/>/g)) {
    const a = attrs(m[0]);
    layers.set(a.Id, (a.Name ?? "").toLowerCase());
  }
  const anims: Record<string, { layer: string; frames: any[] }[]> = {};
  for (const animMatch of xml.matchAll(/<Animation\b[^>]*Name="([^"]+)"[^>]*>([\s\S]*?)<\/Animation>/g)) {
    const name = animMatch[1];
    if (wanted && !wanted.includes(name)) continue;
    // Self-closing (empty) LayerAnimations would otherwise swallow the next
    // layer's frames in the lazy match below — drop them first.
    const body = animMatch[2].replace(/<LayerAnimation\b[^>]*\/>/g, "");
    const layerAnims: { layer: string; frames: any[] }[] = [];
    for (const la of body.matchAll(/<LayerAnimation\b([^>]*)>([\s\S]*?)<\/LayerAnimation>/g)) {
      const laAttrs = attrs(`<x ${la[1]}>`);
      const layerName = layers.get(laAttrs.LayerId) ?? "?";
      if (!layerFilter.test(layerName)) continue;
      if (laAttrs.Visible === "false") continue;
      const frames = [...la[2].matchAll(/<Frame\b[^>]*\/>/g)].map((f) => {
        const a = attrs(f[0]);
        return {
          x: parseFloat(a.XCrop ?? "0"),
          y: parseFloat(a.YCrop ?? "0"),
          w: parseFloat(a.Width ?? "0"),
          h: parseFloat(a.Height ?? "0"),
          px: parseFloat(a.XPivot ?? "0"),
          py: parseFloat(a.YPivot ?? "0"),
          ox: parseFloat(a.XPosition ?? "0"),
          oy: parseFloat(a.YPosition ?? "0"),
          delay: parseInt(a.Delay ?? "1", 10),
          flipX: a.XScale?.startsWith("-") ?? false,
        };
      });
      if (frames.length) layerAnims.push({ layer: layerName, frames });
    }
    anims[name] = layerAnims;
  }
  ensure(path.dirname(outFile));
  writeFileSync(outFile, JSON.stringify(anims, null, 1));
}
parseAnm2(
  "001.000_player.anm2",
  "player.json",
  ["WalkDown", "WalkLeft", "WalkUp", "WalkRight", "HeadDown", "HeadLeft", "HeadUp", "HeadRight"],
  /body|head/,
);
parseAnm2("002.000_tear.anm2", "tear.json", null, /./);
parseAnm2("007.001_thick red laser.anm2", "brimstone.json", null, /tip|laser/);
parseAnm2("1000.050_brimstoneimpact_static.anm2", "brimimpact.json", null, /./);
parseAnm2("1000.001_bomb explosion.anm2", "explosion.json", null, /./);

// ---------------------------------------------------------------- items.xml → scraper truth
const itemsXml = LAYERS.map((l) => path.join(l, "items.xml")).filter(existsSync).pop();
if (itemsXml) {
  ensure(path.resolve("data/raw"));
  copyFileSync(itemsXml, path.resolve("data/raw/items.xml"));
  say("copied game items.xml -> data/raw/items.xml (gitignored; scraper will prefer it)");
}

writeFileSync(path.join(OUT, "import-log.txt"), log.join("\n") + "\n");
say("\nDone. Reminder: public/assets/ is gitignored — never commit or deploy it.");
