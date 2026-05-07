import { CreatureType, CreatureDef } from "../types.js";

/**
 * Creature definitions with power/skill stats.
 * Source: Titan Rules creature table
 */
export const CREATURE_DEFS: Record<CreatureType, Omit<CreatureDef, 'color'>> = {
  // LORDS
  [CreatureType.TITAN]: { type: CreatureType.TITAN, power: 6, skill: 4 },
  [CreatureType.ANGEL]: { type: CreatureType.ANGEL, power: 6, skill: 4 },
  [CreatureType.ARCHANGEL]: { type: CreatureType.ARCHANGEL, power: 9, skill: 4 },
  // DEMI-LORDS
  [CreatureType.GUARDIAN]: { type: CreatureType.GUARDIAN, power: 12, skill: 2 },
  [CreatureType.WARLOCK]: { type: CreatureType.WARLOCK, power: 5, skill: 4 },
  // CREATURES
  [CreatureType.BEHEMOTH]: { type: CreatureType.BEHEMOTH, power: 8, skill: 3 },
  [CreatureType.CENTAUR]: { type: CreatureType.CENTAUR, power: 3, skill: 4 },
  [CreatureType.COLOSSUS]: { type: CreatureType.COLOSSUS, power: 10, skill: 4 },
  [CreatureType.CYCLOPS]: { type: CreatureType.CYCLOPS, power: 9, skill: 2 },
  [CreatureType.DRAGON]: { type: CreatureType.DRAGON, power: 9, skill: 3 },
  [CreatureType.GARGOYLE]: { type: CreatureType.GARGOYLE, power: 4, skill: 3 },
  [CreatureType.GIANT]: { type: CreatureType.GIANT, power: 7, skill: 4 },
  [CreatureType.GORGON]: { type: CreatureType.GORGON, power: 6, skill: 3 },
  [CreatureType.GRIFFON]: { type: CreatureType.GRIFFON, power: 5, skill: 4 },
  [CreatureType.HYDRA]: { type: CreatureType.HYDRA, power: 10, skill: 3 },
  [CreatureType.LION]: { type: CreatureType.LION, power: 5, skill: 3 },
  [CreatureType.MINOTAUR]: { type: CreatureType.MINOTAUR, power: 4, skill: 4 },
  [CreatureType.OGRE]: { type: CreatureType.OGRE, power: 6, skill: 2 },
  [CreatureType.RANGER]: { type: CreatureType.RANGER, power: 4, skill: 4 },
  [CreatureType.SERPENT]: { type: CreatureType.SERPENT, power: 18, skill: 2 },
  [CreatureType.TROLL]: { type: CreatureType.TROLL, power: 8, skill: 2 },
  [CreatureType.UNICORN]: { type: CreatureType.UNICORN, power: 6, skill: 4 },
  [CreatureType.WARBEAR]: { type: CreatureType.WARBEAR, power: 6, skill: 3 },
  [CreatureType.WYVERN]: { type: CreatureType.WYVERN, power: 7, skill: 3 },
};

/**
 * Gets the base definition for a creature type with an assigned color.
 */
export function createCreatureDef(type: CreatureType, color: string): CreatureDef {
  const baseDef = CREATURE_DEFS[type];
  if (!baseDef) {
    throw new Error(`Unknown creature type: ${type}`);
  }
  return { ...baseDef, color };
}
