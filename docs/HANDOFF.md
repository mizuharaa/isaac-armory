# Agent Handoff — Isaac Armory & Playground

Written 2026-07-14, end of a long session, at the user's explicit request
before handing the project to a different agent/session. Read this whole
document before touching code — it captures root causes, not just symptoms,
and several "obvious" fixes were already tried and found to be wrong.

**Repo:** `C:\Users\VNG\isaac-armory`, pushed to `git@github.com:mizuharaa/isaac-armory.git`,
branch `main`. Latest commit at time of writing has this handoff doc plus a
round of bug fixes described below.

## What this project is

A fan-made, non-commercial web app for *The Binding of Isaac: Rebirth* (+
DLC), three pillars: an **Armory** (browsable item/trinket encyclopedia,
~909 entries scraped from the wiki), an **Avatar Screen** (character select,
34 characters), and a **Playground** (canvas sandbox room where the selected
character can move, shoot, and equip items with live-computed stats). Full
original spec is in the very first message of this conversation's history
(not reproduced here — read the repo's `README.md` for the maintained
summary).

## Toolchain gotchas (read this first, saves you an hour)

- **PowerShell execution policy**: was blocking `pnpm` entirely on the user's
  machine. Fixed via `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy
  RemoteSigned` — this was already run successfully. If a fresh session still
  can't run `pnpm dev`, that's the first thing to check, and the terminal
  needs to be reopened after the fix (also after Node was first installed).
- **In Claude Code's own sandboxed PowerShell tool calls specifically** (not
  the user's terminal), `pnpm` isn't on PATH even after the fix above — use
  `& "$env:APPDATA\npm\pnpm.cmd" <args>` or refresh PATH first with
  `$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")`.
- **PowerShell 5.1 mangles literal `"` characters inside `git commit -m @'...'@`
  here-strings** — it silently splits the message into separate shell tokens
  and `git commit` fails with `pathspec '...' did not match any files`.
  **Never use double-quote characters in a commit message** when committing
  via this tool; use plain words instead.
- The user runs their own `pnpm dev` in their own terminal and has killed
  background dev servers I started at least twice — **don't start one for
  them**, just tell them the command.

## Data / asset pipeline (context you need before touching characters/items)

- `pnpm scrape` (→ `scripts/scrape.ts`) rebuilds `data/items.json`,
  `trinkets.json`, `characters.json`, `pools.json` from the wiki API +
  `data/overrides/*.json` (hand-curated stat modifiers, tier list, character
  base stats) + optionally `data/raw/items.xml` (the real game's item
  definitions, if present — currently present, gitignored, gives correct
  IDs/qualities for 807/909 items). Fully cached in `data/.cache/` — re-runs
  are instant unless you clear the cache.
- `pnpm import-assets` (→ `scripts/import-local-assets.ts`) reads a **locally
  extracted copy of the actual game** at `C:\Users\VNG\Downloads\Public`
  (extracted with Nicalis's own official `ResourceExtractor` tool, which is
  bundled in that folder) and copies sprites/animation-frame-data into
  `public/assets/` — **gitignored, must never be committed or deployed**
  (the extractor's own readme asks that unpacked resources not be
  redistributed; this is a hard legal line, not a style preference).
  Everything in the app has a **fallback path with zero local assets** (wiki
  image URLs, or original hand-drawn canvas art) so the pushed/deployed repo
  works without this folder. If `public/assets/` is ever missing (fresh
  clone, or after `git clean`), just re-run `pnpm import-assets` if you have
  the extracted game folder, or work with the wiki-fallback rendering.
- **The single most valuable file for "is this item actually wired up":**
  `src/engine/implemented.ts`. It's a canonical `Set` of every item slug that
  has real coded gameplay logic (as opposed to only generic auto-extracted
  stat numbers). The Armory's new **Working / Deco / All** filter reads from
  it, item cards show a green dot, and the detail modal shows an explicit
  status line. `src/engine/implemented.test.ts` asserts every listed slug
  resolves to a real scraped item — **this test already caught one real bug
  this session** (a typo'd slug for The Ludovico Technique meant that weapon
  mode had never once activated). **Whenever you wire up a new item's
  effect** in `src/engine/combat.ts` or `src/game/engine.ts`'s
  `applyActiveEffect`, add its slug to `implemented.ts` too, or the filter
  silently drifts from reality.

## Architecture map

- `src/engine/stats.ts` — pure damage/tears/speed/range/luck formula engine,
  unit-tested (38 tests) against wiki-documented values. Not touched this
  session, believed solid.
- `src/engine/combat.ts` — pure function `deriveCombat(equipped, tags,
  innate, maxDamageMult) → CombatConfig`. Turns the equipped-item slug list
  into: which weapon fires (`fireMode`, one of tears/brimstone/laser/knife/
  lob/bombshot/missile/sword/csection/ludovico, chosen by an if/else-if
  **priority chain** — see "Known limitations" below), how many shots, and a
  long list of boolean/numeric modifier flags (homing, piercing, orbit,
  hover, boomerang, split, wiz, quadChance, flameChance, deadEye, belial,
  pop, wide, alternating, shatter, fireMind, creep, chargeShot, plus two
  **composable spec arrays**: `dots` (damage-over-time effects — each item
  that grants one just appends its own `{name, chance, dps, duration,
  color}` entry) and `specials` (special projectile types — same pattern).
  This composability (arrays instead of per-pair `if` branches) is a hard
  requirement the user has stated multiple times — **do not regress it into
  pairwise special-casing** when adding new items.
  32 tests in `combat.test.ts` cover weapon priority + flag stacking + a few
  named combos.
- `src/game/engine.ts` — the actual `Game` class: canvas render loop, all
  weapon *physics* (tear ballistics, beams, rings, knife, swing, familiars,
  creep puddles, DOT ticking), room/prop state, and now (this session) the
  player HP/damage/respawn system. This file is large (~1900 lines) and is
  where most per-frame bugs live.
- `src/game/assets.ts` — loads locally-extracted sprites/anm2 frame data,
  with `loadCharacterLook()` being the character-appearance entry point (see
  the big section below — **this is where most of the visual bugs are**).
- `src/pages/AvatarScreen.tsx` — character select. **Just had a real
  architectural bug fixed** — see below.
- `src/pages/Playground.tsx` — wires the store (Zustand, `src/store/
  loadout.ts`) to the `Game` instance, renders the HUD overlay.
- `src/pages/Armory.tsx` — the browsable item grid + filters.

## Bugs fixed this session (verified via type-check + test suite; NOT
## verified in a live browser — the person running this should re-test)

1. **Tap-to-fire regression on plain tears.** A previous "wind-up" fix
   applied a blanket half-fire-delay before the *first* shot of *any* fire
   mode, including plain tears — but real Isaac fires a tear instantly on a
   single tap; only charge weapons wind up. Removed the blanket rule from
   `engine.ts`'s main firing branch. Wind-up now only exists via the
   charge/release state machines already built per weapon.

2. **Charge-shot items (Chocolate Milk / Monstro's Lung / Tech X) fired
   NOTHING on a quick tap.** In the real game these are modifiers *on top
   of* your normal tears — tap fires a normal tear, hold-then-release fires
   the big charged shot. The code required `shotCharge > 0.1` to fire
   anything at release, so a quick tap (charge never gets above ~0) fired
   nothing at all. Fixed: a release with `shotCharge <= 0.15` now fires a
   normal tear via the ordinary `fireTears()` path.

3. **Dead Eye's damage-ramp streak could reset itself in the same frame it
   incremented**, when multishot fired several tears simultaneously and only
   some connected — whichever tear's expiry got processed later in the same
   array iteration would reset the streak the earlier hit had just built.
   Changed from "reset on any single tear miss" to "reset if no hit landed
   in the last 1.5 seconds" (`deadEyeLastHit` timestamp), which avoids the
   same-frame race entirely and is closer to real Dead Eye semantics anyway.

4. **The Ludovico Technique's weapon mode never activated.** `combat.ts` had
   `has("ludovico-technique")` but the real scraped slug is
   `the-ludovico-technique`. Caught by the new `implemented.test.ts` slug
   cross-check. Fixed + added `implemented.ts` entry + regression test.

5. **Character switching required a hot-reload to take effect — ROOT CAUSE
   FOUND.** `AvatarScreen` kept a *local* copy of "which character is
   selected" (`index`/`tainted` state, captured **once** at mount via
   `useLoadout.getState()`), and reconciled it into the shared Zustand store
   a tick later via a separate `useEffect`. Zustand's `persist` middleware
   rehydrates from `localStorage` **asynchronously** even though
   `localStorage.getItem` itself is synchronous (the library always wraps it
   in a promise for API consistency with async storage backends). Sequence
   on a real page load:
   1. Store created with default state (`characterSlug: "isaac"`).
   2. React renders `AvatarScreen`; its `useState(() =>
      useLoadout.getState().characterSlug)` lazy initializer runs **before**
      rehydration has resolved — captures `"isaac"` even if the user had
      previously picked, say, Cain.
   3. Microtasks flush; the persisted value (`"cain"`) lands in the store.
   4. `AvatarScreen`'s reconciliation effect fires (effects run after
      microtasks) and sees `store.characterSlug ("cain") !==
      character.slug ("isaac", from the stale local state)` → calls
      `selectCharacter("isaac")`, **stomping the correctly-rehydrated value
      back to Isaac.**
   A hot-reload (or any full module re-execution — Vite HMR invalidating the
   store module counts) re-runs this whole sequence, and depending on timing
   luck, sometimes doesn't hit the race — which is why it looked like
   "switching only works after a reload," when actually reloading is what
   *reintroduces* the risk, it just doesn't always trigger.
   **Fix:** deleted the local state mirror entirely. `AvatarScreen` now
   derives `index`/`tainted` **directly** from the reactive store selector
   (`useLoadout((s) => s.characterSlug)`) on every render — no snapshot, no
   effect, no reconciliation, nothing to race. `cycle()`/`toggleTainted()`
   call `selectCharacter()` synchronously and directly.
   **General lesson for future code in this repo:** any
   `useState(() => useLoadout.getState().x)` pattern is suspect. Use the
   reactive selector `useLoadout((s) => s.x)` instead; never take a one-time
   snapshot of Zustand state and reconcile it back later.
   **Not fully verified**: the user reported this bug *twice* across two
   different "fixes," so treat this third fix with appropriate skepticism —
   test character switching thoroughly (pick a character, navigate to
   Playground, confirm it's right; navigate back, pick a different one,
   confirm again; then hard-refresh the browser and confirm the persisted
   character survives) before considering this closed.

6. **"Enter" appearing to do nothing on the character select screen** — I
   could **not** reproduce this without a live browser, so I could not
   verify a fix. What I did: added `e.preventDefault()` to the Enter handler
   (defensive, in case a focused nav button's native "activate on Enter"
   behavior was interfering) and fixed bug #5 above, which *might* have been
   the actual cause if what the user was really seeing was "I press arrows,
   then Enter, and the OLD character loads in Playground" (i.e., the
   navigation itself worked, but the character was wrong due to the race —
   easy to misread as "Enter does nothing"). **If this is still broken after
   re-testing, next steps:** add a `console.log` in the `onKey` handler to
   confirm the listener even fires; check whether `useNavigate()` inside
   `HashRouter` is failing silently (try `navigate("/playground", { replace:
   false })` or check the browser's address bar actually changes to
   `#/playground`); check for a second, stale keydown listener from a
   previous effect cleanup that didn't run (shouldn't happen with React's
   effect cleanup guarantees, but verify).

7. **HP/damage/death system — this didn't exist at all before.** Player had
   a `hurtFlash` (red screen flash) on hazard contact but no actual HP pool,
   so nothing ever "ran out." Added:
   - `Game.setHealth(maxHalfHearts, noHealth)` — call whenever the character
     or bonus-hearts-from-items changes; heals to full.
   - `Game.takeDamage(amount)` — **the single centralized entry point** for
     all player damage (previously hazard-contact and explosion-self-damage
     each had their own copy-pasted shield-check + hurtFlash logic; now both
     just call `takeDamage()`). Checks Holy Mantle shield first, decrements
     HP by `amount` half-hearts, triggers respawn at 0 HP or immediately for
     "No Health" characters (The Lost, Tainted Forgotten) where *any* hit is
     fatal regardless of the HP counter.
   - `Game.respawn()` — teleports to the center of the **current** room,
     heals to full, shows a floating "RESPAWN" text (drawn via the existing
     floating-text system), brief invulnerability window (1.5s) so you don't
     immediately re-die standing on the same hazard.
   - `Game.onHealthChange(hp, maxHp)` callback wired to a new `liveHp` React
     state in `Playground.tsx`; the hearts HUD row now dims/empties hearts
     as HP drops instead of always showing full health.
   - **Not visually verified.** Also: there is currently **no enemy AI or
     enemy contact damage** in the sandbox at all — the only damage sources
     are spikes/fire hazards (1 half-heart) and bomb/TNT explosions (1 full
     heart, i.e. 2 half-hearts). If enemies are ever added, route their
     damage through `takeDamage()` too, don't duplicate the shield/hurt
     logic again.

## Known limitations / explicitly NOT fixed — read before assuming these work

### Character appearance — the big unresolved one

**Every character except Isaac (bare skin, no overlay) and Azazel
(hand-verified by the user) showed glitching/scattered pixels.** I
determined this was because of a wrong assumption in the costume-overlay
compositing system (`loadCharacterLook()` in `src/game/assets.ts`): the code
assumed a "strip" overlay image (hair, eyepatch, fez — anything ≤64px tall)
shares the *exact same per-frame crop grid* as the base skin sheet it's
pasted onto at `(0,0)`. That assumption is very likely wrong for most
characters — the overlay's internal frame arrangement doesn't necessarily
line up with the base sheet's animation crop rectangles once you're past the
very first idle frame, which is why it looked like random glitching that
came and went as the walk-cycle animated.

**Current state: I disabled the whole overlay-compositing system**
(`ENABLE_COSTUME_OVERLAYS = false` in `src/game/assets.ts`, one line, well
commented) rather than trying to guess-fix alignment blind. Every character
now renders as the **bare skin sheet only** — correct proportions, correct
walk/head animation (that part was always solid, driven by real per-frame
`.anm2` data), but without hair/eyepatch/costume visual details. This is a
**visual fidelity regression** traded for **eliminating the glitching**,
which is the safer failure mode.

The **custom-head system** (Azazel, and a few others with their own
dedicated head `.anm2` — Bethany, Jacob, Esau are wired up too but unverified)
is a **completely separate, more reliable mechanism** — it renders a
character's head from its *own* verified per-character frame data instead of
guessing at alignment, and was NOT disabled. If Azazel still looks right,
that's why.

**What the next agent needs to actually fix this properly:**
1. **A way to visually verify rendering** — I have never been able to see
   the canvas render. Either get a live browser open and describe/screenshot
   what you see, or use something like Playwright/Puppeteer to render the
   Playground canvas to a PNG and inspect it programmatically.
2. With that visual feedback loop, go character by character: try
   re-enabling `ENABLE_COSTUME_OVERLAYS = true`, look at each character,
   and either fix the specific alignment (may need per-character x/y offset
   data, not a one-size-fits-all strip-paste) or leave that character on the
   skin-only fallback.
3. The user's own extracted game copy has `tools/IsaacAnimator.exe` bundled
   in `C:\Users\VNG\Downloads\Public\tools\` — that's Nicalis's own
   animation preview tool and would show you the CORRECT composited look
   for any character/costume combo as a ground truth to compare against.
4. Consider whether the "custom head" approach (real per-character `.anm2`
   frame data, not flat strip-pasting) should be extended to costume
   overlays too, rather than trying to make the strip-paste heuristic work.

### Item combination "priorities"

The user's ask was: item effects must **compose** via data (arrays/flags),
never via pairwise `if/else` branching for specific combinations. That
principle is already how `combat.ts` is built (see architecture map above)
and should be preserved. What was **not** done this session: a systematic
audit of the *exact* real-game override priority for every possible weapon
combination — that's not really feasible for 700+ items, only ~45 have real
coded effects right now (see `implemented.ts`). The current `fireMode`
priority chain (knife > brimstone > missile > bombshot > ludovico > sword >
csection > laser > lob > tears) is self-consistent and has 32 passing tests,
but is a **judgment call**, not verified line-by-line against the wiki's
exact documented override rules. If the user reports "X + Y doesn't work
right," get the **specific pair of items** from them — "none of them work"
is too broad to action from code alone without live testing.

### Everything else still true from before this session

- Not deployed anywhere yet (static `dist/` build is ready for GitHub
  Pages/Vercel/etc, just never actually pushed live).
- Lighthouse performance score never measured.
- The community meta tier list (`data/overrides/tier-list.json`) is
  necessarily subjective — user may want to hand-edit it.
- Only ~45 items have real coded effects (see `implemented.ts`); the rest
  show generic auto-extracted stat numbers only (or nothing, if the wiki
  description didn't parse into a stat number).
- The pocket-item (Q key) system only recognizes two hardcoded cards (The
  Fool, Holy Card) matched by string in the character's starting-pickups
  text. Not a real card/pill/rune system.
- Portraits shown on the Avatar Screen are the wiki's stylized poster art;
  in-room sprites are the game's actual 32px sprites — these never match 1:1
  even in the real game, that's expected and fine.

## Recommended next steps, roughly in priority order

1. **Get a live browser test loop going** — this is the single biggest
   unblock. Almost every remaining open item needs visual verification that
   text-only iteration cannot provide.
2. Re-verify the character-switch fix and the Enter-key behavior with actual
   clicking/keyboard input.
3. Re-verify HP/damage/respawn visually (walk into a spike, watch a heart
   disappear; walk into two more, confirm respawn at the room center with
   the "RESPAWN" text).
4. Decide on the costume-overlay question above — either invest in proper
   per-character verification, or accept skin-only as the shipped look and
   move on.
5. Continue descending the item tier list for more real coded effects (this
   was an ongoing, explicit ask across the whole session) — but the user
   also wants this session's bugs actually fixed and confirmed before piling
   on more surface area.
