import { TileId } from "../types.js";

export type MovementRules = Record<TileId, Partial<Record<number, TileId[]>>>;

type RollMap = Partial<Record<number, TileId[]>>;

function rotateTile(tile: TileId, shift: number): TileId {
  const t = String(tile).trim();
  if (!/^\d{3}$/.test(t)) {
    return tile;
  }

  // Towers use X00 format and rotate on the leading direction digit.
  if (t[1] === "0" && t[2] === "0") {
    const d = Number(t[0]);
    if (d >= 1 && d <= 6) {
      const rotated = ((d - 1 + shift) % 6) + 1;
      return `${rotated}00` as TileId;
    }
    return tile;
  }

  // Standard tile label format rds where d is the region/direction.
  const r = t[0];
  const d = Number(t[1]);
  const s = t[2];
  if (d < 1 || d > 6) {
    return tile;
  }
  const rotated = ((d - 1 + shift) % 6) + 1;
  return `${r}${rotated}${s}` as TileId;
}

function expandSymmetry(fromTile: TileId, rollMap: RollMap): MovementRules {
  const expanded: MovementRules = {};

  for (let shift = 0; shift < 6; shift += 1) {
    const rotatedFrom = rotateTile(fromTile, shift);
    if (!expanded[rotatedFrom]) {
      expanded[rotatedFrom] = {};
    }

    for (const [rollKey, destinations] of Object.entries(rollMap)) {
      const roll = Number(rollKey);
      if (!destinations || !Number.isInteger(roll)) {
        continue;
      }
      const rotatedDestinations = destinations.map((tile) => rotateTile(tile, shift));
      expanded[rotatedFrom]![roll] = [...new Set(rotatedDestinations)];
    }
  }

  return expanded;
}

// Curated movement map: from tile -> exact die roll -> valid destination tiles.
const movementRulesSeed: MovementRules = {
  "100": {
    1: ["312", "314", "414"],
    2: ["211", "315", "413"],
    3: ["212", "321", "412"],
    4: ["213", "322", "411"],
    5: ["314", "221", "467"],
    6: ["315", "222", "466"],
  },
  "312": {
    1: ["100", "211"],
    2: ["414", "314", "212"],
    3: ["213", "413", "315"],
    4: ["314", "412", "321"],
    5: ["315", "411", "322"],
    6: ["321", "467", "221"],
  },
  "211": {
    1: ["212", "263"],
    2: ["213", "364"],
    3: ["314", "365"],
    4: ["315", "311"],
    5: ["321", "312"],
    6: ["322", "211"],
  },
  "212": {
    1: ["110", "213"],
    2: ["160", "314"],
    3: ["150", "315"],
    4: ["146", "321"],
    5: ["130", "322"],
    6: ["120", "221"],
  },
  "213": {
    1: ["221", "314"],
    2: ["222", "315"],
    3: ["223", "321"],
    4: ["324", "322"],
    5: ["325", "221"],
    6: ["331", "222"],
  },
  "314": {
    1: ["100", "315"],
    2: ["312", "414", "321"],
    3: ["211", "413", "322"],
    4: ["212", "412", "221"],
    5: ["213", "411", "222"],
    6: ["314", "467", "223"],
  },
  "110": {
    1: ["212"],
    2: ["213"],
    3: ["314"],
    4: ["315"],
    5: ["321"],
    6: ["322"],
  },
  "311": {
    1: ["412"],
    2: ["411"],
    3: ["467"],
    4: ["466"],
    5: ["465"],
    6: ["464"],
  },
  "315": {
    1: ["416"],
    2: ["415"],
    3: ["414"],
    4: ["413"],
    5: ["412"],
    6: ["411"],
  },
  "411": {
    1: ["467"],
    2: ["466"],
    3: ["465"],
    4: ["464"],
    5: ["463"],
    6: ["462"],
  },
  "412": {
    1: ["411", "311"],
    2: ["467", "312"],
    3: ["466", "211"],
    4: ["465", "212"],
    5: ["464", "213"],
    6: ["463", "314"],
  },
  "413": {
    1: ["412"],
    2: ["411"],
    3: ["467"],
    4: ["466"],
    5: ["465"],
    6: ["464"],
  },
  "414": {
    1: ["100", "413"],
    2: ["312", "314", "412"],
    3: ["211", "315", "411"],
    4: ["212", "321", "467"],
    5: ["213", "322", "466"],
    6: ["314", "221", "465"],
  },
  "415": {
    1: ["414"],
    2: ["413"],
    3: ["412"],
    4: ["411"],
    5: ["467"],
    6: ["466"],
  },
  "416": {
    1: ["415", "315"],
    2: ["414", "321"],
    3: ["413", "322"],
    4: ["412", "221"],
    5: ["411", "222"],
    6: ["467", "223"],
  },
  "417": {
    1: ["416"],
    2: ["415"],
    3: ["414"],
    4: ["413"],
    5: ["412"],
    6: ["411"],
  },
};

const movementRules: MovementRules = Object.entries(movementRulesSeed).reduce((acc, [fromTile, rollMap]) => {
  const expanded = expandSymmetry(fromTile as TileId, rollMap ?? {});
  for (const [expandedFrom, expandedRollMap] of Object.entries(expanded)) {
    if (!acc[expandedFrom as TileId]) {
      acc[expandedFrom as TileId] = {};
    }
    Object.assign(acc[expandedFrom as TileId], expandedRollMap);
  }
  return acc;
}, {} as MovementRules);

export function getValidDestinations(fromTile: TileId, dieRoll: number): TileId[] {
  if (!Number.isInteger(dieRoll) || dieRoll < 1) {
    return [];
  }
  return movementRules[fromTile]?.[dieRoll] ?? [];
}

export function upsertMovementRule(fromTile: TileId, dieRoll: number, destinations: TileId[]): void {
  if (!movementRules[fromTile]) {
    movementRules[fromTile] = {};
  }
  movementRules[fromTile]![dieRoll] = [...new Set(destinations)];
}

export function getMovementRulesSnapshot(): MovementRules {
  return movementRules;
}
