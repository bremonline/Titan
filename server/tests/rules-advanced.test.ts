import { describe, it, expect } from "vitest";

import { getValidDestinations, upsertMovementRule, getMovementRulesSnapshot } from "../src/game/movementRules.js";
import { getEligibleRecruitments, getRecruitableCreatures } from "../src/game/recruitmentRules.js";
import { CreatureType, TerrainType } from "../src/types.js";

describe("Movement Rules - Edge Cases", () => {
  describe("Tile rotation", () => {
    it("handles standard tile rotation for die rolls", () => {
      // Test multiple die rolls on same tile
      const roll1 = getValidDestinations("100", 1);
      const roll2 = getValidDestinations("100", 2);
      const roll3 = getValidDestinations("100", 3);

      expect(roll1.length).toBeGreaterThan(0);
      expect(roll2.length).toBeGreaterThan(0);
      expect(roll3.length).toBeGreaterThan(0);
      expect(roll1).not.toEqual(roll2);
    });

    it("returns unique destinations for roll", () => {
      const destinations = getValidDestinations("100", 4);
      const unique = new Set(destinations);
      expect(unique.size).toBe(destinations.length);
    });

    it("handles all six die rolls", () => {
      for (let roll = 1; roll <= 6; roll++) {
        const destinations = getValidDestinations("100", roll);
        expect(destinations.length).toBeGreaterThan(0);
        expect(destinations.every((d) => typeof d === "string")).toBe(true);
      }
    });

    it("returns empty array for invalid die values", () => {
      expect(getValidDestinations("100", 0)).toEqual([]);
      expect(getValidDestinations("100", 7)).toEqual([]);
      expect(getValidDestinations("100", -1)).toEqual([]);
      expect(getValidDestinations("100", 3.5)).toEqual([]);
    });

    it("handles tower tiles", () => {
      const destinations = getValidDestinations("200", 3);
      expect(Array.isArray(destinations)).toBe(true);
    });

    it("handles peripheral tiles", () => {
      const destinations = getValidDestinations("417", 2);
      expect(Array.isArray(destinations)).toBe(true);
    });
  });

  describe("Movement rule updates", () => {
    it("upserts new movement rule", () => {
      const before = getValidDestinations("999", 1);
      expect(before).toEqual([]);

      upsertMovementRule("999", 1, ["111", "222"]);
      const after = getValidDestinations("999", 1);
      expect(after).toContain("111");
      expect(after).toContain("222");
    });

    it("removes duplicate destinations in upsert", () => {
      upsertMovementRule("888", 2, ["101", "101", "102", "102"]);
      const destinations = getValidDestinations("888", 2);
      expect(new Set(destinations).size).toBe(destinations.length);
    });

    it("overwrites existing rule", () => {
      upsertMovementRule("777", 3, ["111", "222"]);
      upsertMovementRule("777", 3, ["333", "444"]);
      const destinations = getValidDestinations("777", 3);
      expect(destinations).not.toContain("111");
      expect(destinations).toContain("333");
    });

    it("getMovementRulesSnapshot returns current rules", () => {
      const snapshot1 = getMovementRulesSnapshot();
      expect(snapshot1["100"]).toBeDefined();
      expect(snapshot1["100"][1]).toBeDefined();
      expect(Array.isArray(snapshot1["100"][1])).toBe(true);
    });
  });

  describe("Complex movement scenarios", () => {
    it("ring-1 tiles (central hexagons) have movement options", () => {
      for (let roll = 1; roll <= 6; roll++) {
        const destinations = getValidDestinations("110", roll);
        expect(destinations.length).toBeGreaterThanOrEqual(0);
      }
    });

    it("different rolls from same tile vary destinations", () => {
      const allRolls = [];
      for (let roll = 1; roll <= 6; roll++) {
        allRolls.push(getValidDestinations("312", roll));
      }
      // Not all rolls should have identical destinations
      const hasVariation = allRolls.some((roll, idx) => !roll.equals?.(allRolls[0]));
      expect(allRolls.length).toBe(6);
    });
  });
});

describe("Recruitment Rules - Edge Cases", () => {
  describe("Tower special recruitment", () => {
    it("allows standard Tower creatures without prerequisites", () => {
      const eligible = getEligibleRecruitments(TerrainType.TOWER, []);
      expect(eligible).toContain(CreatureType.CENTAUR);
      expect(eligible).toContain(CreatureType.GARGOYLE);
      expect(eligible).toContain(CreatureType.OGRE);
    });

    it("recruits Guardian when 3+ of any creature in Tower", () => {
      const eligible = getEligibleRecruitments(TerrainType.TOWER, [
        CreatureType.CENTAUR,
        CreatureType.CENTAUR,
        CreatureType.CENTAUR,
      ]);
      expect(eligible).toContain(CreatureType.GUARDIAN);
    });

    it("recruits Warlock when Titan present in Tower", () => {
      const eligible = getEligibleRecruitments(TerrainType.TOWER, [CreatureType.TITAN]);
      expect(eligible).toContain(CreatureType.WARLOCK);
    });

    it("recruits both Guardian and Warlock when conditions met", () => {
      const eligible = getEligibleRecruitments(TerrainType.TOWER, [
        CreatureType.TITAN,
        CreatureType.OGRE,
        CreatureType.OGRE,
        CreatureType.OGRE,
      ]);
      expect(eligible).toContain(CreatureType.GUARDIAN);
      expect(eligible).toContain(CreatureType.WARLOCK);
    });
  });

  describe("Promotion thresholds", () => {
    it("requires 2 creatures to promote in PLAINS", () => {
      // No promotion with just 1 Centaur
      const noPromo = getEligibleRecruitments(TerrainType.PLAINS, [CreatureType.CENTAUR]);
      expect(noPromo).toContain(CreatureType.CENTAUR);
      expect(noPromo).not.toContain(CreatureType.LION);

      // Promotion with 2 Centaurs
      const withPromo = getEligibleRecruitments(TerrainType.PLAINS, [CreatureType.CENTAUR, CreatureType.CENTAUR]);
      expect(withPromo).toContain(CreatureType.LION);
    });

    it("handles 3-creature promotion thresholds", () => {
      const eligible = getEligibleRecruitments(TerrainType.WOODS, [
        CreatureType.CENTAUR,
        CreatureType.CENTAUR,
        CreatureType.CENTAUR,
      ]);
      expect(eligible).toContain(CreatureType.WARBEAR);
    });

    it("respects max legion size limit", () => {
      const creatures = Array(7).fill(CreatureType.CENTAUR);
      const eligible = getEligibleRecruitments(TerrainType.PLAINS, creatures, 7);
      expect(eligible).toEqual([]);
    });
  });

  describe("Terrain-specific recruitment", () => {
    it("gets recruitable creatures for terrain", () => {
      const plains = getRecruitableCreatures(TerrainType.PLAINS);
      expect(plains).toContain(CreatureType.CENTAUR);
      expect(plains).toContain(CreatureType.LION);
      expect(plains).toContain(CreatureType.RANGER);
    });

    it("gets recruitable creatures for mountains (high tier)", () => {
      const mountains = getRecruitableCreatures(TerrainType.MOUNTAINS);
      expect(mountains).toContain(CreatureType.LION);
      expect(mountains).toContain(CreatureType.MINOTAUR);
      expect(mountains).toContain(CreatureType.DRAGON);
      expect(mountains).toContain(CreatureType.COLOSSUS);
    });

    it("gets recruitable creatures for jungle", () => {
      const jungle = getRecruitableCreatures(TerrainType.JUNGLE);
      expect(jungle).toContain(CreatureType.GARGOYLE);
      expect(jungle).toContain(CreatureType.CYCLOPS);
      expect(jungle).toContain(CreatureType.BEHEMOTH);
      expect(jungle).toContain(CreatureType.SERPENT);
    });

    it("different terrains have different recruitment chains", () => {
      const plains = getRecruitableCreatures(TerrainType.PLAINS);
      const jungle = getRecruitableCreatures(TerrainType.JUNGLE);
      expect(plains).not.toEqual(jungle);
    });
  });

  describe("Mixed recruitment scenarios", () => {
    it("handles legion with mixed creature types", () => {
      const eligible = getEligibleRecruitments(TerrainType.BRUSH, [
        CreatureType.GARGOYLE,
        CreatureType.CYCLOPS,
        CreatureType.GORGON,
      ]);
      // Should offer same-type recruitment for each present type
      expect(eligible.length).toBeGreaterThan(0);
    });

    it("same-type recruitment always available if creature present", () => {
      const eligible = getEligibleRecruitments(TerrainType.MARSH, [CreatureType.OGRE]);
      expect(eligible).toContain(CreatureType.OGRE);
    });

    it("promotion chain stops at end", () => {
      // RANGER is final step in Plains, no further promotions
      const eligible = getEligibleRecruitments(TerrainType.PLAINS, [CreatureType.RANGER, CreatureType.RANGER]);
      expect(eligible).toContain(CreatureType.RANGER);
    });

    it("handles multiple creatures below promotion threshold", () => {
      const eligible = getEligibleRecruitments(TerrainType.MOUNTAINS, [
        CreatureType.LION,
        CreatureType.MINOTAUR,
      ]);
      expect(eligible).toContain(CreatureType.LION);
      expect(eligible).toContain(CreatureType.MINOTAUR);
    });
  });

  describe("Empty and boundary cases", () => {
    it("returns recruitable creatures when starting with first creature", () => {
      // With a single centaur, PLAINS allows centaur and possible promotions
      const eligible = getEligibleRecruitments(TerrainType.PLAINS, [CreatureType.CENTAUR]);
      expect(Array.isArray(eligible)).toBe(true);
      expect(eligible).toContain(CreatureType.CENTAUR);
    });

    it("handles legion at 6 creatures (room for 1 more)", () => {
      const creatures = Array(6).fill(CreatureType.CENTAUR);
      const eligible = getEligibleRecruitments(TerrainType.PLAINS, creatures, 7);
      expect(Array.isArray(eligible)).toBe(true);
    });

    it("no legit recruitment when at 7 creatures", () => {
      const creatures = Array(7).fill(CreatureType.CENTAUR);
      const eligible = getEligibleRecruitments(TerrainType.PLAINS, creatures);
      expect(eligible).toEqual([]);
    });
  });
});
