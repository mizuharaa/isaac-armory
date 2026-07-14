/**
 * Stat engine validation against wiki-documented values.
 * Every expected value cites the wiki page it came from.
 *
 * Character rows: https://bindingofisaacrebirth.fandom.com/wiki/Characters
 *   (Template:Character_Tables — the same source data/overrides/character-stats.json
 *    was transcribed from)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeDamage,
  computeFireDelay,
  computeLuck,
  computeRange,
  computeShotSpeed,
  computeSpeed,
  computeStats,
  tearsPerSecond,
  type CharacterStatBlock,
  type EquippedItem,
} from "./stats";

const ISAAC: CharacterStatBlock = {
  damageBase: 3.5, damageMult: 1.0, tearsDelta: 0, tearsMult: 1.0,
  shotSpeed: 1.0, range: 6.5, speed: 1.0, luck: 0,
};
const char = (partial: Partial<CharacterStatBlock>): CharacterStatBlock => ({ ...ISAAC, ...partial });
const item = (slug: string, statModifiers: EquippedItem["statModifiers"], behaviorTags?: string[]): EquippedItem =>
  ({ slug, statModifiers, behaviorTags });

const dataFile = (name: string) =>
  JSON.parse(readFileSync(path.resolve(__dirname, "../../data", name), "utf8"));

describe("damage — base characters (wiki/Characters table)", () => {
  it("1. Isaac base damage is 3.50", () => {
    expect(computeDamage(ISAAC, [])).toBeCloseTo(3.5, 2);
  });
  it("2. Judas ×1.35 → 4.73", () => {
    expect(computeDamage(char({ damageMult: 1.35 }), [])).toBeCloseTo(4.73, 2);
  });
  it("3. Cain ×1.20 → 4.20", () => {
    expect(computeDamage(char({ damageMult: 1.2 }), [])).toBeCloseTo(4.2, 2);
  });
  it("4. Eve ×0.75 → 2.63", () => {
    expect(computeDamage(char({ damageMult: 0.75 }), [])).toBeCloseTo(2.63, 2);
  });
  it("5. ??? ×1.05 → 3.68", () => {
    expect(computeDamage(char({ damageMult: 1.05 }), [])).toBeCloseTo(3.68, 2);
  });
  it("6. Azazel ×1.50 → 5.25", () => {
    expect(computeDamage(char({ damageMult: 1.5 }), [])).toBeCloseTo(5.25, 2);
  });
  it("7. Tainted Lost ×1.30 → 4.55 (wiki/Tainted_Lost)", () => {
    expect(computeDamage(char({ damageMult: 1.3 }), [])).toBeCloseTo(4.55, 2);
  });
});

describe("damage — items and multiplier ordering", () => {
  // wiki/Cricket%27s_Head: ×1.5 damage multiplier
  const cricketsHead = item("crickets-head", { damageMult: 1.5 });
  // wiki/Magic_Mushroom (Repentance): +0.3 damage, ×1.5 (non-stacking with Cricket's Head)
  const magicMushroom = item("magic-mushroom", { hearts: 1, damage: 0.3, damageMult: 1.5, range: 2.5, speed: 0.3 });
  // wiki/Polyphemus: (Damage + 4) × 2
  const polyphemus = item("polyphemus", { damageFlat: 4, damageMult: 2.0, tearsMult: 0.42 });
  // wiki/Soy_Milk (Repentance): ×0.2 damage, fire rate ×5.5
  const soyMilk = item("soy-milk", { damageMult: 0.2, tearsMult: 5.5 }, ["bypass_tear_cap"]);

  it("8. Cricket's Head on Isaac → 5.25 (wiki/Cricket%27s_Head)", () => {
    expect(computeDamage(ISAAC, [cricketsHead])).toBeCloseTo(5.25, 2);
  });
  it("9. Magic Mushroom on Isaac → 6.12 (3.5·√(0.3·1.2+1)·1.5, wiki/Magic_Mushroom + wiki/Damage formula)", () => {
    expect(computeDamage(ISAAC, [magicMushroom])).toBeCloseTo(3.5 * Math.sqrt(1.36) * 1.5, 2);
  });
  it("10. Magic Mushroom + Cricket's Head do NOT stack (wiki/Magic_Mushroom, Notes)", () => {
    expect(computeDamage(ISAAC, [magicMushroom, cricketsHead])).toBeCloseTo(
      computeDamage(ISAAC, [magicMushroom]),
      5,
    );
  });
  it("11. Polyphemus on Isaac → (3.5+4)×2 = 15.00 (wiki/Polyphemus math)", () => {
    expect(computeDamage(ISAAC, [polyphemus])).toBeCloseTo(15.0, 2);
  });
  it("12. Polyphemus on Judas → (4.725+4)×2 = 17.45 (flat adds after character multiplier, wiki/Polyphemus)", () => {
    expect(computeDamage(char({ damageMult: 1.35 }), [polyphemus])).toBeCloseTo(17.45, 2);
  });
  it("13. Polyphemus + Cricket's Head stack multiplicatively → 22.50 (wiki/Damage: multipliers stack)", () => {
    expect(computeDamage(ISAAC, [polyphemus, cricketsHead])).toBeCloseTo((3.5 + 4) * 2 * 1.5, 2);
  });
  it("14. Soy Milk on Isaac → 0.70 (wiki/Soy_Milk ×0.2)", () => {
    expect(computeDamage(ISAAC, [soyMilk])).toBeCloseTo(0.7, 2);
  });
  it("15. damage stat-ups go through the sqrt curve: +1 damage up → 5.19 (wiki/Damage formula)", () => {
    expect(computeDamage(ISAAC, [item("synthol", { damage: 1 })])).toBeCloseTo(3.5 * Math.sqrt(2.2), 2);
  });
});

describe("tears / fire delay (wiki/Tears)", () => {
  // wiki/The_Sad_Onion: +0.7 tears
  const sadOnion = item("the-sad-onion", { tears: 0.7 });
  const soyMilk = item("soy-milk", { damageMult: 0.2, tearsMult: 5.5 }, ["bypass_tear_cap"]);
  const polyphemus = item("polyphemus", { damageFlat: 4, damageMult: 2.0, tearsMult: 0.42 });

  it("16. Isaac base fire delay is 10 (16−6·√1)", () => {
    expect(computeFireDelay(ISAAC, [])).toBeCloseTo(10, 2);
  });
  it("17. Isaac base tears/second is 2.73 (30/(10+1))", () => {
    expect(tearsPerSecond(computeFireDelay(ISAAC, []))).toBeCloseTo(2.73, 2);
  });
  it("18. Sad Onion on Isaac → delay 7.71 (16−6·√(0.7·1.3+1))", () => {
    expect(computeFireDelay(ISAAC, [sadOnion])).toBeCloseTo(16 - 6 * Math.sqrt(1.91), 2);
  });
  it("19. two Sad Onions → delay 5.93 (stat-ups accumulate before the curve)", () => {
    expect(computeFireDelay(ISAAC, [sadOnion, sadOnion])).toBeCloseTo(16 - 6 * Math.sqrt(2.82), 2);
  });
  it("20. soft cap: +3 tears would give delay 2.72 → capped at 5 (wiki/Tears cap)", () => {
    expect(computeFireDelay(ISAAC, [item("x", { tears: 3 })])).toBe(5);
  });
  it("21. Soy Milk bypasses the cap: delay 1 → 15 tears/second (wiki/Soy_Milk Notes)", () => {
    const delay = computeFireDelay(ISAAC, [soyMilk]);
    expect(delay).toBeCloseTo(1.0, 2);
    expect(tearsPerSecond(delay)).toBeCloseTo(15, 1);
  });
  it("22. Polyphemus fire-rate ×0.42 → delay 25.19 (wiki/Polyphemus, Repentance line)", () => {
    expect(computeFireDelay(ISAAC, [polyphemus])).toBeCloseTo(11 / 0.42 - 1, 2);
  });
  it("23. Samson tearsDelta −0.1 → delay 10.40 (wiki/Characters table + wiki/Tears formula)", () => {
    expect(computeFireDelay(char({ tearsDelta: -0.1 }), [])).toBeCloseTo(16 - 6 * Math.sqrt(0.87), 2);
  });
  it("24. The Forgotten fire-rate ×0.5 → delay 21 (wiki/The_Forgotten: x1/2 tears)", () => {
    expect(computeFireDelay(char({ tearsMult: 0.5 }), [])).toBeCloseTo(11 / 0.5 - 1, 2);
  });
  it("25. deep negative tears use the linear branch (wiki/Tears; Keeper −1.9)", () => {
    // 1.3·(−1.9)+1 = −1.47 < 0 → 16 − 6·(−1.47) = 24.82
    expect(computeFireDelay(char({ tearsDelta: -1.9 }), [])).toBeCloseTo(24.82, 2);
  });
});

describe("speed / range / shot speed / luck", () => {
  it("26. speed is capped at 2.0 (wiki/Speed)", () => {
    expect(computeSpeed(ISAAC, [item("a", { speed: 0.3 }), item("b", { speed: 0.9 })])).toBeCloseTo(2.0, 5);
  });
  it("27. speed floors at 0.1 (wiki/Speed)", () => {
    expect(computeSpeed(char({ speed: 0.85 }), [item("a", { speed: -2 })])).toBeCloseTo(0.1, 5);
  });
  it("28. Magic Mushroom speed +0.3 → 1.3 (wiki/Magic_Mushroom)", () => {
    expect(computeSpeed(ISAAC, [item("magic-mushroom", { speed: 0.3 })])).toBeCloseTo(1.3, 5);
  });
  it("29. Magic Mushroom range +2.5 → 9.0 (wiki/Magic_Mushroom, Repentance line)", () => {
    expect(computeRange(ISAAC, [item("magic-mushroom", { range: 2.5 })])).toBeCloseTo(9.0, 5);
  });
  it("30. shot speed floors at 0.6", () => {
    expect(computeShotSpeed(ISAAC, [item("a", { shotSpeed: -1 })])).toBeCloseTo(0.6, 5);
  });
  it("31. luck is a plain sum (Lazarus −1, wiki/Characters table)", () => {
    expect(computeLuck(char({ luck: -1 }), [item("a", { luck: 2 })])).toBe(1);
  });
});

describe("computeStats aggregate", () => {
  it("32. DPS = damage × tears/second (Isaac base ≈ 9.55)", () => {
    const s = computeStats(ISAAC, []);
    expect(s.dps).toBeCloseTo(3.5 * (30 / 11), 2);
  });
  it("33. bonus hearts accumulate from items", () => {
    const s = computeStats(ISAAC, [
      item("magic-mushroom", { hearts: 1 }),
      item("x", { soulHearts: 2, blackHearts: 1 }),
    ]);
    expect(s.bonusHearts).toEqual({ red: 1, soul: 2, black: 1 });
  });
});

describe("data integration — generated JSON drives the engine", () => {
  const items: any[] = dataFile("items.json");
  const characters: any[] = dataFile("characters.json");

  it("34. items.json Sad Onion carries {tears: 0.7} (wiki/The_Sad_Onion)", () => {
    const sad = items.find((i) => i.slug === "the-sad-onion");
    expect(sad.statModifiers).toEqual({ tears: 0.7 });
  });
  it("35. items.json Polyphemus override matches the wiki math", () => {
    const poly = items.find((i) => i.slug === "polyphemus");
    expect(poly.statModifiers).toEqual({ damageFlat: 4, damageMult: 2.0, tearsMult: 0.42 });
    expect(computeDamage(ISAAC, [poly])).toBeCloseTo(15.0, 2);
  });
  it("36. characters.json Judas → engine damage 4.73 (wiki/Characters table)", () => {
    const judas = characters.find((c) => c.slug === "judas");
    expect(computeDamage(judas.baseStats, [])).toBeCloseTo(4.73, 2);
  });
  it("37. characters.json Azazel with Cricket's Head from items.json → 7.88", () => {
    const azazel = characters.find((c) => c.slug === "azazel");
    const cricket = items.find((i) => i.slug === "crickets-head");
    expect(computeDamage(azazel.baseStats, [cricket])).toBeCloseTo(3.5 * 1.5 * 1.5, 2);
  });
  it("38. every character's baseStats satisfies the engine's input shape", () => {
    for (const c of characters) {
      const s = computeStats(c.baseStats, []);
      expect(Number.isFinite(s.damage)).toBe(true);
      expect(Number.isFinite(s.fireDelay)).toBe(true);
      expect(s.fireDelay).toBeGreaterThanOrEqual(1);
    }
  });
});
