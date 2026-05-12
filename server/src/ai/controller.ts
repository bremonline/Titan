import { GameEngine } from "../game/engine.js";
import { createCreatureDef } from "../game/creatureDefs.js";
import { getValidDestinations } from "../game/movementRules.js";
import { getEligibleRecruitments } from "../game/recruitmentRules.js";
import { CreatureDef, CreatureType, Phase, Player, TileId } from "../types.js";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

type SplitStrategy = "keep-copies-together" | "turtle-5-2-titan-safe";
type MovePolicy = "always-move-when-possible" | "turtle-titan-recruit-only";
type RecruitPolicy = "prefer-strongest-eligible";
type AttackPolicy = "always-attack-when-possible" | "avoid-attack-at-all-costs";

interface AiStyleRuleSet {
  splitAt: number;
  splitStrategy: SplitStrategy;
  movePolicy: MovePolicy;
  recruitPolicy: RecruitPolicy;
  attackPolicy: AttackPolicy;
}

interface AiStyleConfig {
  defaults: AiStyleRuleSet;
  styles: Record<string, Partial<AiStyleRuleSet>>;
}

const FALLBACK_DEFAULTS: AiStyleRuleSet = {
  splitAt: 7,
  splitStrategy: "keep-copies-together",
  movePolicy: "always-move-when-possible",
  recruitPolicy: "prefer-strongest-eligible",
  attackPolicy: "always-attack-when-possible",
};

function parseStyleMarkdown(markdown: string): AiStyleConfig {
  const config: AiStyleConfig = {
    defaults: { ...FALLBACK_DEFAULTS },
    styles: {},
  };

  let currentSection: "defaults" | "style" | null = null;
  let currentStyleName = "";

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (/^##\s+Defaults$/i.test(line)) {
      currentSection = "defaults";
      currentStyleName = "";
      continue;
    }

    const styleMatch = line.match(/^##\s+Style:\s+(.+)$/i);
    if (styleMatch) {
      currentSection = "style";
      currentStyleName = styleMatch[1].trim();
      if (!config.styles[currentStyleName]) {
        config.styles[currentStyleName] = {};
      }
      continue;
    }

    const ruleMatch = line.match(/^[-*]\s*([A-Za-z]+)\s*:\s*(.+)$/);
    if (!ruleMatch || !currentSection) {
      continue;
    }

    const key = ruleMatch[1].trim();
    const value = ruleMatch[2].trim().replace(/^`|`$/g, "");

    if (!["splitAt", "splitStrategy", "movePolicy", "recruitPolicy", "attackPolicy"].includes(key)) {
      continue;
    }

    if (key === "splitAt") {
      const splitAtValue = Number.parseInt(value, 10);
      if (!Number.isInteger(splitAtValue) || splitAtValue < 2) {
        continue;
      }

      if (currentSection === "defaults") {
        config.defaults.splitAt = splitAtValue;
      } else if (currentSection === "style" && currentStyleName) {
        config.styles[currentStyleName].splitAt = splitAtValue;
      }

      continue;
    }

    if (currentSection === "defaults") {
      if (key === "splitStrategy") {
        config.defaults.splitStrategy = value as SplitStrategy;
      } else if (key === "movePolicy") {
        config.defaults.movePolicy = value as MovePolicy;
      } else if (key === "recruitPolicy") {
        config.defaults.recruitPolicy = value as RecruitPolicy;
      } else if (key === "attackPolicy") {
        config.defaults.attackPolicy = value as AttackPolicy;
      }
      continue;
    }

    if (currentSection === "style" && currentStyleName) {
      if (key === "splitStrategy") {
        config.styles[currentStyleName].splitStrategy = value as SplitStrategy;
      } else if (key === "movePolicy") {
        config.styles[currentStyleName].movePolicy = value as MovePolicy;
      } else if (key === "recruitPolicy") {
        config.styles[currentStyleName].recruitPolicy = value as RecruitPolicy;
      } else if (key === "attackPolicy") {
        config.styles[currentStyleName].attackPolicy = value as AttackPolicy;
      }
    }
  }

  return config;
}

function loadStyleConfigFromMarkdown(): AiStyleConfig {
  try {
    const currentFilePath = fileURLToPath(import.meta.url);
    const currentDir = path.dirname(currentFilePath);
    const markdownPath = path.join(currentDir, "styles.md");
    const markdown = readFileSync(markdownPath, "utf8");
    return parseStyleMarkdown(markdown);
  } catch {
    return {
      defaults: { ...FALLBACK_DEFAULTS },
      styles: {},
    };
  }
}

const stylesConfig = loadStyleConfigFromMarkdown();

function getStyleRules(styleName: string): AiStyleRuleSet {
  const defaults = stylesConfig.defaults;
  const styleOverrides = stylesConfig.styles[styleName] || {};

  return {
    ...defaults,
    ...styleOverrides,
  };
}

function isAiPlayer(player: Player | undefined): player is Player {
  return !!player?.aiPlayStyle;
}

function groupByCreatureType(player: Player, legionId: string) {
  const legion = player.legions.find((candidate) => candidate.id === legionId);
  if (!legion) {
    return [] as Array<{ type: CreatureType; creatures: CreatureDef[] }>;
  }

  const groups = new Map<CreatureType, CreatureDef[]>();
  for (const creature of legion.creatures) {
    if (!groups.has(creature.type)) {
      groups.set(creature.type, []);
    }
    groups.get(creature.type)!.push(creature);
  }

  return Array.from(groups.entries())
    .map(([type, creatures]) => ({ type, creatures }))
    .sort((a, b) => b.creatures.length - a.creatures.length);
}

function splitKeepingCopies(
  player: Player,
  legionId: string,
  splitAt: number
): { stay: CreatureDef[]; split: CreatureDef[] } | null {
  const legion = player.legions.find((candidate) => candidate.id === legionId);
  if (!legion) {
    return null;
  }

  if (legion.creatures.length < splitAt) {
    return null;
  }

  const targetSplitSize = Math.max(3, Math.floor(legion.creatures.length / 2));
  const groups = groupByCreatureType(player, legionId);
  const stay: typeof legion.creatures = [];
  const split: typeof legion.creatures = [];

  for (const group of groups) {
    if (split.length + group.creatures.length <= targetSplitSize || stay.length >= targetSplitSize) {
      split.push(...group.creatures);
    } else {
      stay.push(...group.creatures);
    }
  }

  if (stay.length === 0 || split.length === 0) {
    return null;
  }

  return { stay, split };
}

function splitTurtleFiveTwo(player: Player, legionId: string): { stay: CreatureDef[]; split: CreatureDef[] } | null {
  const legion = player.legions.find((candidate) => candidate.id === legionId);
  if (!legion || legion.creatures.length !== 7) {
    return null;
  }

  const creatures = [...legion.creatures];
  const titan = creatures.find((creature) => creature.type === CreatureType.TITAN) || null;
  const remaining = titan ? creatures.filter((creature) => creature !== titan) : creatures;

  const byType = new Map<CreatureType, CreatureDef[]>();
  for (const creature of remaining) {
    if (!byType.has(creature.type)) {
      byType.set(creature.type, []);
    }
    byType.get(creature.type)!.push(creature);
  }

  let split: CreatureDef[] = [];
  const pairCandidates = Array.from(byType.entries())
    .filter(([, entries]) => entries.length >= 2)
    .map(([type, entries]) => ({
      type,
      entries: entries.slice(0, 2),
      score: creatureValue(type),
    }))
    .sort((a, b) => a.score - b.score);

  if (pairCandidates.length > 0) {
    split = pairCandidates[0].entries;
  } else {
    split = [...remaining]
      .sort((a, b) => creatureValue(a.type) - creatureValue(b.type))
      .slice(0, 2);
  }

  if (split.length !== 2) {
    return null;
  }

  const splitSet = new Set(split);
  const stay = creatures.filter((creature) => !splitSet.has(creature));

  if (stay.length !== 5) {
    return null;
  }

  if (titan && !stay.includes(titan)) {
    return null;
  }

  return { stay, split };
}

function creatureValue(type: CreatureType): number {
  const def = createCreatureDef(type, "#000000");
  return def.power * def.skill;
}

function pickBestRecruit(eligible: CreatureType[]): CreatureType | null {
  if (eligible.length === 0) {
    return null;
  }

  const sorted = [...eligible].sort((a, b) => creatureValue(b) - creatureValue(a));
  return sorted[0] ?? null;
}

function pickFirstOpenDestination(sourceTile: TileId, dieRoll: number, occupied: Set<TileId>): TileId | null {
  const candidates = getValidDestinations(sourceTile, dieRoll);
  for (const target of candidates) {
    if (!occupied.has(target)) {
      return target;
    }
  }
  return null;
}

function pickRecruitableDestinationForLegion(
  engine: GameEngine,
  legion: { tile: TileId; creatures: CreatureDef[] },
  dieRoll: number,
  occupied: Set<TileId>
): TileId | null {
  const candidates = getValidDestinations(legion.tile, dieRoll);
  for (const target of candidates) {
    if (occupied.has(target)) {
      continue;
    }

    const terrain = engine.getTerrainTypeForTile(target);
    if (!terrain) {
      continue;
    }

    const eligible = getEligibleRecruitments(
      terrain,
      legion.creatures.map((creature) => creature.type),
      7
    );

    if (eligible.length > 0) {
      return target;
    }
  }

  return null;
}

function hasContestedBattle(game: ReturnType<GameEngine["getGame"]>): boolean {
  if (!game) {
    return false;
  }
  return Array.from(game.tiles.values()).some((tile) => {
    if ((tile.legions || []).length < 2) {
      return false;
    }
    const playerIds = new Set((tile.legions || []).map((legion) => legion.playerId));
    return playerIds.size >= 2;
  });
}

export function runAiStep(engine: GameEngine, gameId: string): boolean {
  const game = engine.getGame(gameId);
  if (!game || !game.activePlayer) {
    return false;
  }

  const activePlayer = game.players.get(game.activePlayer);
  if (!isAiPlayer(activePlayer) || activePlayer.status !== "ACTIVE") {
    return false;
  }

  const style = activePlayer.aiPlayStyle || "Normal";
  const rules = getStyleRules(style);

  if (game.phase === Phase.SPLIT) {
    const candidate =
      rules.splitStrategy === "turtle-5-2-titan-safe"
        ? activePlayer.legions.find((legion) => legion.creatures.length === rules.splitAt)
        : activePlayer.legions.find((legion) => legion.creatures.length >= rules.splitAt);

    if (candidate) {
      const plan =
        rules.splitStrategy === "turtle-5-2-titan-safe"
          ? splitTurtleFiveTwo(activePlayer, candidate.id)
          : splitKeepingCopies(activePlayer, candidate.id, rules.splitAt);

      if (plan) {
        engine.splitLegion(game.id, candidate.id, plan.stay, plan.split, candidate.tile);
      }
    }

    engine.endPhase(game.id, activePlayer.id);
    return true;
  }

  if (game.phase === Phase.MOVE) {
    if (!["always-move-when-possible", "turtle-titan-recruit-only"].includes(rules.movePolicy)) {
      return false;
    }

    if (game.dieRoll === null) {
      engine.rollForMove(game.id, activePlayer.id);
    }

    const refreshed = engine.getGame(game.id);
    if (!refreshed || refreshed.phase !== Phase.MOVE || refreshed.dieRoll === null) {
      return true;
    }

    const refreshedPlayer = refreshed.players.get(activePlayer.id);
    if (!refreshedPlayer) {
      return true;
    }

    const occupied = new Set(
      Array.from(refreshed.tiles.values())
        .filter((tile) => tile.legions.length > 0)
        .map((tile) => tile.id)
    );

    for (const legion of refreshedPlayer.legions) {
      const sourceTile = legion.tile;
      const isTitanLegion = legion.creatures.some((creature) => creature.type === CreatureType.TITAN);
      const destination =
        rules.movePolicy === "turtle-titan-recruit-only" && isTitanLegion
          ? pickRecruitableDestinationForLegion(engine, legion, refreshed.dieRoll, occupied)
          : pickFirstOpenDestination(legion.tile, refreshed.dieRoll, occupied);
      if (!destination) {
        continue;
      }

      const moved = engine.moveLegion(game.id, legion.id, legion.tile, destination);
      if (moved) {
        occupied.delete(sourceTile);
        occupied.add(destination);
      }
    }

    engine.endPhase(game.id, refreshedPlayer.id);
    return true;
  }

  if (game.phase === Phase.FIGHT) {
    if (!["always-attack-when-possible", "avoid-attack-at-all-costs"].includes(rules.attackPolicy)) {
      return false;
    }

    if (!hasContestedBattle(game)) {
      engine.endPhase(game.id, activePlayer.id);
      return true;
    }

    // FIGHT phase is handled by the battle board flow (client-side tactical movement/strikes).
    // Keep the game in FIGHT so visible combat can play out.
    return false;
  }

  if (game.phase === Phase.RECRUIT) {
    if (rules.recruitPolicy !== "prefer-strongest-eligible") {
      return false;
    }

    const refreshed = engine.getGame(game.id);
    if (!refreshed) {
      return false;
    }

    const refreshedPlayer = refreshed.players.get(activePlayer.id);
    if (!refreshedPlayer) {
      return false;
    }

    const movedLegions = [...refreshed.movedLegionsThisTurn];
    for (const legionId of movedLegions) {
      const legion = refreshedPlayer.legions.find((candidate) => candidate.id === legionId);
      if (!legion) {
        continue;
      }

      const tile = refreshed.tiles.get(legion.tile);
      if (!tile) {
        continue;
      }

      const eligible = getEligibleRecruitments(
        tile.terrainType,
        legion.creatures.map((creature) => creature.type),
        7
      );

      const bestRecruit = pickBestRecruit(eligible);
      if (!bestRecruit) {
        continue;
      }

      engine.recruitCreature(game.id, legion.id, bestRecruit);
    }

    engine.endPhase(game.id, refreshedPlayer.id);
    return true;
  }

  return false;
}
