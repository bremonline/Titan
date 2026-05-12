import { z } from "zod";

// ============================================================================
// DOMAIN TYPES
// ============================================================================

export type TileId = string; // e.g., "100", "313", "421"
export type PlayerId = string; // UUID or alphanumeric
export type LegionId = string; // UUID or `${playerId}-${number}`

export enum CreatureType {
  // LORDS
  TITAN = "TITAN",
  ANGEL = "ANGEL",
  ARCHANGEL = "ARCHANGEL",
  // DEMI-LORDS
  GUARDIAN = "GUARDIAN",
  WARLOCK = "WARLOCK",
  // CREATURES
  BEHEMOTH = "BEHEMOTH",
  CENTAUR = "CENTAUR",
  COLOSSUS = "COLOSSUS",
  CYCLOPS = "CYCLOPS",
  DRAGON = "DRAGON",
  GARGOYLE = "GARGOYLE",
  GIANT = "GIANT",
  GORGON = "GORGON",
  GRIFFON = "GRIFFON",
  HYDRA = "HYDRA",
  LION = "LION",
  MINOTAUR = "MINOTAUR",
  OGRE = "OGRE",
  RANGER = "RANGER",
  SERPENT = "SERPENT",
  TROLL = "TROLL",
  UNICORN = "UNICORN",
  WARBEAR = "WARBEAR",
  WYVERN = "WYVERN",
}

export enum Phase {
  LOBBY = "LOBBY",
  SETUP = "SETUP",
  SPLIT = "SPLIT",
  RECRUIT = "RECRUIT",
  MOVE = "MOVE",
  FIGHT = "FIGHT",
  MUSTER = "MUSTER",
}

export enum TerrainType {
  TUNDRA = "TUNDRA",
  MOUNTAINS = "MOUNTAINS",
  WOODS = "WOODS",
  DESERT = "DESERT",
  MARSH = "MARSH",
  HILLS = "HILLS",
  SWAMP = "SWAMP",
  PLAINS = "PLAINS",
  BRUSH = "BRUSH",
  JUNGLE = "JUNGLE",
  TOWER = "TOWER",
}

export const AI_PLAY_STYLES = ["Normal", "Turtle", "Agressive", "HIghland", "Lowland"] as const;
export type AiPlayStyle = typeof AI_PLAY_STYLES[number];

// ============================================================================
// CREATURE & LEGION TYPES
// ============================================================================

export interface CreatureDef {
  type: CreatureType;
  power: number;
  skill: number;
  color: string;
}

export interface Legion {
  id: LegionId;
  playerId: PlayerId;
  tile: TileId;
  creatures: CreatureDef[];
}

export interface Player {
  id: PlayerId;
  name: string;
  color: string;
  towerAssignment: TileId | null; // "100" | "200" | "300" | "400" | "500" | "600"
  aiPlayStyle?: AiPlayStyle;
  legions: Legion[];
  score: number;
  status: "ACTIVE" | "ELIMINATED";
}

// ============================================================================
// GAME STATE
// ============================================================================

export type LogAction =
  | "GAME_CREATED"
  | "PLAYER_JOINED"
  | "GAME_STARTED"
  | "TOWER_ASSIGNED"
  | "SETUP_COMPLETE"
  | "LEGION_SPLIT"
  | "LEGION_MOVED"
  | "CREATURE_RECRUITED"
  | "BATTLE_RESOLVED"
  | "PLAYER_ELIMINATED"
  | "GAME_WON"
  | "PHASE_ENDED";

export interface LogEntry {
  timestamp: number;
  action: LogAction;
  playerId: PlayerId | null;
  details: Record<string, string>;
}

export interface GameState {
  id: string;
  gameMasterClientId: string;
  phase: Phase;
  round: number;
  activePlayer: PlayerId | null;
  dieRoll: number | null;
  mulligansUsed: PlayerId[]; // Players who have used their mulligan
  movedLegionsThisTurn: LegionId[];
  players: Map<PlayerId, Player>;
  tiles: Map<TileId, TileState>;
  log: LogEntry[];
  createdAt: number;
  lastUpdatedAt: number;
}

export interface TileState {
  id: TileId;
  terrainType: TerrainType;
  legions: Legion[];
}

// ============================================================================
// SOCKET.IO EVENTS - CLIENT → SERVER
// ============================================================================

export namespace ClientEvents {
  // === LOBBY PHASE ===
  export interface CreateGameRequest {
    gameId: string;
    gameKey: string;
  }

  export interface JoinGameRequest {
    gameId: string;
    gameKey: string;
    playerName?: string;
    playerColor?: string;
  }

  export interface RejoinGameRequest {
    gameId: string;
    gameKey: string;
    transferToken?: string;
  }

  export interface CreateReconnectTokenRequest {
    gameId: string;
    gameKey: string;
  }

  export interface AddPlayerRequest {
    gameId: string;
    playerName: string;
    playerColor: string;
    towerTile: TileId;
  }

  export interface AddAiPlayerRequest {
    gameId: string;
    playerName: string;
    playerColor: string;
    towerTile: TileId;
    aiPlayStyle: AiPlayStyle;
  }

  export interface StartGameRequest {
    gameId: string;
  }

  // === SETUP PHASE ===
  export interface AssignTowerRequest {
    gameId: string;
    playerId: PlayerId;
    towerTile: TileId; // "100" | "200" | "300" | "400" | "500" | "600"
  }

  // === SPLIT PHASE ===
  export interface SplitLegionRequest {
    gameId: string;
    legionId: LegionId;
    splitCreatures: CreatureDef[]; // Creatures staying with original legion
    newCreatures: CreatureDef[]; // Creatures moving to new legion
    targetTile: TileId; // Adjacent hex where new legion goes
  }

  export interface RecruitCreatureRequest {
    gameId: string;
    legionId: LegionId;
    creatureType: CreatureType;
  }

  export interface MoveLegionRequest {
    gameId: string;
    legionId: LegionId;
    sourceTile: TileId;
    targetTile: TileId;
  }

  export interface RollForMoveRequest {
    gameId: string;
    playerId: PlayerId;
  }

  export interface EndPhaseRequest {
    gameId: string;
    playerId: PlayerId;
  }

  export interface ResolveBattleRequest {
    gameId: string;
    playerId: PlayerId;
    battleTileId: TileId;
    defenderLegionId: LegionId;
    attackerLegionId: LegionId;
    defenderSurvivors: CreatureDef[];
    attackerSurvivors: CreatureDef[];
  }
}

// ============================================================================
// SOCKET.IO EVENTS - SERVER → CLIENT
// ============================================================================

export namespace ServerEvents {
  export interface ActiveGameSummary {
    gameId: string;
    phase: Phase;
    players: number;
    playerList: Array<{ name: string; color: string }>;
    createdAt: number;
  }

  // === LOBBY PHASE ===
  export interface GameCreated {
    gameId: string;
    clientId: string;
    isGameMaster: boolean;
    createdAt: number;
  }

  export interface PlayerJoined {
    gameId: string;
    clientId: string;
    isGameMaster: boolean;
  }

  export interface ReconnectTokenCreated {
    gameId: string;
    transferToken: string;
    expiresAt: number;
  }

  export interface PlayerAdded {
    gameId: string;
    player: Player;
    totalPlayers: number;
  }

  export interface GameStarted {
    gameId: string;
    phase: Phase.SPLIT;
    round: 1;
    players: Player[];
    availableTowers: TileId[];
  }

  // === SETUP PHASE ===
  export interface TowerAssigned {
    gameId: string;
    playerId: PlayerId;
    towerTile: TileId;
    legion: Legion;
  }

  export interface SetupComplete {
    gameId: string;
    phase: Phase.SPLIT;
    round: 1;
    activePlayer: PlayerId;
  }

  // === SPLIT PHASE ===
  export interface LegionSplit {
    gameId: string;
    originalLegion: Legion;
    newLegion: Legion;
  }

  export interface CreatureRecruited {
    gameId: string;
    legionId: LegionId;
    creature: CreatureDef;
  }

  export interface LegionMoved {
    gameId: string;
    legionId: LegionId;
    sourceTile: TileId;
    targetTile: TileId;
  }

  export interface PhaseEnded {
    gameId: string;
    currentPhase: Phase;
    nextPhase: Phase;
    activePlayer: PlayerId | null;
  }

  export interface BattleResolved {
    gameId: string;
    winnerPlayerId: PlayerId | null;
    tie: boolean;
    titanKilledPlayerIds: PlayerId[];
    pointsAwarded: number;
    gameWonByPlayerId: PlayerId | null;
    nextPhase: Phase;
    activePlayer: PlayerId | null;
  }

  // === ERROR HANDLING ===
  export interface ErrorOccurred {
    message: string;
    code: string;
    gameId?: string;
  }

  export interface GameStateSnapshot {
    gameId: string;
    state: GameState;
  }
}

// ============================================================================
// SOCKET.IO EVENT DEFINITIONS
// ============================================================================

export const SOCKET_EVENTS = {
  // Listener registration (server setup)
  CONNECT: "connect",
  DISCONNECT: "disconnect",

  // Client events (emit to server)
  CLIENT: {
    CREATE_GAME: "client:create-game",
    JOIN_GAME: "client:join-game",
    REJOIN_GAME: "client:rejoin-game",
    CREATE_RECONNECT_TOKEN: "client:create-reconnect-token",
    ADD_PLAYER: "client:add-player",
    ADD_AI_PLAYER: "client:add-ai-player",
    START_GAME: "client:start-game",
    ASSIGN_TOWER: "client:assign-tower",
    SPLIT_LEGION: "client:split-legion",
    RECRUIT_CREATURE: "client:recruit-creature",
    MOVE_LEGION: "client:move-legion",
    ROLL_FOR_MOVE: "client:roll-for-move",
    REROLL_DICE: "client:reroll-dice",
    END_PHASE: "client:end-phase",
    RESOLVE_BATTLE: "client:resolve-battle",
  },

  // Server events (emit to clients)
  SERVER: {
    GAME_CREATED: "server:game-created",
    PLAYER_JOINED: "server:player-joined",
    PLAYER_ADDED: "server:player-added",
    GAME_STARTED: "server:game-started",
    TOWER_ASSIGNED: "server:tower-assigned",
    SETUP_COMPLETE: "server:setup-complete",
    LEGION_SPLIT: "server:legion-split",
    CREATURE_RECRUITED: "server:creature-recruited",
    LEGION_MOVED: "server:legion-moved",
    PHASE_ENDED: "server:phase-ended",
    BATTLE_RESOLVED: "server:battle-resolved",
    ERROR: "server:error",
    STATE_SNAPSHOT: "server:state-snapshot",
    LOG_ENTRY: "server:log-entry",
  },
} as const;

// ============================================================================
// VALIDATION SCHEMAS (Zod)
// ============================================================================

export const CreatureDefSchema = z.object({
  type: z.nativeEnum(CreatureType),
  // Titan creature powers can exceed 6 (e.g. Serpent 18), so validation must match game data.
  power: z.number().int().min(1).max(20),
  skill: z.number().int().min(1).max(20),
  color: z.string().regex(/^#[0-9A-F]{6}$/i),
});

export const LegionSchema = z.object({
  id: z.string(),
  playerId: z.string(),
  tile: z.string(),
  creatures: z.array(CreatureDefSchema),
});

export const PlayerSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9A-F]{6}$/i),
  towerAssignment: z.string().nullable(),
  aiPlayStyle: z.enum(AI_PLAY_STYLES).optional(),
  legions: z.array(LegionSchema),
  score: z.number().int().min(0),
  status: z.enum(["ACTIVE", "ELIMINATED"]),
});

export const SplitLegionRequestSchema = z.object({
  gameId: z.string(),
  legionId: z.string(),
  splitCreatures: z.array(CreatureDefSchema).min(1),
  newCreatures: z.array(CreatureDefSchema).min(1),
  targetTile: z.string(),
});

export const RecruitCreatureRequestSchema = z.object({
  gameId: z.string(),
  legionId: z.string(),
  creatureType: z.nativeEnum(CreatureType),
});

export const AssignTowerRequestSchema = z.object({
  gameId: z.string(),
  playerId: z.string(),
  towerTile: z.enum(["100", "200", "300", "400", "500", "600"]),
});

export const MoveLegionRequestSchema = z.object({
  gameId: z.string(),
  legionId: z.string(),
  sourceTile: z.string(),
  targetTile: z.string(),
});

export const RollForMoveRequestSchema = z.object({
  gameId: z.string(),
  playerId: z.string(),
});

export const RerollDiceRequestSchema = z.object({
  gameId: z.string(),
  playerId: z.string(),
});

export const EndPhaseRequestSchema = z.object({
  gameId: z.string(),
  playerId: z.string(),
});

export const ResolveBattleRequestSchema = z.object({
  gameId: z.string(),
  playerId: z.string(),
  battleTileId: z.string(),
  defenderLegionId: z.string(),
  attackerLegionId: z.string(),
  defenderSurvivors: z.array(CreatureDefSchema),
  attackerSurvivors: z.array(CreatureDefSchema),
});

export const CreateGameRequestSchema = z.object({
  gameId: z.string().min(3).max(32).regex(/^[A-Za-z0-9_ -]+$/),
  gameKey: z.string().min(3).max(64),
});

export const JoinGameRequestSchema = z.object({
  gameId: z.string(),
  gameKey: z.string().min(3).max(64),
  playerName: z.string().min(1).max(50).optional(),
  playerColor: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
});

export const RejoinGameRequestSchema = z.object({
  gameId: z.string(),
  gameKey: z.string().min(3).max(64),
  transferToken: z.string().uuid().optional(),
});

export const CreateReconnectTokenRequestSchema = z.object({
  gameId: z.string(),
  gameKey: z.string().min(3).max(64),
});

export const AddPlayerRequestSchema = z.object({
  gameId: z.string(),
  playerName: z.string().min(1).max(50),
  playerColor: z.string().regex(/^#[0-9A-F]{6}$/i),
  towerTile: z.enum(["100", "200", "300", "400", "500", "600"]),
});

export const AddAiPlayerRequestSchema = z.object({
  gameId: z.string(),
  playerName: z.string().min(1).max(50),
  playerColor: z.string().regex(/^#[0-9A-F]{6}$/i),
  towerTile: z.enum(["100", "200", "300", "400", "500", "600"]),
  aiPlayStyle: z.enum(AI_PLAY_STYLES),
});

export const StartGameRequestSchema = z.object({
  gameId: z.string(),
});
