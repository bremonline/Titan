import { describe, expect, it } from "vitest";

import { getEligibleRecruitments } from "../src/game/recruitmentRules.js";
import { CreatureType, TerrainType } from "../src/types.js";

describe("getEligibleRecruitments", () => {
  it("returns same-type and promotion recruits when thresholds are met", () => {
    const result = getEligibleRecruitments(TerrainType.PLAINS, [
      CreatureType.CENTAUR,
      CreatureType.CENTAUR,
    ]);

    expect(result).toEqual(expect.arrayContaining([CreatureType.CENTAUR, CreatureType.LION]));
    expect(result).toHaveLength(2);
  });

  it("applies tower special recruits for guardian and warlock", () => {
    const result = getEligibleRecruitments(TerrainType.TOWER, [
      CreatureType.TITAN,
      CreatureType.OGRE,
      CreatureType.OGRE,
      CreatureType.OGRE,
    ]);

    expect(result).toEqual(
      expect.arrayContaining([
        CreatureType.CENTAUR,
        CreatureType.GARGOYLE,
        CreatureType.OGRE,
        CreatureType.GUARDIAN,
        CreatureType.WARLOCK,
      ])
    );
  });

  it("returns no recruits when legion is already at max size", () => {
    const result = getEligibleRecruitments(
      TerrainType.PLAINS,
      [
        CreatureType.CENTAUR,
        CreatureType.CENTAUR,
        CreatureType.LION,
        CreatureType.LION,
        CreatureType.RANGER,
        CreatureType.OGRE,
        CreatureType.TITAN,
      ],
      7
    );

    expect(result).toEqual([]);
  });
});
