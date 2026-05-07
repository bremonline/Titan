import { TerrainType, CreatureType } from "../types.js";

/**
 * Recruitment chain per terrain.
 * - Any listed creature type can recruit another of the same type if at least one is present.
 * - If a step has `promoteAt`, having that many of the step's type can recruit the next step.
 * Source: Titan Rules recruitment chart.
 */
export interface RecruitmentStep {
  type: CreatureType;
  promoteAt?: number;
}

export const recruitmentByTerrain: Record<TerrainType, RecruitmentStep[]> = {
  [TerrainType.TOWER]: [
    { type: CreatureType.CENTAUR },
    { type: CreatureType.GARGOYLE },
    { type: CreatureType.OGRE },
  ],
  [TerrainType.BRUSH]: [
    { type: CreatureType.GARGOYLE, promoteAt: 2 },
    { type: CreatureType.CYCLOPS, promoteAt: 2 },
    { type: CreatureType.GORGON },
  ],
  [TerrainType.PLAINS]: [
    { type: CreatureType.CENTAUR, promoteAt: 2 },
    { type: CreatureType.LION, promoteAt: 2 },
    { type: CreatureType.RANGER },
  ],
  [TerrainType.MARSH]: [
    { type: CreatureType.OGRE, promoteAt: 2 },
    { type: CreatureType.TROLL, promoteAt: 2 },
    { type: CreatureType.RANGER },
  ],
  [TerrainType.MOUNTAINS]: [
    { type: CreatureType.LION, promoteAt: 2 },
    { type: CreatureType.MINOTAUR, promoteAt: 2 },
    { type: CreatureType.DRAGON, promoteAt: 2 },
    { type: CreatureType.COLOSSUS },
  ],
  [TerrainType.JUNGLE]: [
    { type: CreatureType.GARGOYLE, promoteAt: 2 },
    { type: CreatureType.CYCLOPS, promoteAt: 3 },
    { type: CreatureType.BEHEMOTH, promoteAt: 2 },
    { type: CreatureType.SERPENT },
  ],
  [TerrainType.WOODS]: [
    { type: CreatureType.CENTAUR, promoteAt: 3 },
    { type: CreatureType.WARBEAR, promoteAt: 2 },
    { type: CreatureType.UNICORN },
  ],
  [TerrainType.HILLS]: [
    { type: CreatureType.OGRE, promoteAt: 3 },
    { type: CreatureType.MINOTAUR, promoteAt: 2 },
    { type: CreatureType.UNICORN },
  ],
  [TerrainType.DESERT]: [
    { type: CreatureType.LION, promoteAt: 3 },
    { type: CreatureType.GRIFFON, promoteAt: 2 },
    { type: CreatureType.HYDRA },
  ],
  [TerrainType.SWAMP]: [
    { type: CreatureType.TROLL, promoteAt: 3 },
    { type: CreatureType.WYVERN, promoteAt: 2 },
    { type: CreatureType.HYDRA },
  ],
  [TerrainType.TUNDRA]: [
    { type: CreatureType.TROLL, promoteAt: 2 },
    { type: CreatureType.WARBEAR, promoteAt: 2 },
    { type: CreatureType.GIANT, promoteAt: 2 },
    { type: CreatureType.COLOSSUS },
  ],
};

/**
 * Gets all creature types mentioned by a terrain's recruitment chain.
 */
export function getRecruitableCreatures(terrain: TerrainType): CreatureType[] {
  return (recruitmentByTerrain[terrain] || []).map((step) => step.type);
}

/**
 * Computes legal recruit results for a legion in a terrain.
 */
export function getEligibleRecruitments(
  terrain: TerrainType,
  creatures: CreatureType[],
  maxLegionSize = 7
): CreatureType[] {
  if (creatures.length >= maxLegionSize) {
    return [];
  }

  const steps = recruitmentByTerrain[terrain] || [];
  if (steps.length === 0) {
    return [];
  }

  const counts = new Map<CreatureType, number>();
  for (const type of creatures) {
    counts.set(type, (counts.get(type) || 0) + 1);
  }

  const eligible = new Set<CreatureType>();
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const count = counts.get(step.type) || 0;

    // Same-type recruit if at least one creature of this type exists.
    if (count >= 1) {
      eligible.add(step.type);
    }

    // Promote to next chain step if threshold is met.
    if (step.promoteAt !== undefined && count >= step.promoteAt && i + 1 < steps.length) {
      eligible.add(steps[i + 1].type);
    }
  }

  // Special Tower recruitment: Guardian if legion has 3+ of any one creature type.
  if (terrain === TerrainType.TOWER) {
    // Basic Tower creatures are always recruitable in Tower.
    eligible.add(CreatureType.CENTAUR);
    eligible.add(CreatureType.GARGOYLE);
    eligible.add(CreatureType.OGRE);

    for (const count of counts.values()) {
      if (count >= 3) {
        eligible.add(CreatureType.GUARDIAN);
        break;
      }
    }

    // Special Tower recruitment: Warlock if legion contains Titan.
    if ((counts.get(CreatureType.TITAN) || 0) >= 1) {
      eligible.add(CreatureType.WARLOCK);
    }
  }

  return Array.from(eligible);
}
