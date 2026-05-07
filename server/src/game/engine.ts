import { v4 as uuid } from "uuid";
import {
  GameState,
  Phase,
  PlayerId,
  Player,
  Legion,
  LegionId,
  TileId,
  CreatureDef,
  CreatureType,
  TerrainType,
  TileState,
  LogEntry,
  LogAction,
  ServerEvents,
} from "../types.js";
import { getValidDestinations } from "./movementRules.js";
import { getEligibleRecruitments } from "./recruitmentRules.js";
import { createCreatureDef } from "./creatureDefs.js";

// ============================================================================
// TILE CONFIGURATION
// ============================================================================

const TOWER_IDS: TileId[] = ["100", "200", "300", "400", "500", "600"];

const TERRAIN_MAP: Record<TileId, TerrainType> = {
  // Complete terrain mapping by tile id.
  "100": TerrainType.TOWER,
  "200": TerrainType.TOWER,
  "300": TerrainType.TOWER,
  "400": TerrainType.TOWER,
  "500": TerrainType.TOWER,
  "600": TerrainType.TOWER,
  "110": TerrainType.TUNDRA,
  "130": TerrainType.TUNDRA,
  "150": TerrainType.TUNDRA,
  "120": TerrainType.MOUNTAINS,
  "140": TerrainType.MOUNTAINS,
  "160": TerrainType.MOUNTAINS,
  "262": TerrainType.PLAINS,
  "263": TerrainType.WOODS,
  "211": TerrainType.DESERT,
  "212": TerrainType.MARSH,
  "213": TerrainType.HILLS,
  "221": TerrainType.SWAMP,
  "222": TerrainType.PLAINS,
  "223": TerrainType.WOODS,
  "231": TerrainType.DESERT,
  "232": TerrainType.MARSH,
  "233": TerrainType.HILLS,
  "241": TerrainType.SWAMP,
  "242": TerrainType.PLAINS,
  "243": TerrainType.WOODS,
  "251": TerrainType.DESERT,
  "252": TerrainType.MARSH,
  "253": TerrainType.HILLS,
  "261": TerrainType.SWAMP,
  "313": TerrainType.TOWER,
  "323": TerrainType.TOWER,
  "333": TerrainType.TOWER,
  "343": TerrainType.TOWER,
  "353": TerrainType.TOWER,
  "363": TerrainType.TOWER,
  "314": TerrainType.BRUSH,
  "315": TerrainType.WOODS,
  "321": TerrainType.JUNGLE,
  "322": TerrainType.MARSH,
  "324": TerrainType.BRUSH,
  "325": TerrainType.HILLS,
  "331": TerrainType.JUNGLE,
  "332": TerrainType.PLAINS,
  "334": TerrainType.BRUSH,
  "335": TerrainType.WOODS,
  "341": TerrainType.JUNGLE,
  "342": TerrainType.MARSH,
  "344": TerrainType.BRUSH,
  "345": TerrainType.HILLS,
  "351": TerrainType.JUNGLE,
  "352": TerrainType.PLAINS,
  "354": TerrainType.BRUSH,
  "355": TerrainType.WOODS,
  "361": TerrainType.JUNGLE,
  "362": TerrainType.MARSH,
  "364": TerrainType.BRUSH,
  "365": TerrainType.HILLS,
  "311": TerrainType.JUNGLE,
  "312": TerrainType.PLAINS,
  "414": TerrainType.MARSH,
  "415": TerrainType.BRUSH,
  "416": TerrainType.PLAINS,
  "417": TerrainType.JUNGLE,
  "421": TerrainType.MARSH,
  "422": TerrainType.BRUSH,
  "423": TerrainType.DESERT,
  "424": TerrainType.PLAINS,
  "425": TerrainType.BRUSH,
  "426": TerrainType.MARSH,
  "427": TerrainType.SWAMP,
  "431": TerrainType.PLAINS,
  "432": TerrainType.BRUSH,
  "433": TerrainType.JUNGLE,
  "434": TerrainType.MARSH,
  "435": TerrainType.BRUSH,
  "436": TerrainType.PLAINS,
  "437": TerrainType.JUNGLE,
  "441": TerrainType.MARSH,
  "442": TerrainType.BRUSH,
  "443": TerrainType.DESERT,
  "444": TerrainType.PLAINS,
  "445": TerrainType.BRUSH,
  "446": TerrainType.MARSH,
  "447": TerrainType.SWAMP,
  "451": TerrainType.PLAINS,
  "452": TerrainType.BRUSH,
  "453": TerrainType.JUNGLE,
  "454": TerrainType.MARSH,
  "455": TerrainType.BRUSH,
  "456": TerrainType.PLAINS,
  "457": TerrainType.JUNGLE,
  "461": TerrainType.MARSH,
  "462": TerrainType.BRUSH,
  "463": TerrainType.DESERT,
  "464": TerrainType.PLAINS,
  "465": TerrainType.BRUSH,
  "466": TerrainType.MARSH,
  "467": TerrainType.SWAMP,
  "411": TerrainType.PLAINS,
  "412": TerrainType.BRUSH,
  "413": TerrainType.JUNGLE,
};

const RING_COUNT = 4;
const TRIANGLE_SIDE = 120;
const TRIANGLE_HEIGHT = (Math.sqrt(3) * TRIANGLE_SIDE) / 2;

const SPECIAL_LABEL_MAP = new Map<string, TileId>([
  ["313", "100"],
  ["323", "200"],
  ["333", "300"],
  ["343", "400"],
  ["353", "500"],
  ["363", "600"],
]);

type Point = { x: number; y: number };
type TriangleData = {
  coordinates: Point[];
  centerPoint: Point;
  radius: number;
  ring: number;
  direction: number;
  sectionIndex: number;
  number: string;
  displayNumber: TileId;
};

function latticePoint(column: number, row: number): Point {
  return {
    x: (column + row / 2) * TRIANGLE_SIDE,
    y: row * TRIANGLE_HEIGHT,
  };
}

function centroid(points: Point[]): Point {
  return {
    x: (points[0].x + points[1].x + points[2].x) / 3,
    y: (points[0].y + points[1].y + points[2].y) / 3,
  };
}

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function normalizedDirectionAngle(centerPoint: Point): number {
  const angle = Math.atan2(-centerPoint.y, centerPoint.x);
  return (angle + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
}

function radialDirection(centerPoint: Point): number {
  const normalizedAngle = normalizedDirectionAngle(centerPoint);
  return (Math.round(normalizedAngle / (Math.PI / 3)) % 6) + 1;
}

function centerTriangleLabel(centerPoint: Point): string {
  const direction = radialDirection(centerPoint);
  return `1${direction}0`;
}

function ringPosition(centerPoint: Point, direction: number): number {
  let normalizedAngle = normalizedDirectionAngle(centerPoint);
  if (direction === 1 && normalizedAngle > (Math.PI * 5) / 3) {
    normalizedAngle -= Math.PI * 2;
  }
  return normalizedAngle;
}

function pointKey(point: Point): string {
  return `${point.x.toFixed(6)},${point.y.toFixed(6)}`;
}

function edgeKey(a: Point, b: Point): string {
  const aKey = pointKey(a);
  const bKey = pointKey(b);
  return aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
}

function buildTileNeighbors(): Map<TileId, TileId[]> {
  const outerHex: Point[] = [
    { x: TRIANGLE_SIDE * RING_COUNT, y: 0 },
    { x: (TRIANGLE_SIDE * RING_COUNT) / 2, y: TRIANGLE_HEIGHT * RING_COUNT },
    { x: (-TRIANGLE_SIDE * RING_COUNT) / 2, y: TRIANGLE_HEIGHT * RING_COUNT },
    { x: -TRIANGLE_SIDE * RING_COUNT, y: 0 },
    { x: (-TRIANGLE_SIDE * RING_COUNT) / 2, y: -TRIANGLE_HEIGHT * RING_COUNT },
    { x: (TRIANGLE_SIDE * RING_COUNT) / 2, y: -TRIANGLE_HEIGHT * RING_COUNT },
  ];

  const trianglePoints: Point[][] = [];
  const latticeRadius = RING_COUNT * 2;

  for (let row = -latticeRadius; row <= latticeRadius; row += 1) {
    for (let column = -latticeRadius; column <= latticeRadius; column += 1) {
      const upward = [
        latticePoint(column, row),
        latticePoint(column + 1, row),
        latticePoint(column, row + 1),
      ];
      const downward = [
        latticePoint(column + 1, row),
        latticePoint(column + 1, row + 1),
        latticePoint(column, row + 1),
      ];

      if (pointInPolygon(centroid(upward), outerHex)) {
        trianglePoints.push(upward);
      }
      if (pointInPolygon(centroid(downward), outerHex)) {
        trianglePoints.push(downward);
      }
    }
  }

  const triangles: TriangleData[] = trianglePoints.map((coordinates) => {
    const centerPoint = centroid(coordinates);
    return {
      coordinates,
      centerPoint,
      radius: Math.hypot(centerPoint.x, centerPoint.y),
      ring: 0,
      direction: 0,
      sectionIndex: 0,
      number: "",
      displayNumber: "" as TileId,
    };
  });

  const sortedByRadius = [...triangles].sort((a, b) => a.radius - b.radius);
  const ringCounts = [6, 18, 30, 42];
  let ringStart = 0;

  for (let ringIndex = 1; ringIndex <= RING_COUNT; ringIndex += 1) {
    const ringSize = ringCounts[ringIndex - 1];
    const ringTriangles = sortedByRadius.slice(ringStart, ringStart + ringSize);
    ringStart += ringSize;

    if (ringIndex === 1) {
      for (const triangle of ringTriangles) {
        triangle.ring = ringIndex;
        triangle.direction = radialDirection(triangle.centerPoint);
        triangle.sectionIndex = 0;
        triangle.number = centerTriangleLabel(triangle.centerPoint);
      }
      continue;
    }

    for (let direction = 1; direction <= 6; direction += 1) {
      const sectionTriangles = ringTriangles
        .filter((triangle) => radialDirection(triangle.centerPoint) === direction)
        .sort((left, right) => ringPosition(left.centerPoint, direction) - ringPosition(right.centerPoint, direction));

      sectionTriangles.forEach((triangle, index) => {
        triangle.ring = ringIndex;
        triangle.direction = direction;
        triangle.sectionIndex = index + 1;
        triangle.number = `${ringIndex}${direction}${index + 1}`;
      });
    }
  }

  for (const triangle of triangles) {
    triangle.displayNumber = (SPECIAL_LABEL_MAP.get(triangle.number) ?? triangle.number) as TileId;
  }

  const byEdge = new Map<string, TriangleData[]>();
  for (const triangle of triangles) {
    const points = triangle.coordinates;
    const edges = [
      edgeKey(points[0], points[1]),
      edgeKey(points[1], points[2]),
      edgeKey(points[2], points[0]),
    ];
    for (const key of edges) {
      const current = byEdge.get(key) ?? [];
      current.push(triangle);
      byEdge.set(key, current);
    }
  }

  const neighborSets = new Map<TileId, Set<TileId>>();
  for (const pair of byEdge.values()) {
    if (pair.length !== 2) {
      continue;
    }
    const a = pair[0].displayNumber;
    const b = pair[1].displayNumber;
    if (!neighborSets.has(a)) {
      neighborSets.set(a, new Set<TileId>());
    }
    if (!neighborSets.has(b)) {
      neighborSets.set(b, new Set<TileId>());
    }
    neighborSets.get(a)!.add(b);
    neighborSets.get(b)!.add(a);
  }

  const neighbors = new Map<TileId, TileId[]>();
  for (const [tile, set] of neighborSets.entries()) {
    neighbors.set(tile, [...set]);
  }
  return neighbors;
}

const TILE_NEIGHBORS = buildTileNeighbors();

// ============================================================================
// GAME ENGINE
// ============================================================================

export class GameEngine {
  private games: Map<string, GameState> = new Map();
  private gameKeys: Map<string, string> = new Map();
  private playerByClientInGame: Map<string, PlayerId> = new Map();

  private normalizeGameId(gameId: string): string {
    return gameId.trim().replace(/\s+/g, "-");
  }

  private createInitialLegion(game: GameState, player: Player, towerTile: TileId): Legion {
    const legionId = `${player.id}-0` as LegionId;
    const initialLegion: Legion = {
      id: legionId,
      playerId: player.id,
      tile: towerTile,
      creatures: [
        {
          type: CreatureType.TITAN,
          power: 6,
          skill: 6,
          color: player.color,
        },
        {
          type: CreatureType.ANGEL,
          power: 6,
          skill: 4,
          color: player.color,
        },
        {
          type: CreatureType.OGRE,
          power: 4,
          skill: 2,
          color: player.color,
        },
        {
          type: CreatureType.OGRE,
          power: 4,
          skill: 2,
          color: player.color,
        },
        {
          type: CreatureType.TROLL,
          power: 4,
          skill: 3,
          color: player.color,
        },
        {
          type: CreatureType.TROLL,
          power: 4,
          skill: 3,
          color: player.color,
        },
        {
          type: CreatureType.CENTAUR,
          power: 3,
          skill: 4,
          color: player.color,
        },
        {
          type: CreatureType.CENTAUR,
          power: 3,
          skill: 4,
          color: player.color,
        },
      ],
    };

    player.legions.push(initialLegion);

    if (!game.tiles.has(towerTile)) {
      const tileState: TileState = {
        id: towerTile,
        terrainType: TERRAIN_MAP[towerTile] ?? TerrainType.PLAINS,
        legions: [initialLegion],
      };
      game.tiles.set(towerTile, tileState);
    } else {
      game.tiles.get(towerTile)!.legions.push(initialLegion);
    }

    return initialLegion;
  }

  private addLog(
    game: GameState,
    action: LogAction,
    playerId: PlayerId | null,
    details: Record<string, string>
  ): LogEntry {
    const entry: LogEntry = { timestamp: Date.now(), action, playerId, details };
    game.log.push(entry);
    return entry;
  }

  private countTileOccupancyByPlayer(game: GameState, tile: TileId): { friendly: number; enemy: number } {
    const activePlayer = game.activePlayer;
    if (!activePlayer) {
      return { friendly: 0, enemy: 0 };
    }

    let friendly = 0;
    let enemy = 0;
    const tileState = game.tiles.get(tile);
    if (!tileState) {
      return { friendly, enemy };
    }

    for (const legion of tileState.legions) {
      if (legion.playerId === activePlayer) {
        friendly += 1;
      } else {
        enemy += 1;
      }
    }

    return { friendly, enemy };
  }

  private hasValidExactMovePath(
    game: GameState,
    sourceTile: TileId,
    targetTile: TileId,
    steps: number
  ): boolean {
    if (steps < 1 || sourceTile === targetTile) {
      return false;
    }

    const queue: Array<{ tile: TileId; distance: number }> = [{ tile: sourceTile, distance: 0 }];
    const visited = new Set<string>([`${sourceTile}|0`]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const nextDistance = current.distance + 1;
      const neighbors = TILE_NEIGHBORS.get(current.tile) ?? [];

      for (const neighbor of neighbors) {
        const occupancy = this.countTileOccupancyByPlayer(game, neighbor);

        if (nextDistance < steps) {
          // Intermediate step: enemy stacks block traversal, friendly is pass-through.
          if (occupancy.enemy > 0) {
            continue;
          }
          const stateKey = `${neighbor}|${nextDistance}`;
          if (!visited.has(stateKey)) {
            visited.add(stateKey);
            queue.push({ tile: neighbor, distance: nextDistance });
          }
          continue;
        }

        // Final step must land exactly on target tile.
        if (nextDistance === steps && neighbor === targetTile) {
          // Cannot end on friendly stack. Enemy/empty is allowed (engagement deferred).
          return occupancy.friendly === 0;
        }
      }
    }

    return false;
  }

  /**
   * Creates a new game and initializes it with the creator as the first player.
   */
  createGame(
    requestedGameId: string,
    gameKey: string,
    gameMasterClientId: string
  ): { gameId: string; clientId: string; isGameMaster: boolean } | null {
    const gameId = this.normalizeGameId(requestedGameId);
    if (!gameId || this.games.has(gameId)) {
      return null;
    }

    const gameState: GameState = {
      id: gameId,
      gameMasterClientId,
      phase: Phase.LOBBY,
      round: 0,
      activePlayer: null,
      dieRoll: null,
      mulligansUsed: [],
      movedLegionsThisTurn: [],
      players: new Map(),
      tiles: new Map(),
      log: [],
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
    };

    this.games.set(gameId, gameState);
    this.gameKeys.set(gameId, gameKey);

    this.addLog(gameState, "GAME_CREATED", null, { gameId });

    return { gameId, clientId: gameMasterClientId, isGameMaster: true };
  }

  /**
   * Joins an existing game.
   */
  joinGame(
    gameId: string,
    gameKey: string,
    clientId: string
  ): { clientId: string; gameState: GameState; isGameMaster: boolean } | null {
    const normalizedGameId = this.normalizeGameId(gameId);
    const game = this.games.get(normalizedGameId);
    const key = this.gameKeys.get(normalizedGameId);
    if (!game || game.phase !== Phase.LOBBY || !key || key !== gameKey) {
      return null;
    }
    game.lastUpdatedAt = Date.now();

    this.addLog(game, "PLAYER_JOINED", null, { clientId });

    return {
      clientId,
      gameState: game,
      isGameMaster: game.gameMasterClientId === clientId,
    };
  }

  /**
   * Rejoins a game for an already-known client. Works for any phase as long as
   * the key matches and the client belongs to the game (or is the gamemaster).
   */
  rejoinGame(
    gameId: string,
    gameKey: string,
    clientId: string
  ): { clientId: string; gameState: GameState; isGameMaster: boolean; playerId: PlayerId | null } | null {
    const normalizedGameId = this.normalizeGameId(gameId);
    const game = this.games.get(normalizedGameId);
    const key = this.gameKeys.get(normalizedGameId);
    if (!game || !key || key !== gameKey) {
      return null;
    }

    const isGameMaster = game.gameMasterClientId === clientId;
    const playerKey = `${normalizedGameId}:${clientId}`;
    const playerId = this.playerByClientInGame.get(playerKey) ?? null;

    if (!isGameMaster && !playerId) {
      return null;
    }

    game.lastUpdatedAt = Date.now();
    this.addLog(game, "PLAYER_JOINED", playerId, { clientId, rejoin: "true" });

    return {
      clientId,
      gameState: game,
      isGameMaster,
      playerId,
    };
  }

  addPlayer(
    gameId: string,
    clientId: string,
    playerName: string,
    playerColor: string,
    towerTile: TileId
  ): { game: GameState; player: Player } | null {
    const normalizedGameId = this.normalizeGameId(gameId);
    const game = this.games.get(normalizedGameId);
    if (!game || game.phase !== Phase.LOBBY) {
      return null;
    }

    const key = `${normalizedGameId}:${clientId}`;
    if (this.playerByClientInGame.has(key)) {
      return null;
    }

    const colorAlreadyUsed = Array.from(game.players.values()).some(
      (player) => player.color.toLowerCase() === playerColor.toLowerCase()
    );
    if (colorAlreadyUsed) {
      return null;
    }

    if (!TOWER_IDS.includes(towerTile)) {
      return null;
    }

    const towerAlreadyUsed = Array.from(game.players.values()).some(
      (player) => player.towerAssignment === towerTile
    );
    if (towerAlreadyUsed) {
      return null;
    }

    const playerId = uuid();
    const player: Player = {
      id: playerId,
      name: playerName,
      color: playerColor,
      towerAssignment: towerTile,
      legions: [],
      score: 0,
      status: "ACTIVE",
    };

    game.players.set(playerId, player);
    game.lastUpdatedAt = Date.now();
    this.playerByClientInGame.set(key, playerId);
    this.addLog(game, "PLAYER_JOINED", playerId, {
      playerName,
      towerTile,
      totalPlayers: String(game.players.size),
    });

    return { game, player };
  }

  /**
   * Retrieves a game by ID.
   */
  getGame(gameId: string): GameState | null {
    return this.games.get(gameId) ?? null;
  }

  listActiveGames(): ServerEvents.ActiveGameSummary[] {
    return Array.from(this.games.values())
      .filter((game) => game.phase === Phase.LOBBY)
      .map((game) => ({
        gameId: game.id,
        phase: game.phase,
        players: game.players.size,
        createdAt: game.createdAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  clearAllGames(): number {
    const cleared = this.games.size;

    this.games.clear();
    this.gameKeys.clear();
    this.playerByClientInGame.clear();

    return cleared;
  }

  /**
   * Starts the game: transitions from LOBBY → SETUP and creates initial legions at towers.
   */
  startGame(gameId: string, requesterClientId: string): GameState | null {
    const normalizedGameId = this.normalizeGameId(gameId);
    const game = this.games.get(normalizedGameId);
    if (
      !game ||
      game.phase !== Phase.LOBBY ||
      game.players.size < 1 ||
      game.gameMasterClientId !== requesterClientId
    ) {
      return null;
    }

    if (Array.from(game.players.values()).some((player) => !player.towerAssignment)) {
      return null;
    }

    for (const player of game.players.values()) {
      if (!player.towerAssignment || player.legions.length > 0) {
        continue;
      }
      this.createInitialLegion(game, player, player.towerAssignment);
      this.addLog(game, "TOWER_ASSIGNED", player.id, {
        towerTile: player.towerAssignment,
      });
    }

    game.phase = Phase.SPLIT;
    game.round = 1;
    game.activePlayer = Array.from(game.players.keys())[0] ?? null;
    game.lastUpdatedAt = Date.now();

    this.addLog(game, "GAME_STARTED", null, { players: String(game.players.size) });
    if (game.activePlayer) {
      this.addLog(game, "SETUP_COMPLETE", null, { activePlayer: game.activePlayer });
    }

    return game;
  }

  /**
   * Assigns a tower to a player and creates an initial legion.
   */
  assignTower(
    gameId: string,
    playerId: PlayerId,
    towerTile: TileId
  ): { game: GameState; legion: Legion } | null {
    const game = this.games.get(gameId);
    const player = game?.players.get(playerId);

    if (!game || !player || game.phase !== Phase.SETUP) {
      return null;
    }

    // Check if tower is already taken
    if (Array.from(game.players.values()).some((p) => p.towerAssignment === towerTile)) {
      return null;
    }

    // Assign tower
    player.towerAssignment = towerTile;

    const initialLegion = this.createInitialLegion(game, player, towerTile);

    game.lastUpdatedAt = Date.now();

    // Check if all players have assigned towers
    if (Array.from(game.players.values()).every((p) => p.towerAssignment)) {
      game.phase = Phase.SPLIT;
      game.activePlayer = Array.from(game.players.keys())[0];
      this.addLog(game, "TOWER_ASSIGNED", playerId, { towerTile, setupComplete: "true" });
      this.addLog(game, "SETUP_COMPLETE", null, { activePlayer: game.activePlayer });
    } else {
      this.addLog(game, "TOWER_ASSIGNED", playerId, { towerTile });
    }

    return { game, legion: initialLegion };
  }

  /**
   * Splits a legion into two legions.
   */
  splitLegion(
    gameId: string,
    legionId: LegionId,
    splitCreatures: CreatureDef[],
    newCreatures: CreatureDef[],
    targetTile: TileId
  ): { game: GameState; originalLegion: Legion; newLegion: Legion } | null {
    const game = this.games.get(gameId);
    if (!game || game.phase !== Phase.SPLIT) {
      return null;
    }

    if (splitCreatures.length < 1 || newCreatures.length < 1) {
      return null;
    }

    // Find the legion
    let originalLegion: Legion | null = null;
    let playerWithLegion: Player | null = null;

    for (const player of game.players.values()) {
      const legion = player.legions.find((l) => l.id === legionId);
      if (legion) {
        originalLegion = legion;
        playerWithLegion = player;
        break;
      }
    }

    if (!originalLegion || !playerWithLegion) {
      return null;
    }

    if (!game.activePlayer || playerWithLegion.id !== game.activePlayer) {
      return null;
    }

    // Create new legion
    const newLegionId = `${playerWithLegion.id}-${playerWithLegion.legions.length}` as LegionId;
    const newLegion: Legion = {
      id: newLegionId,
      playerId: playerWithLegion.id,
      tile: targetTile,
      creatures: newCreatures,
    };

    // Update original legion
    originalLegion.creatures = splitCreatures;

    // Add new legion to player
    playerWithLegion.legions.push(newLegion);

    // Update tiles
    const oldTile = game.tiles.get(originalLegion.tile);
    if (oldTile) {
      oldTile.legions = oldTile.legions.filter((l) => l.id !== legionId);
      oldTile.legions.push(originalLegion);
    }

    if (!game.tiles.has(targetTile)) {
      const tileState: TileState = {
        id: targetTile,
        terrainType: TERRAIN_MAP[targetTile] ?? TerrainType.PLAINS,
        legions: [newLegion],
      };
      game.tiles.set(targetTile, tileState);
    } else {
      game.tiles.get(targetTile)!.legions.push(newLegion);
    }

    game.lastUpdatedAt = Date.now();

    this.addLog(game, "LEGION_SPLIT", playerWithLegion.id, {
      originalLegionId: legionId,
      newLegionId: newLegion.id,
      targetTile,
    });

    return { game, originalLegion, newLegion };
  }

  /**
   * Recruits a creature to a legion during the RECRUIT phase.
   * Requirements:
   * 1. Legion must have MOVED this turn
    * 2. Legion must have fewer than 7 creatures
    * 3. Creature must be legal for terrain and prerequisite chain
   */
  recruitCreature(
    gameId: string,
    legionId: LegionId,
    creatureType: CreatureType
  ): { game: GameState; creature: CreatureDef } | null {
    const game = this.games.get(gameId);
    if (!game || game.phase !== Phase.RECRUIT) {
      return null;
    }

    // Find the legion and its player
    let legion: Legion | null = null;
    let player: Player | null = null;

    for (const p of game.players.values()) {
      const leg = p.legions.find((l) => l.id === legionId);
      if (leg) {
        legion = leg;
        player = p;
        break;
      }
    }

    if (!legion || !player) {
      return null;
    }

    if (!game.activePlayer || player.id !== game.activePlayer) {
      return null;
    }

    // REQUIREMENT 1: Legion must have moved this turn
    if (!game.movedLegionsThisTurn.includes(legionId)) {
      return null;
    }

    // Get the terrain of the tile where the legion is
    const tile = game.tiles.get(legion.tile);
    if (!tile) {
      return null;
    }

    // REQUIREMENT 2: Legion must have room to recruit.
    if (legion.creatures.length >= 7) {
      return null;
    }

    // REQUIREMENT 3: Creature must be legal by terrain + prerequisite chain.
    const eligibleRecruitments = getEligibleRecruitments(
      tile.terrainType,
      legion.creatures.map((c) => c.type),
      7
    );
    if (!eligibleRecruitments.includes(creatureType)) {
      return null;
    }

    // Create the creature with the player's color
    const creature = createCreatureDef(creatureType, player.color);

    // Add creature to the legion
    legion.creatures.push(creature);

    // Only one recruit per moved legion per turn.
    game.movedLegionsThisTurn = game.movedLegionsThisTurn.filter((id) => id !== legionId);

    game.lastUpdatedAt = Date.now();

    this.addLog(game, "CREATURE_RECRUITED", player.id, {
      legionId: legionId,
      creatureType: creatureType,
      tile: legion.tile,
    });

    return { game, creature };
  }

  /**
   * Moves a legion to an adjacent tile.
   */
  moveLegion(
    gameId: string,
    legionId: LegionId,
    sourceTile: TileId,
    targetTile: TileId
  ): GameState | null {
    const game = this.games.get(gameId);
    if (!game || game.phase !== Phase.MOVE || game.dieRoll === null) {
      return null;
    }

    // Find the legion
    const sourceTileState = game.tiles.get(sourceTile);
    const legion = sourceTileState?.legions.find((l) => l.id === legionId);

    if (!legion) {
      return null;
    }

    const movingPlayer = Array.from(game.players.values()).find((player) =>
      player.legions.some((candidate) => candidate.id === legionId)
    );
    if (!movingPlayer || !game.activePlayer || movingPlayer.id !== game.activePlayer) {
      return null;
    }

    if (legion.tile !== sourceTile) {
      return null;
    }

    if (game.movedLegionsThisTurn.includes(legion.id)) {
      return null;
    }

    const validDestinations = getValidDestinations(sourceTile, game.dieRoll);
    if (!validDestinations.includes(targetTile)) {
      return null;
    }

    // Destination must be a real board tile.
    if (!(targetTile in TERRAIN_MAP)) {
      return null;
    }

    // Destination must not already contain any stack.
    const targetTileState = game.tiles.get(targetTile);
    if (targetTileState && targetTileState.legions.length > 0) {
      return null;
    }

    // Remove from source tile
    if (sourceTileState) {
      sourceTileState.legions = sourceTileState.legions.filter((l) => l.id !== legionId);
    }

    // Update legion's tile
    legion.tile = targetTile;

    // Add to target tile
    if (!game.tiles.has(targetTile)) {
      const tileState: TileState = {
        id: targetTile,
        terrainType: TERRAIN_MAP[targetTile],
        legions: [legion],
      };
      game.tiles.set(targetTile, tileState);
    } else {
      game.tiles.get(targetTile)!.legions.push(legion);
    }

    game.lastUpdatedAt = Date.now();
    game.movedLegionsThisTurn.push(legion.id);

    // Find player for log
    this.addLog(game, "LEGION_MOVED", movingPlayer?.id ?? null, { legionId, sourceTile, targetTile });

    return game;
  }

  resolveBattle(
    gameId: string,
    playerId: PlayerId,
    battleTileId: TileId,
    defenderLegionId: LegionId,
    attackerLegionId: LegionId,
    defenderSurvivors: CreatureDef[],
    attackerSurvivors: CreatureDef[]
  ): {
    game: GameState;
    winnerPlayerId: PlayerId | null;
    tie: boolean;
    titanKilledPlayerIds: PlayerId[];
    pointsAwarded: number;
    gameWonByPlayerId: PlayerId | null;
  } | null {
    const game = this.games.get(gameId);
    if (!game || game.phase !== Phase.FIGHT) {
      return null;
    }
    if (!game.activePlayer || game.activePlayer !== playerId) {
      return null;
    }

    const tile = game.tiles.get(battleTileId);
    if (!tile) {
      return null;
    }

    const defenderLegion = tile.legions.find((l) => l.id === defenderLegionId);
    const attackerLegion = tile.legions.find((l) => l.id === attackerLegionId);
    if (!defenderLegion || !attackerLegion) {
      return null;
    }
    if (defenderLegion.playerId === attackerLegion.playerId) {
      return null;
    }

    const defenderPlayer = game.players.get(defenderLegion.playerId);
    const attackerPlayer = game.players.get(attackerLegion.playerId);
    if (!defenderPlayer || !attackerPlayer) {
      return null;
    }

    const beforeDefenderCreatures = [...defenderLegion.creatures];
    const beforeAttackerCreatures = [...attackerLegion.creatures];
    defenderLegion.creatures = [...defenderSurvivors];
    attackerLegion.creatures = [...attackerSurvivors];

    const defenderCount = defenderLegion.creatures.length;
    const attackerCount = attackerLegion.creatures.length;
    const defenderHasUnits = defenderCount > 0;
    const attackerHasUnits = attackerCount > 0;

    let winnerPlayerId: PlayerId | null = null;
    let loserPlayerId: PlayerId | null = null;
    let tie = false;

    if (defenderHasUnits && !attackerHasUnits) {
      winnerPlayerId = defenderPlayer.id;
      loserPlayerId = attackerPlayer.id;
    } else if (!defenderHasUnits && attackerHasUnits) {
      winnerPlayerId = attackerPlayer.id;
      loserPlayerId = defenderPlayer.id;
    } else if (!defenderHasUnits && !attackerHasUnits) {
      tie = true;
    } else {
      // Battle should only resolve once one side has no units left on the battlefield.
      return null;
    }

    const hadDefenderTitan = beforeDefenderCreatures.some((c) => c.type === CreatureType.TITAN);
    const hadAttackerTitan = beforeAttackerCreatures.some((c) => c.type === CreatureType.TITAN);
    const hasDefenderTitanNow = defenderLegion.creatures.some((c) => c.type === CreatureType.TITAN);
    const hasAttackerTitanNow = attackerLegion.creatures.some((c) => c.type === CreatureType.TITAN);

    const titanKilledPlayerIds: PlayerId[] = [];
    if (hadDefenderTitan && !hasDefenderTitanNow) {
      titanKilledPlayerIds.push(defenderPlayer.id);
    }
    if (hadAttackerTitan && !hasAttackerTitanNow) {
      titanKilledPlayerIds.push(attackerPlayer.id);
    }

    const removeLegionFromGame = (player: Player, legionId: LegionId) => {
      player.legions = player.legions.filter((l) => l.id !== legionId);
      for (const t of game.tiles.values()) {
        t.legions = t.legions.filter((l) => l.id !== legionId);
      }
    };

    if (tie) {
      removeLegionFromGame(defenderPlayer, defenderLegion.id);
      removeLegionFromGame(attackerPlayer, attackerLegion.id);
    } else if (winnerPlayerId && loserPlayerId) {
      if (loserPlayerId === defenderPlayer.id) {
        removeLegionFromGame(defenderPlayer, defenderLegion.id);
      } else {
        removeLegionFromGame(attackerPlayer, attackerLegion.id);
      }
    }

    let pointsAwarded = 0;

    for (const killedPlayerId of titanKilledPlayerIds) {
      const killedPlayer = game.players.get(killedPlayerId);
      if (!killedPlayer) continue;
      killedPlayer.status = "ELIMINATED";
      const killedLegionIds = killedPlayer.legions.map((l) => l.id);
      killedPlayer.legions = [];
      for (const t of game.tiles.values()) {
        t.legions = t.legions.filter((l) => !killedLegionIds.includes(l.id));
      }
      this.addLog(game, "PLAYER_ELIMINATED", killedPlayerId, { reason: "TITAN_KILLED" });
    }

    const activePlayers = Array.from(game.players.values()).filter((p) => p.status === "ACTIVE");
    const gameWonByPlayerId = activePlayers.length === 1 ? activePlayers[0].id : null;
    if (gameWonByPlayerId) {
      this.addLog(game, "GAME_WON", gameWonByPlayerId, { reason: "LAST_ACTIVE_PLAYER" });
    }

    if (!tie && winnerPlayerId && loserPlayerId) {
      const loserBefore = loserPlayerId === defenderPlayer.id ? beforeDefenderCreatures : beforeAttackerCreatures;
      const winner = game.players.get(winnerPlayerId);

      if (titanKilledPlayerIds.length === 0) {
        pointsAwarded = loserBefore.reduce((sum, c) => sum + (c.power * c.skill), 0);
      } else if (!gameWonByPlayerId && titanKilledPlayerIds.includes(loserPlayerId)) {
        const deadTitan = loserBefore.find((c) => c.type === CreatureType.TITAN);
        if (deadTitan) {
          // Titan kill bounty while the game continues: Titan power at death * skill(4).
          pointsAwarded = deadTitan.power * 4;
        }
      }

      if (winner && pointsAwarded > 0) {
        winner.score += pointsAwarded;
      }
    }

    game.phase = Phase.RECRUIT;
    game.lastUpdatedAt = Date.now();

    this.addLog(game, "BATTLE_RESOLVED", winnerPlayerId, {
      battleTileId,
      tie: tie ? "true" : "false",
      winnerPlayerId: winnerPlayerId ?? "",
      pointsAwarded: String(pointsAwarded),
      titanKills: titanKilledPlayerIds.join(","),
    });

    return {
      game,
      winnerPlayerId,
      tie,
      titanKilledPlayerIds,
      pointsAwarded,
      gameWonByPlayerId,
    };
  }

  /**
   * Ends a player's current phase.
   * Turn order is per-player: SPLIT -> MOVE -> FIGHT -> RECRUIT, then next player starts at SPLIT.
   */
  endPhase(gameId: string, playerId: PlayerId): GameState | null {
    const game = this.games.get(gameId);
    if (!game) {
      return null;
    }

    if (!game.activePlayer || game.activePlayer !== playerId) {
      return null;
    }

    const playerIds = Array.from(game.players.keys());
    if (playerIds.length === 0) {
      return null;
    }
    const currentIndex = playerIds.indexOf(playerId);
    const nextIndex = (currentIndex + 1) % playerIds.length;
    const endingPhase = game.phase;

    // MOVE phase die state resets when MOVE ends.
    if (endingPhase === Phase.MOVE) {
      game.dieRoll = null;
    }

    // Recruitment eligibility state resets after RECRUIT.
    if (endingPhase === Phase.RECRUIT) {
      game.movedLegionsThisTurn = [];
    }

    if (endingPhase === Phase.SPLIT) {
      game.phase = Phase.MOVE;
      game.activePlayer = playerId;
    } else if (endingPhase === Phase.MOVE) {
      game.phase = Phase.FIGHT;
      game.activePlayer = playerId;
    } else if (endingPhase === Phase.FIGHT) {
      game.phase = Phase.RECRUIT;
      game.activePlayer = playerId;
    } else if (endingPhase === Phase.RECRUIT) {
      game.phase = Phase.SPLIT;
      game.activePlayer = playerIds[nextIndex];
      if (nextIndex === 0) {
        game.round += 1;
      }
    }

    game.lastUpdatedAt = Date.now();

    this.addLog(game, "PHASE_ENDED", playerId, {
      phase: game.phase,
      nextActivePlayer: game.activePlayer,
    });

    return game;
  }

  /**
   * Rolls a die for the current move. Only valid during MOVE phase.
   */
  rollForMove(gameId: string, playerId: PlayerId): GameState | null {
    const game = this.games.get(gameId);
    if (!game || game.phase !== Phase.MOVE) {
      return null;
    }

    if (!game.activePlayer || game.activePlayer !== playerId) {
      return null;
    }

    if (game.dieRoll !== null) {
      return null;
    }

    // Roll 1-6
    game.dieRoll = Math.floor(Math.random() * 6) + 1;
    game.movedLegionsThisTurn = [];
    game.lastUpdatedAt = Date.now();

    this.addLog(game, "PHASE_ENDED", playerId, {
      phase: game.phase,
      dieRoll: String(game.dieRoll),
    });

    return game;
  }

  /**
   * Rerolls the die for mulligan (one per player per game).
   */
  rerollDice(gameId: string, playerId: PlayerId): GameState | null {
    const game = this.games.get(gameId);
    if (!game || game.phase !== Phase.MOVE) {
      return null;
    }

    if (!game.activePlayer || game.activePlayer !== playerId) {
      return null;
    }

    // Check if player already used mulligan
    if (game.mulligansUsed.includes(playerId)) {
      return null;
    }

    // Mark mulligan as used and roll new die
    game.mulligansUsed.push(playerId);
    game.dieRoll = Math.floor(Math.random() * 6) + 1;
    game.lastUpdatedAt = Date.now();

    this.addLog(game, "PHASE_ENDED", playerId, {
      phase: game.phase,
      dieRoll: String(game.dieRoll),
      mulligan: "used",
    });

    return game;
  }

  /**
   * Serializes the game state to a JSON-safe format (Maps → Objects).
   */
  serializeGame(game: GameState): any {
    return {
      id: game.id,
      phase: game.phase,
      round: game.round,
      activePlayer: game.activePlayer,
      dieRoll: game.dieRoll,
      mulligansUsed: game.mulligansUsed,
      movedLegionsThisTurn: game.movedLegionsThisTurn,
      players: Array.from(game.players.values()),
      tiles: Array.from(game.tiles.values()),
      log: game.log,
      createdAt: game.createdAt,
      lastUpdatedAt: game.lastUpdatedAt,
    };
  }
}
