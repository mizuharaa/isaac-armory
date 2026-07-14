/**
 * Pure stat engine for The Binding of Isaac: Rebirth (Repentance rules).
 *
 * Formula sources (each also cited in stats.test.ts):
 * - Damage:  https://bindingofisaacrebirth.fandom.com/wiki/Damage
 *     damage = base(3.5) × sqrt(damageUps × 1.2 + 1) × characterMultiplier
 *     then + flat bonuses, then × item multipliers.
 *     Ordering proof: the Polyphemus page documents its effect as
 *     (Damage + 4) × 2 — flat adds BEFORE its own multiplier.
 * - Tears:   https://bindingofisaacrebirth.fandom.com/wiki/Tears
 *     MaxFireDelay = 16 − 6 × sqrt(tears × 1.3 + 1)   (linear below the
 *     sqrt domain), fire-rate multipliers divide delay, soft cap at
 *     delay 5 unless a cap-breaking item is held, absolute minimum 1.
 *     tears/second = 30 / (delay + 1).
 * - Speed:   clamped to [0.1, 2.0]  (https://bindingofisaacrebirth.fandom.com/wiki/Speed)
 * - Range/Shot speed/Luck: additive; range floors at 1.0, shot speed at 0.6.
 */

export interface CharacterStatBlock {
  damageBase: number;
  damageMult: number;
  /** Delta on the tears stat, fire-rate units (wiki Characters table). */
  tearsDelta: number;
  /** Fire-rate multiplier (>1 = faster). */
  tearsMult: number;
  shotSpeed: number;
  range: number;
  speed: number;
  luck: number;
}

export interface StatModifiers {
  damage?: number;
  damageFlat?: number;
  damageMult?: number;
  tears?: number;
  tearsMult?: number;
  tearDelayFlat?: number;
  speed?: number;
  range?: number;
  shotSpeed?: number;
  luck?: number;
  hearts?: number;
  soulHearts?: number;
  blackHearts?: number;
}

export interface EquippedItem {
  slug: string;
  statModifiers: StatModifiers;
  behaviorTags?: string[];
}

export interface ComputedStats {
  damage: number;
  fireDelay: number;
  tearsPerSecond: number;
  /** damage × tears/second — what the Playground's punching bag displays. */
  dps: number;
  speed: number;
  range: number;
  shotSpeed: number;
  luck: number;
  bonusHearts: { red: number; soul: number; black: number };
}

/**
 * Items whose ×1.5 damage multipliers share ONE slot and never stack with
 * each other (Magic Mushroom page, Notes section).
 */
export const NON_STACKING_DAMAGE_MULT = new Set(["magic-mushroom", "crickets-head"]);

/** The delay-5 soft cap does not apply while one of these is held. */
export const TEAR_CAP_BYPASS_TAG = "bypass_tear_cap";

const TEAR_DELAY_SOFT_CAP = 5;
const TEAR_DELAY_ABSOLUTE_MIN = 1;

export function computeDamage(base: CharacterStatBlock, items: EquippedItem[]): number {
  let damageUps = 0;
  let flat = 0;
  let itemMult = 1;
  let nonStackingApplied = false;

  for (const item of items) {
    const m = item.statModifiers;
    damageUps += m.damage ?? 0;
    flat += m.damageFlat ?? 0;
    if (m.damageMult !== undefined) {
      if (NON_STACKING_DAMAGE_MULT.has(item.slug)) {
        if (!nonStackingApplied) {
          itemMult *= m.damageMult;
          nonStackingApplied = true;
        }
      } else {
        itemMult *= m.damageMult;
      }
    }
  }

  const core = base.damageBase * Math.sqrt(damageUps * 1.2 + 1) * base.damageMult;
  return (core + flat) * itemMult;
}

export function computeFireDelay(base: CharacterStatBlock, items: EquippedItem[]): number {
  let tears = base.tearsDelta;
  let delayFlat = 0;
  let rateMult = base.tearsMult;
  let capBypass = false;

  for (const item of items) {
    const m = item.statModifiers;
    tears += m.tears ?? 0;
    delayFlat += m.tearDelayFlat ?? 0;
    if (m.tearsMult !== undefined) rateMult *= m.tearsMult;
    if (item.behaviorTags?.includes(TEAR_CAP_BYPASS_TAG)) capBypass = true;
  }

  const x = 1.3 * tears + 1;
  // Wiki Tears page: sqrt curve inside its domain, linear continuation below.
  let delay = x >= 0 ? 16 - 6 * Math.sqrt(x) : 16 - 6 * x;
  delay += delayFlat;

  // Fire-rate multipliers act on tears/second, i.e. divide (delay + 1).
  if (rateMult !== 1) delay = (delay + 1) / rateMult - 1;

  if (!capBypass && delay < TEAR_DELAY_SOFT_CAP) delay = TEAR_DELAY_SOFT_CAP;
  if (delay < TEAR_DELAY_ABSOLUTE_MIN) delay = TEAR_DELAY_ABSOLUTE_MIN;
  return delay;
}

export function tearsPerSecond(fireDelay: number): number {
  return 30 / (fireDelay + 1);
}

export function computeSpeed(base: CharacterStatBlock, items: EquippedItem[]): number {
  let speed = base.speed;
  for (const item of items) speed += item.statModifiers.speed ?? 0;
  return Math.min(2.0, Math.max(0.1, speed));
}

export function computeRange(base: CharacterStatBlock, items: EquippedItem[]): number {
  let range = base.range;
  for (const item of items) range += item.statModifiers.range ?? 0;
  return Math.max(1.0, range);
}

export function computeShotSpeed(base: CharacterStatBlock, items: EquippedItem[]): number {
  let shotSpeed = base.shotSpeed;
  for (const item of items) shotSpeed += item.statModifiers.shotSpeed ?? 0;
  return Math.max(0.6, shotSpeed);
}

export function computeLuck(base: CharacterStatBlock, items: EquippedItem[]): number {
  let luck = base.luck;
  for (const item of items) luck += item.statModifiers.luck ?? 0;
  return luck;
}

export function computeStats(base: CharacterStatBlock, items: EquippedItem[]): ComputedStats {
  const damage = computeDamage(base, items);
  const fireDelay = computeFireDelay(base, items);
  const tps = tearsPerSecond(fireDelay);
  const bonusHearts = { red: 0, soul: 0, black: 0 };
  for (const item of items) {
    bonusHearts.red += item.statModifiers.hearts ?? 0;
    bonusHearts.soul += item.statModifiers.soulHearts ?? 0;
    bonusHearts.black += item.statModifiers.blackHearts ?? 0;
  }
  return {
    damage,
    fireDelay,
    tearsPerSecond: tps,
    dps: damage * tps,
    speed: computeSpeed(base, items),
    range: computeRange(base, items),
    shotSpeed: computeShotSpeed(base, items),
    luck: computeLuck(base, items),
    bonusHearts,
  };
}
