/**
 * Pure combat derivation: equipped items + character innates → weapon
 * configuration. Kept free of engine/DOM so item combos are unit-testable.
 *
 * Weapon override priority mirrors the game's (knife > brimstone > guided
 * missile > bomb shots > sword > tech laser > ipecac lob > tears); modifier
 * flags (homing/piercing/spectral/multishot/charge) apply to whichever
 * weapon wins, like the game's TearFlags
 * (https://wofsauge.github.io/IsaacDocs/abp/enums/TearFlags.html).
 */

export type FireMode =
  | "tears"
  | "brimstone"
  | "laser"
  | "knife"
  | "lob"
  | "bombshot"
  | "missile"
  | "sword"
  | "csection"
  | "ludovico";

export interface CombatConfig {
  fireMode: FireMode;
  shots: number;
  homing: boolean;
  piercing: boolean;
  spectral: boolean;
  /** hold-fire-to-charge weapons (Brimstone handled separately in-engine) */
  chargeShot: "none" | "chocolate" | "techx" | "lung";
  /** tear bursts into shrapnel on impact (Haemolacria) */
  burst: boolean;
  /** tears wrap around the screen (Continuum) */
  continuum: boolean;
  /** tears bounce off walls (Rubber Cement) */
  bounce: boolean;
  /** damage falls off with distance (Proptosis) */
  falloff: boolean;
  /** tears orbit the player (Tiny Planet, TEAR_ORBIT) */
  orbit: boolean;
  /** tears hover in place before continuing (Anti-Gravity, TEAR_WAIT) */
  hover: boolean;
  /** tears return to the player (My Reflection, TEAR_BOMBERANG) */
  boomerang: boolean;
  /** tears split in two on death (The Parasite / Cricket's Body, TEAR_SPLIT) */
  split: boolean;
  /** shots fire diagonally in both directions (The Wiz) */
  wiz: boolean;
  /** chance to fire a volley in all four directions (Loki's Horns) */
  quadChance: number;
  /** chance a shot is a piercing flame (Ghost Pepper / Bird's Eye) */
  flameChance: number;
  /** consecutive hits ramp damage up to ~4x (Dead Eye) */
  deadEye: boolean;
  /** piercing; damage doubles after passing through a target (Eye of Belial) */
  belial: boolean;
  /** innate-only Brimstone (Azazel) is short-range; the item removes this */
  shortBrim: boolean;
  /** tears carry a damaging halo (Godhead) */
  aura: boolean;
  /** blocks one hit, recharges (Holy Mantle) */
  shield: boolean;
  /** shooter familiars that copy the player's shots */
  familiars: { slug: string; damageMult: number }[];
  tint: string | null;
  flight: boolean;
  sizeUp: boolean;
}

/** Costume-style looks for iconic items (sprite tint, applied in-engine). */
const TINTS: [string, string][] = [
  ["brimstone", "#c96a5e"],
  ["whore-of-babylon", "#8a8a9c"],
  ["gnawed-leaf", "#9aa39a"],
  ["the-virus", "#9cc98f"],
  ["lunch", "#e8d8a8"],
];

export function deriveCombat(
  equipped: string[],
  behaviorTags: Set<string>,
  innate: string[],
  maxDamageMult: number,
): CombatConfig {
  const slugs = new Set(equipped);
  const has = (...names: string[]) => names.some((n) => slugs.has(n));

  const itemBrim = has("brimstone", "sulfur", "revelation");
  const innateBrim = innate.some((s) => /brimstone/i.test(s));

  let fireMode: FireMode = "tears";
  if (has("moms-knife")) fireMode = "knife";
  else if (itemBrim || innateBrim) fireMode = "brimstone";
  else if (has("epic-fetus")) fireMode = "missile";
  else if (has("dr-fetus")) fireMode = "bombshot";
  else if (has("ludovico-technique")) fireMode = "ludovico";
  else if (has("spirit-sword")) fireMode = "sword";
  else if (has("c-section")) fireMode = "csection";
  else if (has("technology", "technology-2", "tech-x") && !has("tech-x")) fireMode = "laser";
  else if (has("ipecac", "bobs-brain")) fireMode = "lob";

  let shots = 1;
  if (has("20-20")) shots = Math.max(shots, 2);
  if (has("the-inner-eye") || innate.some((s) => /triple shot/i.test(s))) shots = Math.max(shots, 3);
  if (has("mutant-spider")) shots = Math.max(shots, 4);

  const familiars: CombatConfig["familiars"] = [];
  if (has("incubus")) familiars.push({ slug: "incubus", damageMult: 0.75 });
  if (has("twisted-pair")) {
    familiars.push({ slug: "twisted-pair", damageMult: 0.5 }, { slug: "twisted-pair", damageMult: 0.5 });
  }

  return {
    fireMode,
    shots,
    homing: behaviorTags.has("homing") || has("sacred-heart", "godhead", "spoon-bender"),
    piercing:
      behaviorTags.has("piercing") ||
      has("cupids-arrow", "death-certificate", "eye-of-belial") ||
      fireMode === "csection",
    spectral: behaviorTags.has("spectral") || has("ouija-board"),
    chargeShot: has("tech-x")
      ? "techx"
      : has("monstros-lung")
        ? "lung"
        : has("chocolate-milk")
          ? "chocolate"
          : "none",
    burst: has("haemolacria"),
    continuum: has("continuum"),
    bounce: has("rubber-cement"),
    falloff: has("proptosis"),
    orbit: has("tiny-planet"),
    hover: has("anti-gravity"),
    boomerang: has("my-reflection"),
    split: has("the-parasite", "crickets-body"),
    wiz: has("the-wiz"),
    quadChance: has("lokis-horns") ? 0.25 : 0,
    flameChance: (has("ghost-pepper") ? 0.125 : 0) + (has("birds-eye") ? 0.125 : 0),
    deadEye: has("dead-eye"),
    belial: has("eye-of-belial"),
    shortBrim: innateBrim && !itemBrim,
    aura: has("godhead"),
    shield: has("holy-mantle"),
    familiars,
    tint: TINTS.find(([slug]) => slugs.has(slug))?.[1] ?? null,
    // explicit item list — description keyword matching gave false positives
    // that made every character hover
    flight:
      innate.some((s) => /flight/i.test(s)) ||
      has("revelation", "fate", "transcendence", "dead-dove", "holy-grail",
          "spirit-of-the-night", "astral-projection", "dogma", "empty-vessel", "lord-of-the-pit"),
    sizeUp: maxDamageMult >= 1.5,
  };
}
