/**
 * Canonical registry of items with REAL coded gameplay effects — a weapon
 * override, a tear-flag modifier, a DOT/special-shot spec, an active-item
 * effect, a costume tint, or a hand-verified stat override (as opposed to
 * every item's auto-extracted flat stat numbers, which apply generically
 * but aren't hand-verified against the wiki).
 *
 * This is the single source of truth for "is this item wired up or is it
 * decoration right now" — both the Armory's Working filter and this file's
 * own tests read from it. When you add a new `has("slug")` check to
 * combat.ts or a new branch to engine.ts's applyActiveEffect, add the slug
 * here too so the filter never drifts from the code.
 */
export const IMPLEMENTED_SLUGS: ReadonlySet<string> = new Set([
  // weapon overrides (src/engine/combat.ts fireMode derivation)
  "moms-knife", "brimstone", "sulfur", "revelation", "epic-fetus", "dr-fetus",
  "the-ludovico-technique", "spirit-sword", "c-section", "technology",
  "technology-2", "tech-x", "ipecac", "bobs-brain",

  // multishot / familiars
  "20-20", "the-inner-eye", "mutant-spider", "incubus", "twisted-pair",

  // tear-flag style modifiers
  "sacred-heart", "godhead", "spoon-bender", "cupids-arrow", "death-certificate",
  "eye-of-belial", "ouija-board", "pupula-duplex", "monstros-lung",
  "chocolate-milk", "haemolacria", "continuum", "rubber-cement", "proptosis",
  "tiny-planet", "anti-gravity", "my-reflection", "the-parasite", "crickets-body",
  "the-wiz", "lokis-horns", "ghost-pepper", "birds-eye", "dead-eye", "pop",
  "chemical-peel", "compound-fracture", "fire-mind", "mysterious-liquid",
  "sinus-infection", "the-common-cold", "serpents-kiss", "euthanasia",
  "tough-love", "holy-mantle", "crickets-head",

  // costume tints
  "whore-of-babylon", "gnawed-leaf", "the-virus", "lunch",

  // explicit flight grants
  "fate", "transcendence", "dead-dove", "holy-grail", "spirit-of-the-night",
  "astral-projection", "dogma", "empty-vessel", "lord-of-the-pit",

  // active-item effects (src/game/engine.ts applyActiveEffect)
  "the-d6", "d-infinity", "d100", "d20", "eternal-d6", "spindown-dice",
  "diplopia", "crooked-penny", "r-key", "void", "abyss", "kamikaze",
  "the-poop", "mr-boom", "remote-detonator", "bobs-rotten-head",

  // hand-verified stat overrides (data/overrides/stat-modifiers.json)
  "the-sad-onion", "magic-mushroom", "polyphemus", "brittle-bones", "soy-milk",
]);

export function isImplemented(slug: string): boolean {
  return IMPLEMENTED_SLUGS.has(slug);
}
