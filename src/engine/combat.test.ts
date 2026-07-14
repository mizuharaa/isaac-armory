/**
 * Item-combination tests for the weapon derivation. Expected behavior is
 * sourced from each item's wiki page (Synergies/Interactions sections) with
 * simplifications noted; weapon priority mirrors the game's override order.
 */
import { describe, expect, it } from "vitest";
import { deriveCombat } from "./combat";

const combo = (
  equipped: string[],
  tags: string[] = [],
  innate: string[] = [],
  maxMult = 1,
) => deriveCombat(equipped, new Set(tags), innate, maxMult);

describe("weapon priority (override order)", () => {
  it("1. bare loadout fires tears", () => {
    expect(combo([]).fireMode).toBe("tears");
  });
  it("2. Brimstone replaces tears (wiki/Brimstone)", () => {
    expect(combo(["brimstone"]).fireMode).toBe("brimstone");
  });
  it("3. Mom's Knife wins over Brimstone (knife overrides beam weapons)", () => {
    expect(combo(["brimstone", "moms-knife"]).fireMode).toBe("knife");
  });
  it("4. Epic Fetus wins over Dr. Fetus (wiki/Epic_Fetus: overrides)", () => {
    expect(combo(["dr-fetus", "epic-fetus"]).fireMode).toBe("missile");
  });
  it("5. Azazel's innate short Brimstone comes from character innates", () => {
    expect(combo([], [], ["Flight", "Short-range Brimstone"]).fireMode).toBe("brimstone");
  });
  it("6. Technology fires a laser; Brimstone still wins when both held", () => {
    expect(combo(["technology"]).fireMode).toBe("laser");
    expect(combo(["technology", "brimstone"]).fireMode).toBe("brimstone");
  });
  it("7. Ipecac lobs explosive shots (wiki/Ipecac)", () => {
    expect(combo(["ipecac"]).fireMode).toBe("lob");
  });
  it("8. Spirit Sword replaces tears with melee (wiki/Spirit_Sword)", () => {
    expect(combo(["spirit-sword"]).fireMode).toBe("sword");
  });
});

describe("multishot stacking", () => {
  it("9. 20/20 doubles, Inner Eye triples, Mutant Spider quads — highest wins", () => {
    expect(combo(["20-20"]).shots).toBe(2);
    expect(combo(["the-inner-eye"]).shots).toBe(3);
    expect(combo(["mutant-spider"]).shots).toBe(4);
    expect(combo(["20-20", "mutant-spider"]).shots).toBe(4);
  });
  it("10. Keeper's innate triple shot applies", () => {
    expect(combo([], [], ["Triple shot"]).shots).toBe(3);
  });
  it("11. multishot combines with Brimstone (wiki/Brimstone synergies)", () => {
    const c = combo(["brimstone", "the-inner-eye"]);
    expect(c.fireMode).toBe("brimstone");
    expect(c.shots).toBe(3);
  });
});

describe("tear-flag style modifiers apply to any weapon", () => {
  it("12. Sacred Heart grants homing (wiki/Sacred_Heart)", () => {
    expect(combo(["sacred-heart"]).homing).toBe(true);
  });
  it("13. homing + laser combo keeps both", () => {
    const c = combo(["technology", "sacred-heart"]);
    expect(c.fireMode).toBe("laser");
    expect(c.homing).toBe(true);
  });
  it("14. piercing behavior tag flows through (TEAR_PIERCING)", () => {
    expect(combo([], ["piercing"]).piercing).toBe(true);
  });
  it("15. C Section fetuses are piercing (wiki/C_Section)", () => {
    const c = combo(["c-section"]);
    expect(c.fireMode).toBe("csection");
    expect(c.piercing).toBe(true);
  });
  it("16. Godhead = homing + damaging aura (wiki/Godhead)", () => {
    const c = combo(["godhead"]);
    expect(c.homing).toBe(true);
    expect(c.aura).toBe(true);
  });
  it("17. Haemolacria bursts (wiki/Haemolacria)", () => {
    expect(combo(["haemolacria"]).burst).toBe(true);
  });
});

describe("charge weapons, familiars, defense, looks", () => {
  it("18. Chocolate Milk charges shots; Tech X takes precedence when both", () => {
    expect(combo(["chocolate-milk"]).chargeShot).toBe("chocolate");
    expect(combo(["chocolate-milk", "tech-x"]).chargeShot).toBe("techx");
  });
  it("19. Incubus adds one shooter familiar; Twisted Pair adds two", () => {
    expect(combo(["incubus"]).familiars).toHaveLength(1);
    expect(combo(["twisted-pair"]).familiars).toHaveLength(2);
    expect(combo(["incubus", "twisted-pair"]).familiars).toHaveLength(3);
  });
  it("20. Holy Mantle grants the shield (wiki/Holy_Mantle)", () => {
    expect(combo(["holy-mantle"]).shield).toBe(true);
  });
  it("21. Revelation grants flight AND brimstone (wiki/Revelation)", () => {
    const c = combo(["revelation"]);
    expect(c.fireMode).toBe("brimstone");
    expect(c.flight).toBe(true);
  });
  it("22. Brimstone tints the sprite; big damage mult grows the body", () => {
    expect(combo(["brimstone"]).tint).not.toBeNull();
    expect(combo([], [], [], 2).sizeUp).toBe(true);
  });
});

describe("tear-modifier items (round 3)", () => {
  it("23. Tiny Planet orbits, Anti-Gravity hovers, My Reflection returns", () => {
    expect(combo(["tiny-planet"]).orbit).toBe(true);
    expect(combo(["anti-gravity"]).hover).toBe(true);
    expect(combo(["my-reflection"]).boomerang).toBe(true);
  });
  it("24. The Parasite and Cricket's Body split tears", () => {
    expect(combo(["the-parasite"]).split).toBe(true);
    expect(combo(["crickets-body"]).split).toBe(true);
  });
  it("25. The Wiz goes diagonal; Loki's Horns adds 25% quad volleys", () => {
    expect(combo(["the-wiz"]).wiz).toBe(true);
    expect(combo(["lokis-horns"]).quadChance).toBeCloseTo(0.25);
  });
  it("26. Ghost Pepper + Bird's Eye flame chances stack", () => {
    expect(combo(["ghost-pepper"]).flameChance).toBeCloseTo(0.125);
    expect(combo(["ghost-pepper", "birds-eye"]).flameChance).toBeCloseTo(0.25);
  });
  it("27. Dead Eye ramps; Eye of Belial pierces then doubles", () => {
    expect(combo(["dead-eye"]).deadEye).toBe(true);
    const b = combo(["eye-of-belial"]);
    expect(b.belial).toBe(true);
    expect(b.piercing).toBe(true);
  });
  it("28. modifiers stack on Brimstone without dethroning it", () => {
    const c = combo(["brimstone", "tiny-planet", "dead-eye"]);
    expect(c.fireMode).toBe("brimstone");
    expect(c.orbit).toBe(true);
  });
  it("29. Azazel's mini-brim is short-range until the real Brimstone overrides it (wiki/Azazel)", () => {
    const azazel = combo([], [], ["Flight", "Short-range Brimstone"]);
    expect(azazel.fireMode).toBe("brimstone");
    expect(azazel.shortBrim).toBe(true);
    const upgraded = combo(["brimstone"], [], ["Flight", "Short-range Brimstone"]);
    expect(upgraded.fireMode).toBe("brimstone");
    expect(upgraded.shortBrim).toBe(false);
  });
});
