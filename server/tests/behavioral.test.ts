import { describe, it, expect, beforeEach } from "vitest";
import { GameEngine } from "../src/game/engine.js";
import { Phase, CreatureType, TerrainType, PlayerId, TileId } from "../src/types.js";
import { getValidDestinations } from "../src/game/movementRules.js";
import { getEligibleRecruitments } from "../src/game/recruitmentRules.js";

// ============================================================================
// TEST LOGGING UTILITIES
// ============================================================================

type LogLevel = "VERBOSE" | "SILENT";

interface TestLogger {
  verbose: boolean;
  log: (message: string) => void;
  logPhase: (phaseName: string, details: string) => void;
  logResult: (passed: boolean, message: string) => void;
}

function createLogger(verbose: LogLevel = "VERBOSE"): TestLogger {
  const isVerbose = verbose === "VERBOSE";

  return {
    verbose: isVerbose,
    log: (message: string) => {
      if (isVerbose) {
        console.log(message);
      }
    },
    logPhase: (phaseName: string, details: string) => {
      if (isVerbose) {
        console.log(`  📍 ${phaseName}: ${details}`);
      }
    },
    logResult: (passed: boolean, message: string) => {
      const icon = passed ? "✅" : "❌";
      console.log(`${icon} ${message}`);
    },
  };
}

describe("Behavioral Tests", () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = new GameEngine();
  });

  describe("Lobby", () => {
    it("BHV-001: creates a game with valid game master credentials", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-001-create-game";
      const key = "test-key";
      const gameMasterClientId = "master-client";

      logger.logPhase(
        "LOBBY",
        `Creating game '${gameId}' with game master client '${gameMasterClientId}'`
      );

      const created = engine.createGame(gameId, key, gameMasterClientId);

      expect(created).not.toBeNull();
      expect(created?.gameId).toBe(gameId);

      const game = engine.getGame(gameId);
      expect(game).not.toBeNull();
      expect(game?.phase).toBe(Phase.LOBBY);
      expect(game?.gameMasterClientId).toBe(gameMasterClientId);
      expect(game?.players.size).toBe(0);

      logger.logResult(true, "BHV-001: Create game succeeded and game initialized in LOBBY");
    });

    it("BHV-002: fails to create a game when game id already exists", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-002-duplicate-game";

      const firstCreate = engine.createGame(gameId, "key-1", "master-1");
      expect(firstCreate).not.toBeNull();

      logger.logPhase("LOBBY", `Attempting duplicate create for game '${gameId}'`);

      const duplicateCreate = engine.createGame(gameId, "key-2", "master-2");
      expect(duplicateCreate).toBeNull();

      const game = engine.getGame(gameId);
      expect(game).not.toBeNull();
      expect(game?.gameMasterClientId).toBe("master-1");

      logger.logResult(true, "BHV-002: Duplicate game create was rejected");
    });

    it("BHV-003: joins game with valid key and unique identity", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-003-join-valid";
      const key = "join-key";

      engine.createGame(gameId, key, "master");

      logger.logPhase("LOBBY", `Client 'client-1' joining game '${gameId}' with valid key`);
      const joined = engine.joinGame(gameId, key, "client-1");
      expect(joined).not.toBeNull();
      expect(joined?.isGameMaster).toBe(false);

      const added = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100");
      expect(added).not.toBeNull();
      expect(added?.player.name).toBe("Player 1");

      const game = engine.getGame(gameId)!;
      expect(game.players.size).toBe(1);

      logger.logResult(true, "BHV-003: Join + player registration succeeded");
    });

    it("BHV-004: fails to join game with wrong key", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-004-join-wrong-key";

      engine.createGame(gameId, "correct-key", "master");

      logger.logPhase("LOBBY", `Client 'client-1' attempting join with invalid key`);
      const joined = engine.joinGame(gameId, "wrong-key", "client-1");
      expect(joined).toBeNull();

      const game = engine.getGame(gameId)!;
      expect(game.players.size).toBe(0);

      logger.logResult(true, "BHV-004: Invalid key join was rejected");
    });

    it("BHV-005: rejects duplicate identity constraints on add player", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-005-duplicate-identity";
      const key = "key";

      engine.createGame(gameId, key, "master");

      const firstJoin = engine.joinGame(gameId, key, "client-1");
      expect(firstJoin).not.toBeNull();
      const firstPlayer = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100");
      expect(firstPlayer).not.toBeNull();

      const secondJoin = engine.joinGame(gameId, key, "client-2");
      expect(secondJoin).not.toBeNull();

      logger.logPhase("LOBBY", "Attempting second player add with duplicate color '#FF0000'");
      const duplicateColor = engine.addPlayer(gameId, "client-2", "Player 2", "#FF0000", "200");
      expect(duplicateColor).toBeNull();

      logger.logPhase("LOBBY", "Attempting second player add with duplicate tower '100'");
      const duplicateTower = engine.addPlayer(gameId, "client-2", "Player 2", "#00FF00", "100");
      expect(duplicateTower).toBeNull();

      const game = engine.getGame(gameId)!;
      expect(game.players.size).toBe(1);

      logger.logResult(true, "BHV-005: Duplicate color and tower constraints were enforced");
    });

    it("BHV-006: starts game when requested by game master from lobby", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-006-start-by-master";
      const key = "key";

      engine.createGame(gameId, key, "master");
      engine.joinGame(gameId, key, "client-1");
      const added = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100");
      expect(added).not.toBeNull();

      logger.logPhase("LOBBY", "Game master attempting start from LOBBY");
      const started = engine.startGame(gameId, "master");
      expect(started).not.toBeNull();
      expect(started?.phase).toBe(Phase.SPLIT);
      expect(started?.activePlayer).toBeTruthy();

      logger.logResult(true, "BHV-006: Game master start transitioned game to SPLIT");
    });

    it("BHV-007: fails to start game when requested by non-game-master", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-007-start-non-master";
      const key = "key";

      engine.createGame(gameId, key, "master");
      engine.joinGame(gameId, key, "client-1");
      const added = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100");
      expect(added).not.toBeNull();

      logger.logPhase("LOBBY", "Non-master attempting start from LOBBY");
      const started = engine.startGame(gameId, "client-1");
      expect(started).toBeNull();

      const game = engine.getGame(gameId)!;
      expect(game.phase).toBe(Phase.LOBBY);

      logger.logResult(true, "BHV-007: Non-game-master start was rejected");
    });

    it("BHV-008: fails to start game when no players have joined", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-008-start-no-players";

      engine.createGame(gameId, "key", "master");

      logger.logPhase("LOBBY", "Game master attempting start without any players");
      const started = engine.startGame(gameId, "master");
      expect(started).toBeNull();

      const game = engine.getGame(gameId)!;
      expect(game.phase).toBe(Phase.LOBBY);
      expect(game.players.size).toBe(0);

      logger.logResult(true, "BHV-008: Start was rejected because player count is below minimum");
    });
  });

  describe("Setup", () => {
    it("BHV-009: assigns tower successfully for setup player", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-009-setup-assign";

      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      engine.joinGame(gameId, "key", "client-2");

      const p1 = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;
      const p2 = engine.addPlayer(gameId, "client-2", "Player 2", "#00FF00", "200")!;

      const game = engine.getGame(gameId)!;
      game.phase = Phase.SETUP;
      game.players.get(p1.player.id)!.towerAssignment = null;
      game.players.get(p2.player.id)!.towerAssignment = null;
      game.players.get(p1.player.id)!.legions = [];
      game.players.get(p2.player.id)!.legions = [];

      logger.logPhase("SETUP", "Assigning tower 100 to Player 1");
      const result = engine.assignTower(gameId, p1.player.id, "100");

      expect(result).not.toBeNull();
      expect(result?.game.players.get(p1.player.id)?.towerAssignment).toBe("100");

      logger.logResult(true, "BHV-009: Tower assignment succeeded for setup player");
    });

    it("BHV-010: fails tower assignment when tower already claimed", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-010-setup-duplicate";

      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      engine.joinGame(gameId, "key", "client-2");

      const p1 = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;
      const p2 = engine.addPlayer(gameId, "client-2", "Player 2", "#00FF00", "200")!;

      const game = engine.getGame(gameId)!;
      game.phase = Phase.SETUP;
      game.players.get(p1.player.id)!.towerAssignment = "100";
      game.players.get(p2.player.id)!.towerAssignment = null;
      game.players.get(p1.player.id)!.legions = [];
      game.players.get(p2.player.id)!.legions = [];

      logger.logPhase("SETUP", "Player 2 attempting to claim already used tower 100");
      const result = engine.assignTower(gameId, p2.player.id, "100");

      expect(result).toBeNull();
      expect(game.players.get(p2.player.id)?.towerAssignment).toBeNull();

      logger.logResult(true, "BHV-010: Duplicate tower assignment was rejected");
    });

    it("BHV-011: fails tower assignment for invalid tower tile", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-011-setup-invalid-tower";

      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      const p1 = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;

      const game = engine.getGame(gameId)!;
      game.phase = Phase.SETUP;
      game.players.get(p1.player.id)!.towerAssignment = null;
      game.players.get(p1.player.id)!.legions = [];

      logger.logPhase("SETUP", "Player 1 attempting to claim invalid tower 999");
      const result = engine.assignTower(gameId, p1.player.id, "999");

      expect(result).toBeNull();
      expect(game.players.get(p1.player.id)?.towerAssignment).toBeNull();

      logger.logResult(true, "BHV-011: Invalid tower assignment was rejected");
    });

    it("BHV-012: completes setup and transitions to SPLIT when all towers assigned", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-012-setup-complete";

      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      engine.joinGame(gameId, "key", "client-2");

      const p1 = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;
      const p2 = engine.addPlayer(gameId, "client-2", "Player 2", "#00FF00", "200")!;

      const game = engine.getGame(gameId)!;
      game.phase = Phase.SETUP;
      game.players.get(p1.player.id)!.towerAssignment = null;
      game.players.get(p2.player.id)!.towerAssignment = null;
      game.players.get(p1.player.id)!.legions = [];
      game.players.get(p2.player.id)!.legions = [];

      const firstAssign = engine.assignTower(gameId, p1.player.id, "100");
      expect(firstAssign).not.toBeNull();
      expect(firstAssign?.game.phase).toBe(Phase.SETUP);

      logger.logPhase("SETUP", "Final player assigning tower to complete setup");
      const secondAssign = engine.assignTower(gameId, p2.player.id, "200");

      expect(secondAssign).not.toBeNull();
      expect(secondAssign?.game.phase).toBe(Phase.SPLIT);
      expect(secondAssign?.game.activePlayer).toBeTruthy();

      logger.logResult(true, "BHV-012: Setup completion transitioned game to SPLIT");
    });
  });

  describe("Split", () => {
    it("BHV-013: splits legion successfully with legal split", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-013-split-legal";

      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      const added = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;

      const started = engine.startGame(gameId, "master");
      expect(started?.phase).toBe(Phase.SPLIT);

      const legion = started!.players.get(added.player.id)!.legions[0];
      expect(legion.creatures.length).toBe(8);

      logger.logPhase("SPLIT", "Splitting 8-creature legion into two legal 4-creature legions");
      const result = engine.splitLegion(
        gameId,
        legion.id,
        legion.creatures.slice(0, 4),
        legion.creatures.slice(4, 8),
        legion.tile
      );

      expect(result).not.toBeNull();
      expect(result?.originalLegion.creatures.length).toBe(4);
      expect(result?.newLegion.creatures.length).toBe(4);

      logger.logResult(true, "BHV-013: Legal split created valid original and new legions");
    });

    it("BHV-014: fails split when resulting stack size is illegal", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-014-split-illegal-size";

      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      const added = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;
      const started = engine.startGame(gameId, "master")!;

      const legion = started.players.get(added.player.id)!.legions[0];

      logger.logPhase("SPLIT", "Attempting split with empty new stack (illegal size)");
      const result = engine.splitLegion(gameId, legion.id, legion.creatures, [], legion.tile);

      expect(result).toBeNull();

      const game = engine.getGame(gameId)!;
      const unchangedLegion = game.players.get(added.player.id)!.legions.find((l) => l.id === legion.id)!;
      expect(unchangedLegion.creatures.length).toBe(8);

      logger.logResult(true, "BHV-014: Illegal split size was rejected");
    });

    it("BHV-015: fails split when actor is not active player", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-015-split-non-active";

      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      engine.joinGame(gameId, "key", "client-2");

      const p1 = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;
      const p2 = engine.addPlayer(gameId, "client-2", "Player 2", "#00FF00", "200")!;

      const started = engine.startGame(gameId, "master")!;
      expect(started.activePlayer).toBe(p1.player.id);

      const p2Legion = started.players.get(p2.player.id)!.legions[0];

      logger.logPhase("SPLIT", "Non-active player legion attempting split during active player's turn");
      const result = engine.splitLegion(
        gameId,
        p2Legion.id,
        p2Legion.creatures.slice(0, 4),
        p2Legion.creatures.slice(4, 8),
        p2Legion.tile
      );

      expect(result).toBeNull();

      logger.logResult(true, "BHV-015: Non-active player split was rejected");
    });

    it("BHV-016: fails split outside SPLIT phase", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-016-split-wrong-phase";

      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      const added = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;
      const started = engine.startGame(gameId, "master")!;

      const legion = started.players.get(added.player.id)!.legions[0];

      const game = engine.getGame(gameId)!;
      game.phase = Phase.MOVE;

      logger.logPhase("MOVE", "Attempting split command outside SPLIT phase");
      const result = engine.splitLegion(
        gameId,
        legion.id,
        legion.creatures.slice(0, 4),
        legion.creatures.slice(4, 8),
        legion.tile
      );

      expect(result).toBeNull();

      logger.logResult(true, "BHV-016: Split outside SPLIT phase was rejected");
    });
  });

  describe("Move", () => {
    it("BHV-017: moves legion to legal destination after valid roll", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-017-move-legal";

      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      const added = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;
      const started = engine.startGame(gameId, "master")!;

      const legion = started.players.get(added.player.id)!.legions[0];
      const sourceTile = legion.tile;

      const toMove = engine.endPhase(gameId, added.player.id);
      expect(toMove?.phase).toBe(Phase.MOVE);

      engine.forceRollForMove(gameId, added.player.id, 1);
      const valid = getValidDestinations(sourceTile, 1);
      expect(valid.length).toBeGreaterThan(0);
      const destination = valid[0];

      logger.logPhase("MOVE", `Moving legion from ${sourceTile} to legal tile ${destination}`);
      const moved = engine.moveLegion(gameId, legion.id, sourceTile, destination);

      expect(moved).not.toBeNull();
      const movedLegion = moved!.players.get(added.player.id)!.legions.find((l) => l.id === legion.id)!;
      expect(movedLegion.tile).toBe(destination);

      logger.logResult(true, "BHV-017: Legal move succeeded");
    });

    it("BHV-018: fails move when destination is not reachable by roll", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-018-move-invalid-destination";

      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      const added = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;
      const started = engine.startGame(gameId, "master")!;

      const legion = started.players.get(added.player.id)!.legions[0];
      const sourceTile = legion.tile;

      engine.endPhase(gameId, added.player.id);
      engine.forceRollForMove(gameId, added.player.id, 1);

      const valid = getValidDestinations(sourceTile, 1);
      const invalidCandidate = ["200", "300", "400", "500", "600", "111", "211"].find(
        (tile) => !valid.includes(tile as TileId)
      ) as TileId;
      expect(invalidCandidate).toBeTruthy();

      logger.logPhase("MOVE", `Attempting move to invalid destination ${invalidCandidate}`);
      const moved = engine.moveLegion(gameId, legion.id, sourceTile, invalidCandidate);

      expect(moved).toBeNull();
      const game = engine.getGame(gameId)!;
      const unchangedLegion = game.players.get(added.player.id)!.legions.find((l) => l.id === legion.id)!;
      expect(unchangedLegion.tile).toBe(sourceTile);

      logger.logResult(true, "BHV-018: Invalid destination move was rejected");
    });

    it("BHV-019: fails move when no die roll is available", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-019-move-no-roll";

      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      const added = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;
      const started = engine.startGame(gameId, "master")!;

      const legion = started.players.get(added.player.id)!.legions[0];
      const sourceTile = legion.tile;

      engine.endPhase(gameId, added.player.id);

      const destination = getValidDestinations(sourceTile, 1)[0] as TileId;
      logger.logPhase("MOVE", "Attempting move before rolling die");
      const moved = engine.moveLegion(gameId, legion.id, sourceTile, destination);

      expect(moved).toBeNull();

      logger.logResult(true, "BHV-019: Move without die roll was rejected");
    });

    it("BHV-020: fails move when destination has friendly legion", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-020-move-friendly-occupied";

      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      const added = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;
      const started = engine.startGame(gameId, "master")!;

      const player = started.players.get(added.player.id)!;
      const originalLegion = player.legions[0];

      const split = engine.splitLegion(
        gameId,
        originalLegion.id,
        originalLegion.creatures.slice(0, 4),
        originalLegion.creatures.slice(4, 8),
        originalLegion.tile
      );
      expect(split).not.toBeNull();

      const afterSplit = engine.getGame(gameId)!;
      const p = afterSplit.players.get(added.player.id)!;
      const legionA = p.legions[0];
      const legionB = p.legions[1];

      engine.endPhase(gameId, added.player.id);
      engine.forceRollForMove(gameId, added.player.id, 1);
      const destination = getValidDestinations(legionA.tile, 1)[0] as TileId;
      expect(destination).toBeTruthy();

      const placed = engine.placeLegionForTest(gameId, legionB.id, destination);
      expect(placed).not.toBeNull();

      logger.logPhase("MOVE", `Attempting move into friendly-occupied tile ${destination}`);
      const moved = engine.moveLegion(gameId, legionA.id, legionA.tile, destination);
      expect(moved).toBeNull();

      logger.logResult(true, "BHV-020: Move into friendly stack was rejected");
    });

    it("BHV-021: MOVE ends to RECRUIT when no battle is pending", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-021-move-end-recruit";

      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      const added = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;
      const started = engine.startGame(gameId, "master")!;

      const legion = started.players.get(added.player.id)!.legions[0];
      const sourceTile = legion.tile;

      engine.endPhase(gameId, added.player.id);
      engine.forceRollForMove(gameId, added.player.id, 1);

      const destination = getValidDestinations(sourceTile, 1)[0] as TileId;
      const moved = engine.moveLegion(gameId, legion.id, sourceTile, destination);
      expect(moved).not.toBeNull();

      logger.logPhase("MOVE", "Ending MOVE with no contested tiles");
      const ended = engine.endPhase(gameId, added.player.id);

      expect(ended?.phase).toBe(Phase.RECRUIT);
      logger.logResult(true, "BHV-021: MOVE ended in RECRUIT with no pending battle");
    });

    it("BHV-022: MOVE ends to FIGHT when a battle is pending", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-022-move-end-fight";

      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      engine.joinGame(gameId, "key", "client-2");

      const p1 = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;
      const p2 = engine.addPlayer(gameId, "client-2", "Player 2", "#00FF00", "200")!;
      const started = engine.startGame(gameId, "master")!;

      const p1Legion = started.players.get(p1.player.id)!.legions[0];
      const p2Legion = started.players.get(p2.player.id)!.legions[0];

      engine.endPhase(gameId, p1.player.id);

      const placed1 = engine.placeLegionForTest(gameId, p1Legion.id, "211");
      const placed2 = engine.placeLegionForTest(gameId, p2Legion.id, "211");
      expect(placed1).not.toBeNull();
      expect(placed2).not.toBeNull();

      logger.logPhase("MOVE", "Ending MOVE while tile 211 has opposing legions");
      const ended = engine.endPhase(gameId, p1.player.id);

      expect(ended?.phase).toBe(Phase.FIGHT);
      logger.logResult(true, "BHV-022: MOVE ended in FIGHT due to pending battle");
    });
  });

  describe("Battle Start and Resolution", () => {
    const setupTwoPlayerGame = (gameId: string) => {
      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      engine.joinGame(gameId, "key", "client-2");

      const p1 = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;
      const p2 = engine.addPlayer(gameId, "client-2", "Player 2", "#00FF00", "200")!;
      const started = engine.startGame(gameId, "master")!;

      const p1Legion = started.players.get(p1.player.id)!.legions[0];
      const p2Legion = started.players.get(p2.player.id)!.legions[0];

      return { p1, p2, p1Legion, p2Legion };
    };

    it("BHV-023: initiates battle when enemy legions occupy the same tile", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-023-battle-initiated";
      const { p1, p2, p1Legion, p2Legion } = setupTwoPlayerGame(gameId);

      engine.endPhase(gameId, p1.player.id); // SPLIT -> MOVE
      const placed1 = engine.placeLegionForTest(gameId, p1Legion.id, "211");
      const placed2 = engine.placeLegionForTest(gameId, p2Legion.id, "211");
      expect(placed1).not.toBeNull();
      expect(placed2).not.toBeNull();

      logger.logPhase("MOVE", "Ending MOVE with opposing legions on tile 211");
      const ended = engine.endPhase(gameId, p1.player.id);

      expect(ended?.phase).toBe(Phase.FIGHT);
      const tile = ended?.tiles.get("211");
      expect(tile?.legions.length).toBeGreaterThanOrEqual(2);
      expect(tile?.legions.some((l) => l.playerId === p1.player.id)).toBe(true);
      expect(tile?.legions.some((l) => l.playerId === p2.player.id)).toBe(true);

      logger.logResult(true, "BHV-023: Battle started when enemy legions shared a tile");
    });

    it("BHV-024: force battle setup succeeds with valid attacker, defender, and tile", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-024-force-battle-success";
      const { p1, p2 } = setupTwoPlayerGame(gameId);

      logger.logPhase("FIGHT", "Forcing battle on tile 211 with valid players");
      const forced = engine.forceBattle(gameId, p1.player.id, p2.player.id, "211");

      expect(forced).not.toBeNull();
      expect(forced?.game.phase).toBe(Phase.FIGHT);
      expect(forced?.battleTileId).toBe("211");

      logger.logResult(true, "BHV-024: Force battle succeeded and game entered FIGHT");
    });

    it("BHV-025: force battle setup fails for invalid players or tile", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-025-force-battle-invalid";
      const { p1 } = setupTwoPlayerGame(gameId);

      logger.logPhase("FIGHT", "Attempting force battle with invalid defender and invalid tile");
      const invalidPlayer = engine.forceBattle(gameId, p1.player.id, "missing-player" as PlayerId, "211");
      const invalidTile = engine.forceBattle(gameId, p1.player.id, p1.player.id, "999" as TileId);

      expect(invalidPlayer).toBeNull();
      expect(invalidTile).toBeNull();

      logger.logResult(true, "BHV-025: Invalid force battle requests were rejected");
    });

    it("BHV-026: resolves battle with attacker victory outcome", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-026-resolve-attacker-win";
      const { p1, p2 } = setupTwoPlayerGame(gameId);

      const forced = engine.forceBattle(gameId, p1.player.id, p2.player.id, "211")!;
      const game = forced.game;
      const tile = game.tiles.get("211")!;
      const defenderLegionId = tile.legions[0].id;
      const attackerLegionId = tile.legions[1].id;

      logger.logPhase("FIGHT", "Resolving battle with attacker survivors and zero defender survivors");
      const result = engine.resolveBattle(
        gameId,
        p1.player.id,
        "211",
        defenderLegionId,
        attackerLegionId,
        [],
        [tile.legions[1].creatures[0]]
      );

      expect(result).not.toBeNull();
      expect(result?.winnerPlayerId).toBe(p1.player.id);
      expect(result?.tie).toBe(false);

      logger.logResult(true, "BHV-026: Battle resolved with attacker victory");
    });

    it("BHV-027: resolves battle with defender victory outcome", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-027-resolve-defender-win";
      const { p1, p2 } = setupTwoPlayerGame(gameId);

      const forced = engine.forceBattle(gameId, p1.player.id, p2.player.id, "211")!;
      const game = forced.game;
      const tile = game.tiles.get("211")!;
      const defenderLegionId = tile.legions[0].id;
      const attackerLegionId = tile.legions[1].id;

      logger.logPhase("FIGHT", "Resolving battle with defender survivors and zero attacker survivors");
      const result = engine.resolveBattle(
        gameId,
        p1.player.id,
        "211",
        defenderLegionId,
        attackerLegionId,
        [tile.legions[0].creatures[0]],
        []
      );

      expect(result).not.toBeNull();
      expect(result?.winnerPlayerId).toBe(p2.player.id);
      expect(result?.tie).toBe(false);

      logger.logResult(true, "BHV-027: Battle resolved with defender victory");
    });

    it("BHV-028: resolves battle as tie when both legions are eliminated", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-028-resolve-tie";
      const { p1, p2 } = setupTwoPlayerGame(gameId);

      const forced = engine.forceBattle(gameId, p1.player.id, p2.player.id, "211")!;
      const game = forced.game;
      const tile = game.tiles.get("211")!;
      const defenderLegionId = tile.legions[0].id;
      const attackerLegionId = tile.legions[1].id;

      logger.logPhase("FIGHT", "Resolving battle with no survivors on either side");
      const result = engine.resolveBattle(gameId, p1.player.id, "211", defenderLegionId, attackerLegionId, [], []);

      expect(result).not.toBeNull();
      expect(result?.tie).toBe(true);
      expect(result?.winnerPlayerId).toBeNull();

      logger.logResult(true, "BHV-028: Battle resolved as tie");
    });

    it("BHV-029: fails to resolve battle outside FIGHT phase", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-029-resolve-wrong-phase";
      const { p1, p2, p1Legion, p2Legion } = setupTwoPlayerGame(gameId);

      const game = engine.getGame(gameId)!;
      game.phase = Phase.RECRUIT;
      engine.placeLegionForTest(gameId, p1Legion.id, "211");
      engine.placeLegionForTest(gameId, p2Legion.id, "211");

      logger.logPhase("RECRUIT", "Attempting resolve battle outside FIGHT phase");
      const result = engine.resolveBattle(gameId, p1.player.id, "211", p2Legion.id, p1Legion.id, [], []);

      expect(result).toBeNull();
      logger.logResult(true, "BHV-029: Resolve battle outside FIGHT was rejected");
    });

    it("BHV-030: fails to resolve battle when tile lacks valid opposing legions", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-030-resolve-invalid-tile-state";
      const { p1, p2 } = setupTwoPlayerGame(gameId);

      const forced = engine.forceBattle(gameId, p1.player.id, p2.player.id, "211")!;
      const game = forced.game;
      const tile = game.tiles.get("211")!;

      // Keep only one legion on tile to make the battle state invalid for resolution.
      tile.legions = [tile.legions[0]];

      logger.logPhase("FIGHT", "Attempting resolve with missing opposing legion on battle tile");
      const result = engine.resolveBattle(
        gameId,
        p1.player.id,
        "211",
        forced.defenderLegionId,
        forced.attackerLegionId,
        [],
        []
      );

      expect(result).toBeNull();
      logger.logResult(true, "BHV-030: Resolve failed for invalid opposing legion state");
    });

    it("BHV-031: resolve battle keeps survivors and ownership consistent", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-031-resolve-survivor-consistency";
      const { p1, p2 } = setupTwoPlayerGame(gameId);

      const forced = engine.forceBattle(gameId, p1.player.id, p2.player.id, "211")!;
      const game = forced.game;
      const tile = game.tiles.get("211")!;
      const defenderLegion = tile.legions[0];
      const attackerLegion = tile.legions[1];
      const attackerSurvivors = attackerLegion.creatures.slice(0, 2);

      logger.logPhase("FIGHT", "Resolving battle with two attacker survivors");
      const result = engine.resolveBattle(
        gameId,
        p1.player.id,
        "211",
        defenderLegion.id,
        attackerLegion.id,
        [],
        attackerSurvivors
      );

      expect(result).not.toBeNull();

      const updated = engine.getGame(gameId)!;
      const winner = updated.players.get(p1.player.id)!;
      const loser = updated.players.get(p2.player.id)!;
      const winnerLegion = winner.legions.find((l) => l.id === attackerLegion.id);

      expect(winnerLegion).toBeDefined();
      expect(winnerLegion?.creatures.length).toBe(2);
      expect(loser.legions.some((l) => l.id === defenderLegion.id)).toBe(false);

      logger.logResult(true, "BHV-031: Survivor composition and ownership stayed consistent");
    });

    it("BHV-032: resolve battle writes battle-resolved log payload", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-032-resolve-log-payload";
      const { p1, p2 } = setupTwoPlayerGame(gameId);

      const forced = engine.forceBattle(gameId, p1.player.id, p2.player.id, "211")!;
      const game = forced.game;
      const tile = game.tiles.get("211")!;
      const defenderLegionId = tile.legions[0].id;
      const attackerLegionId = tile.legions[1].id;

      engine.resolveBattle(
        gameId,
        p1.player.id,
        "211",
        defenderLegionId,
        attackerLegionId,
        [],
        [tile.legions[1].creatures[0]]
      );

      const updated = engine.getGame(gameId)!;
      const battleLog = [...updated.log].reverse().find((entry) => entry.action === "BATTLE_RESOLVED");

      expect(battleLog).toBeDefined();
      expect(battleLog?.details.battleTileId).toBe("211");
      expect(battleLog?.details.tie).toBe("false");
      expect(battleLog?.details.winnerPlayerId).toBe(p1.player.id);

      logger.logResult(true, "BHV-032: Battle resolved log payload captured expected details");
    });

    it("BHV-033: transitions from FIGHT to RECRUIT after resolution", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-033-fight-to-recruit";
      const { p1, p2 } = setupTwoPlayerGame(gameId);

      const forced = engine.forceBattle(gameId, p1.player.id, p2.player.id, "211")!;
      const game = forced.game;
      const tile = game.tiles.get("211")!;

      logger.logPhase("FIGHT", "Resolving battle and checking resulting phase");
      const result = engine.resolveBattle(
        gameId,
        p1.player.id,
        "211",
        tile.legions[0].id,
        tile.legions[1].id,
        [],
        [tile.legions[1].creatures[0]]
      );

      expect(result).not.toBeNull();
      expect(result?.game.phase).toBe(Phase.RECRUIT);

      logger.logResult(true, "BHV-033: Successful battle resolution transitioned to RECRUIT");
    });
  });

  describe("Recruit and Turn Flow", () => {
    const setupTwoPlayerGame = (gameId: string) => {
      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      engine.joinGame(gameId, "key", "client-2");

      const p1 = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;
      const p2 = engine.addPlayer(gameId, "client-2", "Player 2", "#00FF00", "200")!;
      const started = engine.startGame(gameId, "master")!;

      const p1Legion = started.players.get(p1.player.id)!.legions[0];
      const p2Legion = started.players.get(p2.player.id)!.legions[0];

      return { p1, p2, p1Legion, p2Legion };
    };

    it("BHV-034: recruits successfully when terrain and prerequisites are met", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-034-recruit-success";
      const { p1, p1Legion } = setupTwoPlayerGame(gameId);

      const game = engine.getGame(gameId)!;
      game.phase = Phase.RECRUIT;
      game.activePlayer = p1.player.id;
      game.movedLegionsThisTurn = [p1Legion.id];

      // Build a legal MARSH recruit state for TROLL via 2 OGREs.
      p1Legion.creatures = p1Legion.creatures.slice(0, 4);
      p1Legion.creatures[2].type = CreatureType.OGRE;
      p1Legion.creatures[3].type = CreatureType.OGRE;
      engine.placeLegionForTest(gameId, p1Legion.id, "212");

      logger.logPhase("RECRUIT", "Recruiting TROLL in MARSH with required OGRE chain");
      const result = engine.recruitCreature(gameId, p1Legion.id, CreatureType.TROLL);

      expect(result).not.toBeNull();
      expect(result?.creature.type).toBe(CreatureType.TROLL);

      logger.logResult(true, "BHV-034: Legal recruit succeeded");
    });

    it("BHV-035: fails recruit when legion is at max size", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-035-recruit-max-size";
      const { p1, p1Legion } = setupTwoPlayerGame(gameId);

      const game = engine.getGame(gameId)!;
      game.phase = Phase.RECRUIT;
      game.activePlayer = p1.player.id;
      game.movedLegionsThisTurn = [p1Legion.id];

      p1Legion.creatures = Array.from({ length: 7 }, () => ({ ...p1Legion.creatures[0] }));
      engine.placeLegionForTest(gameId, p1Legion.id, "312");

      logger.logPhase("RECRUIT", "Attempting recruit with legion already at size 7");
      const result = engine.recruitCreature(gameId, p1Legion.id, CreatureType.CENTAUR);

      expect(result).toBeNull();
      logger.logResult(true, "BHV-035: Recruit at max size was rejected");
    });

    it("BHV-036: fails recruit when requested creature is not eligible", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-036-recruit-ineligible";
      const { p1, p1Legion } = setupTwoPlayerGame(gameId);

      const game = engine.getGame(gameId)!;
      game.phase = Phase.RECRUIT;
      game.activePlayer = p1.player.id;
      game.movedLegionsThisTurn = [p1Legion.id];

      p1Legion.creatures = p1Legion.creatures.slice(0, 4);
      engine.placeLegionForTest(gameId, p1Legion.id, "312"); // PLAINS

      logger.logPhase("RECRUIT", "Attempting ineligible recruit HYDRA on PLAINS");
      const result = engine.recruitCreature(gameId, p1Legion.id, CreatureType.HYDRA);

      expect(result).toBeNull();
      logger.logResult(true, "BHV-036: Ineligible recruit was rejected");
    });

    it("BHV-037: fails recruit when actor is not active player", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-037-recruit-non-active";
      const { p1, p2, p1Legion } = setupTwoPlayerGame(gameId);

      const game = engine.getGame(gameId)!;
      game.phase = Phase.RECRUIT;
      game.activePlayer = p2.player.id;
      game.movedLegionsThisTurn = [p1Legion.id];

      p1Legion.creatures = p1Legion.creatures.slice(0, 4);
      p1Legion.creatures[2].type = CreatureType.OGRE;
      p1Legion.creatures[3].type = CreatureType.OGRE;
      engine.placeLegionForTest(gameId, p1Legion.id, "212");

      logger.logPhase("RECRUIT", "Non-active player attempting recruit");
      const result = engine.recruitCreature(gameId, p1Legion.id, CreatureType.TROLL);

      expect(result).toBeNull();
      expect(game.activePlayer).toBe(p2.player.id);
      expect(game.activePlayer).not.toBe(p1.player.id);

      logger.logResult(true, "BHV-037: Non-active player recruit was rejected");
    });

    it("BHV-038: recruit completion transitions to next player's SPLIT", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-038-recruit-end-transition";
      const { p1, p2 } = setupTwoPlayerGame(gameId);

      const game = engine.getGame(gameId)!;
      game.phase = Phase.RECRUIT;
      game.activePlayer = p1.player.id;
      game.movedLegionsThisTurn = [];

      logger.logPhase("RECRUIT", "Ending RECRUIT to rotate turn to next player");
      const ended = engine.endPhase(gameId, p1.player.id);

      expect(ended?.phase).toBe(Phase.SPLIT);
      expect(ended?.activePlayer).toBe(p2.player.id);

      logger.logResult(true, "BHV-038: End RECRUIT transitioned to next player's SPLIT");
    });

    it("BHV-039: enforces turn phase order SPLIT -> MOVE -> RECRUIT -> next SPLIT", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-039-phase-order";
      const { p1, p1Legion } = setupTwoPlayerGame(gameId);

      const afterSplit = engine.endPhase(gameId, p1.player.id);
      expect(afterSplit?.phase).toBe(Phase.MOVE);

      engine.forceRollForMove(gameId, p1.player.id, 1);
      const destination = getValidDestinations(p1Legion.tile, 1)[0] as TileId;
      const moved = engine.moveLegion(gameId, p1Legion.id, p1Legion.tile, destination);
      expect(moved).not.toBeNull();

      const afterMove = engine.endPhase(gameId, p1.player.id);
      expect(afterMove?.phase).toBe(Phase.RECRUIT);

      logger.logPhase("TURN", "Advancing through SPLIT -> MOVE -> RECRUIT -> next SPLIT");
      const afterRecruit = engine.endPhase(gameId, p1.player.id);

      expect(afterRecruit?.phase).toBe(Phase.SPLIT);
      logger.logResult(true, "BHV-039: Phase order is enforced correctly");
    });

    it("BHV-040: rejects out-of-turn actions across phases", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-040-out-of-turn";
      const { p1, p2, p1Legion } = setupTwoPlayerGame(gameId);
      const game = engine.getGame(gameId)!;

      // SPLIT action by non-active player
      expect(game.activePlayer).toBe(p1.player.id);
      logger.logPhase("SPLIT", "Non-active player attempting split");
      const outOfTurnSplit = engine.splitLegion(
        gameId,
        game.players.get(p2.player.id)!.legions[0].id,
        game.players.get(p2.player.id)!.legions[0].creatures.slice(0, 4),
        game.players.get(p2.player.id)!.legions[0].creatures.slice(4, 8),
        game.players.get(p2.player.id)!.legions[0].tile
      );
      expect(outOfTurnSplit).toBeNull();

      // MOVE action by non-active player
      engine.endPhase(gameId, p1.player.id);
      engine.forceRollForMove(gameId, p1.player.id, 1);
      const p2Legion = game.players.get(p2.player.id)!.legions[0];
      const p2Dest = getValidDestinations(p2Legion.tile, 1)[0] as TileId;
      logger.logPhase("MOVE", "Non-active player attempting move");
      const outOfTurnMove = engine.moveLegion(gameId, p2Legion.id, p2Legion.tile, p2Dest);
      expect(outOfTurnMove).toBeNull();

      // RECRUIT action by non-active player
      const p1Dest = getValidDestinations(p1Legion.tile, 1)[0] as TileId;
      engine.moveLegion(gameId, p1Legion.id, p1Legion.tile, p1Dest);
      engine.endPhase(gameId, p1.player.id);
      const p2RecruitLegion = game.players.get(p2.player.id)!.legions[0];
      game.movedLegionsThisTurn = [p2RecruitLegion.id];
      logger.logPhase("RECRUIT", "Non-active player attempting recruit");
      const outOfTurnRecruit = engine.recruitCreature(gameId, p2RecruitLegion.id, CreatureType.CENTAUR);
      expect(outOfTurnRecruit).toBeNull();

      logger.logResult(true, "BHV-040: Out-of-turn actions were rejected across phases");
    });

    it("BHV-041: rejects wrong-phase actions for split, move, recruit, and resolve battle", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-041-wrong-phase-actions";
      const { p1, p2, p1Legion, p2Legion } = setupTwoPlayerGame(gameId);
      const game = engine.getGame(gameId)!;

      // split in MOVE
      game.phase = Phase.MOVE;
      const splitWrongPhase = engine.splitLegion(
        gameId,
        p1Legion.id,
        p1Legion.creatures.slice(0, 4),
        p1Legion.creatures.slice(4, 8),
        p1Legion.tile
      );
      expect(splitWrongPhase).toBeNull();

      // move in SPLIT
      game.phase = Phase.SPLIT;
      const moveWrongPhase = engine.moveLegion(gameId, p1Legion.id, p1Legion.tile, p1Legion.tile);
      expect(moveWrongPhase).toBeNull();

      // recruit in MOVE
      game.phase = Phase.MOVE;
      const recruitWrongPhase = engine.recruitCreature(gameId, p1Legion.id, CreatureType.CENTAUR);
      expect(recruitWrongPhase).toBeNull();

      // resolve battle in RECRUIT
      game.phase = Phase.RECRUIT;
      const resolveWrongPhase = engine.resolveBattle(gameId, p1.player.id, "211", p2Legion.id, p1Legion.id, [], []);
      expect(resolveWrongPhase).toBeNull();

      logger.logPhase("PHASE", "Attempted split, move, recruit, resolve in wrong phases");
      logger.logResult(true, "BHV-041: Wrong-phase actions were rejected");
    });

    it("BHV-042: turn handoff sets next active player and resets turn markers", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-042-turn-handoff";
      const { p1, p2, p1Legion } = setupTwoPlayerGame(gameId);

      const game = engine.getGame(gameId)!;
      game.phase = Phase.RECRUIT;
      game.activePlayer = p1.player.id;
      game.movedLegionsThisTurn = [p1Legion.id];

      logger.logPhase("RECRUIT", "Ending turn and checking active player handoff + marker reset");
      const ended = engine.endPhase(gameId, p1.player.id);

      expect(ended?.phase).toBe(Phase.SPLIT);
      expect(ended?.activePlayer).toBe(p2.player.id);
      expect(ended?.movedLegionsThisTurn).toEqual([]);

      logger.logResult(true, "BHV-042: Turn handoff and per-turn marker reset succeeded");
    });
  });

  describe("Rejoin and End-to-End", () => {
    it("BHV-043: rejoin succeeds for known client with correct key before start", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-043-rejoin-before-start";

      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      const added = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;

      logger.logPhase("LOBBY", "Known client attempting rejoin before game start");
      const rejoin = engine.rejoinGame(gameId, "key", "client-1");

      expect(rejoin).not.toBeNull();
      expect(rejoin?.playerId).toBe(added.player.id);
      expect(rejoin?.gameState.phase).toBe(Phase.LOBBY);

      logger.logResult(true, "BHV-043: Known client rejoin succeeded before start");
    });

    it("BHV-044: rejoin succeeds for known client with correct key after start", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-044-rejoin-after-start";

      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      const added = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;
      engine.startGame(gameId, "master");

      logger.logPhase("SPLIT", "Known client attempting rejoin after game start");
      const rejoin = engine.rejoinGame(gameId, "key", "client-1");

      expect(rejoin).not.toBeNull();
      expect(rejoin?.playerId).toBe(added.player.id);
      expect(rejoin?.gameState.phase).toBe(Phase.SPLIT);

      logger.logResult(true, "BHV-044: Known client rejoin succeeded after start");
    });

    it("BHV-045: rejoin fails for unknown client mapping with correct key", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-045-rejoin-unknown-client";

      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100");
      engine.startGame(gameId, "master");

      logger.logPhase("SPLIT", "Unknown client attempting rejoin with correct key");
      const rejoin = engine.rejoinGame(gameId, "key", "unknown-client");

      expect(rejoin).toBeNull();
      logger.logResult(true, "BHV-045: Unknown client rejoin was rejected");
    });

    it("BHV-046: rejoin fails with wrong key", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-046-rejoin-wrong-key";

      engine.createGame(gameId, "correct-key", "master");
      engine.joinGame(gameId, "correct-key", "client-1");
      engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100");

      logger.logPhase("LOBBY", "Known client attempting rejoin with wrong key");
      const rejoin = engine.rejoinGame(gameId, "wrong-key", "client-1");

      expect(rejoin).toBeNull();
      logger.logResult(true, "BHV-046: Wrong-key rejoin was rejected");
    });

    it("BHV-047: completes full happy path from create to battle, recruit, and turn handoff", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-047-happy-path";

      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      engine.joinGame(gameId, "key", "client-2");
      const p1 = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;
      const p2 = engine.addPlayer(gameId, "client-2", "Player 2", "#00FF00", "200")!;
      const started = engine.startGame(gameId, "master")!;

      const p1Legion = started.players.get(p1.player.id)!.legions[0];
      const p2Legion = started.players.get(p2.player.id)!.legions[0];

      const split = engine.splitLegion(
        gameId,
        p1Legion.id,
        p1Legion.creatures.slice(0, 4),
        p1Legion.creatures.slice(4, 8),
        p1Legion.tile
      );
      expect(split).not.toBeNull();

      engine.endPhase(gameId, p1.player.id); // MOVE
      engine.forceRollForMove(gameId, p1.player.id, 1);
      const p1MoveDest = getValidDestinations(p1Legion.tile, 1)[0] as TileId;
      engine.moveLegion(gameId, p1Legion.id, p1Legion.tile, p1MoveDest);

      engine.placeLegionForTest(gameId, p1Legion.id, "211");
      engine.placeLegionForTest(gameId, p2Legion.id, "211");
      const toFight = engine.endPhase(gameId, p1.player.id);
      expect(toFight?.phase).toBe(Phase.FIGHT);

      const tile = engine.getGame(gameId)!.tiles.get("211")!;
      const resolve = engine.resolveBattle(
        gameId,
        p1.player.id,
        "211",
        tile.legions[0].id,
        tile.legions[1].id,
        [],
        [tile.legions[1].creatures[0]]
      );
      expect(resolve).not.toBeNull();
      expect(resolve?.game.phase).toBe(Phase.RECRUIT);

      // Ensure a legal recruit in TOWER terrain for the actual winner.
      const winnerPlayerId = resolve!.winnerPlayerId;
      expect(winnerPlayerId).not.toBeNull();
      const winnerLegion = resolve!.game.players.get(winnerPlayerId!)!.legions[0];
      expect(winnerLegion).toBeDefined();
      resolve!.game.activePlayer = winnerPlayerId;
      resolve!.game.movedLegionsThisTurn = [winnerLegion.id];
      engine.placeLegionForTest(gameId, winnerLegion.id, "100");

      const postPlace = engine.getGame(gameId)!;
      const placedWinnerLegion = postPlace.players.get(winnerPlayerId!)!.legions.find((l) => l.id === winnerLegion.id)!;
      const placedTile = postPlace.tiles.get(placedWinnerLegion.tile)!;
      const eligible = getEligibleRecruitments(
        placedTile.terrainType,
        placedWinnerLegion.creatures.map((c) => c.type),
        7
      );
      expect(eligible.length).toBeGreaterThan(0);

      const recruit = engine.recruitCreature(gameId, winnerLegion.id, eligible[0]);
      expect(recruit).not.toBeNull();

      logger.logPhase("TURN", "Completing RECRUIT and handing turn to next player");
      const handoff = engine.endPhase(gameId, winnerPlayerId!);
      const expectedNextPlayer = winnerPlayerId === p1.player.id ? p2.player.id : p1.player.id;
      expect(handoff?.phase).toBe(Phase.SPLIT);
      expect(handoff?.activePlayer).toBe(expectedNextPlayer);

      logger.logResult(true, "BHV-047: Full happy path completed successfully");
    });

    it("BHV-048: guardrail flow rejects invalid action first, then accepts valid action per phase", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-048-guardrail-flow";

      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      engine.joinGame(gameId, "key", "client-2");
      const p1 = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;
      const p2 = engine.addPlayer(gameId, "client-2", "Player 2", "#00FF00", "200")!;
      const started = engine.startGame(gameId, "master")!;

      const p1Legion = started.players.get(p1.player.id)!.legions[0];
      const p2Legion = started.players.get(p2.player.id)!.legions[0];

      // SPLIT: invalid (non-active), then valid
      const invalidSplit = engine.splitLegion(
        gameId,
        p2Legion.id,
        p2Legion.creatures.slice(0, 4),
        p2Legion.creatures.slice(4, 8),
        p2Legion.tile
      );
      expect(invalidSplit).toBeNull();
      const validSplit = engine.splitLegion(
        gameId,
        p1Legion.id,
        p1Legion.creatures.slice(0, 4),
        p1Legion.creatures.slice(4, 8),
        p1Legion.tile
      );
      expect(validSplit).not.toBeNull();

      // MOVE: invalid (no roll), then valid
      engine.endPhase(gameId, p1.player.id);
      const invalidMove = engine.moveLegion(gameId, p1Legion.id, p1Legion.tile, "312");
      expect(invalidMove).toBeNull();
      engine.forceRollForMove(gameId, p1.player.id, 1);
      const validDest = getValidDestinations(p1Legion.tile, 1)[0] as TileId;
      const validMove = engine.moveLegion(gameId, p1Legion.id, p1Legion.tile, validDest);
      expect(validMove).not.toBeNull();

      // FIGHT: invalid resolve, then valid resolve
      engine.placeLegionForTest(gameId, p1Legion.id, "211");
      engine.placeLegionForTest(gameId, p2Legion.id, "211");
      engine.endPhase(gameId, p1.player.id);
      const invalidResolve = engine.resolveBattle(gameId, p1.player.id, "211", "bad" as any, "bad" as any, [], []);
      expect(invalidResolve).toBeNull();
      const tile = engine.getGame(gameId)!.tiles.get("211")!;
      const validResolve = engine.resolveBattle(
        gameId,
        p1.player.id,
        "211",
        tile.legions[0].id,
        tile.legions[1].id,
        [],
        [tile.legions[1].creatures[0]]
      );
      expect(validResolve).not.toBeNull();

      // RECRUIT: invalid ineligible, then valid tower recruit
      const winnerPlayerId = validResolve?.winnerPlayerId;
      expect(winnerPlayerId).not.toBeNull();
      const winnerLegion = engine.getGame(gameId)!.players.get(winnerPlayerId!)!.legions[0];
      expect(winnerLegion).toBeDefined();
      const game = engine.getGame(gameId)!;
      game.activePlayer = winnerPlayerId!;
      game.movedLegionsThisTurn = [winnerLegion.id];
      const invalidRecruit = engine.recruitCreature(gameId, winnerLegion.id, CreatureType.HYDRA);
      expect(invalidRecruit).toBeNull();
      engine.placeLegionForTest(gameId, winnerLegion.id, "100");
      game.movedLegionsThisTurn = [winnerLegion.id];

      const placed = engine.getGame(gameId)!;
      const placedWinnerLegion = placed.players.get(winnerPlayerId!)!.legions.find((l) => l.id === winnerLegion.id)!;
      const placedTile = placed.tiles.get(placedWinnerLegion.tile)!;
      const eligible = getEligibleRecruitments(
        placedTile.terrainType,
        placedWinnerLegion.creatures.map((c) => c.type),
        7
      );
      expect(eligible.length).toBeGreaterThan(0);

      const validRecruit = engine.recruitCreature(gameId, winnerLegion.id, eligible[0]);
      expect(validRecruit).not.toBeNull();

      logger.logPhase("GUARDRAIL", "Invalid-first then valid action pattern succeeded across phases");
      logger.logResult(true, "BHV-048: Guardrail flow validated invalid and valid paths");
    });

    it("BHV-049: multi-turn two-player regression includes battle and recruit", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-049-multi-turn";

      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      engine.joinGame(gameId, "key", "client-2");
      const p1 = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;
      const p2 = engine.addPlayer(gameId, "client-2", "Player 2", "#00FF00", "200")!;
      const started = engine.startGame(gameId, "master")!;

      const p1Legion = started.players.get(p1.player.id)!.legions[0];
      const p2Legion = started.players.get(p2.player.id)!.legions[0];

      // Turn 1 (P1): split + move + recruit
      engine.splitLegion(
        gameId,
        p1Legion.id,
        p1Legion.creatures.slice(0, 4),
        p1Legion.creatures.slice(4, 8),
        p1Legion.tile
      );
      engine.endPhase(gameId, p1.player.id);
      engine.forceRollForMove(gameId, p1.player.id, 1);
      const p1Dest = getValidDestinations(p1Legion.tile, 1)[0] as TileId;
      engine.moveLegion(gameId, p1Legion.id, p1Legion.tile, p1Dest);
      engine.endPhase(gameId, p1.player.id);
      const p1Game = engine.getGame(gameId)!;
      p1Game.movedLegionsThisTurn = [p1Legion.id];
      engine.placeLegionForTest(gameId, p1Legion.id, "100");
      engine.recruitCreature(gameId, p1Legion.id, CreatureType.OGRE);
      const toP2 = engine.endPhase(gameId, p1.player.id);
      expect(toP2?.activePlayer).toBe(p2.player.id);

      // Turn 2 (P2): battle + recruit
      engine.splitLegion(
        gameId,
        p2Legion.id,
        p2Legion.creatures.slice(0, 4),
        p2Legion.creatures.slice(4, 8),
        p2Legion.tile
      );
      engine.endPhase(gameId, p2.player.id);
      engine.forceRollForMove(gameId, p2.player.id, 1);
      engine.placeLegionForTest(gameId, p2Legion.id, "211");
      engine.placeLegionForTest(gameId, p1Legion.id, "211");
      const toFight = engine.endPhase(gameId, p2.player.id);
      expect(toFight?.phase).toBe(Phase.FIGHT);

      const tile = engine.getGame(gameId)!.tiles.get("211")!;
      const resolved = engine.resolveBattle(
        gameId,
        p2.player.id,
        "211",
        tile.legions[0].id,
        tile.legions[1].id,
        [],
        [tile.legions[1].creatures[0]]
      );
      expect(resolved).not.toBeNull();
      expect(resolved?.game.phase).toBe(Phase.RECRUIT);

      const winnerLegion = engine.getGame(gameId)!.players.get(p2.player.id)?.legions[0];
      if (winnerLegion) {
        const game = engine.getGame(gameId)!;
        game.movedLegionsThisTurn = [winnerLegion.id];
        engine.placeLegionForTest(gameId, winnerLegion.id, "100");
        const recruit = engine.recruitCreature(gameId, winnerLegion.id, CreatureType.OGRE);
        expect(recruit).not.toBeNull();
      }

      const afterTurn2 = engine.endPhase(gameId, p2.player.id);
      expect(afterTurn2?.phase).toBe(Phase.SPLIT);
      expect(afterTurn2?.activePlayer).toBe(p1.player.id);

      logger.logResult(true, "BHV-049: Multi-turn flow completed with battle and recruit");
    });

    it("BHV-050: deterministic replay with forced rolls yields stable outcomes", () => {
      const logger = createLogger("VERBOSE");

      const runScenario = (gameId: string) => {
        engine.createGame(gameId, "key", "master");
        engine.joinGame(gameId, "key", "client-1");
        engine.joinGame(gameId, "key", "client-2");
        const p1 = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;
        const p2 = engine.addPlayer(gameId, "client-2", "Player 2", "#00FF00", "200")!;
        engine.startGame(gameId, "master");

        const forced = engine.forceBattle(gameId, p1.player.id, p2.player.id, "211")!;
        const tile = forced.game.tiles.get("211")!;

        engine.resolveBattle(
          gameId,
          p1.player.id,
          "211",
          tile.legions[0].id,
          tile.legions[1].id,
          [],
          [tile.legions[1].creatures[0]]
        );

        const game = engine.getGame(gameId)!;
        return {
          phase: game.phase,
          p1Score: game.players.get(p1.player.id)?.score ?? -1,
          p2Score: game.players.get(p2.player.id)?.score ?? -1,
          p1Legions: game.players.get(p1.player.id)?.legions.length ?? -1,
          p2Legions: game.players.get(p2.player.id)?.legions.length ?? -1,
        };
      };

      const first = runScenario("bhv-050-deterministic-a");
      const second = runScenario("bhv-050-deterministic-b");

      expect(first).toEqual(second);
      logger.logPhase("REPLAY", "Ran deterministic scenario twice with identical forced flow");
      logger.logResult(true, "BHV-050: Deterministic replay produced stable outcomes");
    });
  });

  describe("Connection Continuity", () => {
    const setupTwoPlayerGame = (gameId: string) => {
      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      engine.joinGame(gameId, "key", "client-2");

      const p1 = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;
      const p2 = engine.addPlayer(gameId, "client-2", "Player 2", "#00FF00", "200")!;
      const started = engine.startGame(gameId, "master")!;

      const p1Legion = started.players.get(p1.player.id)!.legions[0];
      const p2Legion = started.players.get(p2.player.id)!.legions[0];

      return { p1, p2, p1Legion, p2Legion };
    };

    it("BHV-051: client disconnects during lobby and rejoins with same client id", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-051-rejoin-lobby";

      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      const added = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;

      logger.logPhase("LOBBY", "Rejoining in lobby with same known client id");
      const rejoin = engine.rejoinGame(gameId, "key", "client-1");

      expect(rejoin).not.toBeNull();
      expect(rejoin?.gameState.phase).toBe(Phase.LOBBY);
      expect(rejoin?.playerId).toBe(added.player.id);

      logger.logResult(true, "BHV-051: Lobby rejoin with same client id succeeded");
    });

    it("BHV-052: client disconnects during active game and rejoins with same client id", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-052-rejoin-active";
      const { p1 } = setupTwoPlayerGame(gameId);

      const game = engine.getGame(gameId)!;
      game.phase = Phase.MOVE;
      game.activePlayer = p1.player.id;

      logger.logPhase("MOVE", "Rejoining active game state with same known client id");
      const rejoin = engine.rejoinGame(gameId, "key", "client-1");

      expect(rejoin).not.toBeNull();
      expect(rejoin?.gameState.phase).toBe(Phase.MOVE);
      expect(rejoin?.playerId).toBe(p1.player.id);

      logger.logResult(true, "BHV-052: Active-game rejoin with same client id succeeded");
    });

    it("BHV-053: rejoin from different browser/machine with transferred identity succeeds", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-053-transfer-identity";
      const { p1 } = setupTwoPlayerGame(gameId);

      const transfer = engine.issueReconnectToken(gameId, "key", "client-1");
      expect(transfer).not.toBeNull();

      logger.logPhase("SPLIT", "Rejoining from second device context using transferred reconnect token");
      const rejoin = engine.rejoinGame(gameId, "key", "other-browser-client", transfer!.transferToken);

      expect(rejoin).not.toBeNull();
      expect(rejoin?.playerId).toBe(p1.player.id);
      expect(rejoin?.clientId).toBe("other-browser-client");

      logger.logResult(true, "BHV-053: Rejoin with transferred identity succeeded");
    });

    it("BHV-054: rejoin from different browser/machine without identity transfer fails safely", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-054-no-transfer";
      setupTwoPlayerGame(gameId);

      logger.logPhase("SPLIT", "Rejoin attempt from unknown client id without identity transfer");
      const rejoin = engine.rejoinGame(gameId, "key", "other-browser-client");

      expect(rejoin).toBeNull();

      logger.logResult(true, "BHV-054: Rejoin without transferred identity was rejected safely");
    });

    it("BHV-055: after rejoin, active player permissions are restored correctly", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-055-permissions-after-rejoin";
      const { p1, p2, p1Legion, p2Legion } = setupTwoPlayerGame(gameId);

      const game = engine.getGame(gameId)!;
      game.phase = Phase.SPLIT;
      game.activePlayer = p1.player.id;

      const rejoin = engine.rejoinGame(gameId, "key", "client-1");
      expect(rejoin).not.toBeNull();

      logger.logPhase("SPLIT", "Validating active-vs-non-active permissions after rejoin");
      const activeSplit = engine.splitLegion(
        gameId,
        p1Legion.id,
        p1Legion.creatures.slice(0, 4),
        p1Legion.creatures.slice(4, 8),
        p1Legion.tile
      );
      expect(activeSplit).not.toBeNull();

      const nonActiveSplit = engine.splitLegion(
        gameId,
        p2Legion.id,
        p2Legion.creatures.slice(0, 4),
        p2Legion.creatures.slice(4, 8),
        p2Legion.tile
      );
      expect(nonActiveSplit).toBeNull();

      logger.logResult(true, "BHV-055: Post-rejoin permissions match active-player rules");
    });

    it("BHV-056: after reconnect, client receives state sync and continues turn correctly", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-056-state-sync";
      const { p1, p1Legion } = setupTwoPlayerGame(gameId);

      const game = engine.getGame(gameId)!;
      game.phase = Phase.MOVE;
      game.activePlayer = p1.player.id;
      game.dieRoll = null;
      game.movedLegionsThisTurn = [];
      engine.forceRollForMove(gameId, p1.player.id, 1);

      logger.logPhase("MOVE", "Rejoin, read synced state, and perform next legal move");
      const rejoin = engine.rejoinGame(gameId, "key", "client-1");
      expect(rejoin).not.toBeNull();

      const syncedLegion = rejoin!.gameState.players.get(p1.player.id)!.legions.find((l) => l.id === p1Legion.id)!;
      const sourceTile = syncedLegion.tile;
      const destination = getValidDestinations(sourceTile, 1)[0] as TileId;
      expect(destination).toBeTruthy();

      const moved = engine.moveLegion(gameId, p1Legion.id, sourceTile, destination);
      expect(moved).not.toBeNull();

      const updated = engine.getGame(gameId)!;
      const movedLegion = updated.players.get(p1.player.id)!.legions.find((l) => l.id === p1Legion.id)!;
      expect(movedLegion.tile).toBe(destination);

      logger.logResult(true, "BHV-056: State sync and continued turn action succeeded after reconnect");
    });

    it("BHV-057: in-progress games appear in listActiveGames with player list", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-057-list-in-progress";

      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      engine.joinGame(gameId, "key", "client-2");
      engine.addPlayer(gameId, "client-1", "Alice", "#FF0000", "100");
      engine.addPlayer(gameId, "client-2", "Bob", "#00FF00", "200");
      engine.startGame(gameId, "master");

      logger.logPhase("SPLIT", "Listing active games after game has started");
      const listed = engine.listActiveGames();

      const summary = listed.find((g) => g.gameId === gameId);
      expect(summary).not.toBeUndefined();
      expect(summary!.phase).not.toBe("LOBBY");
      expect(summary!.players).toBe(2);
      expect(summary!.playerList).toHaveLength(2);

      const names = summary!.playerList.map((p) => p.name);
      expect(names).toContain("Alice");
      expect(names).toContain("Bob");

      const colors = summary!.playerList.map((p) => p.color);
      expect(colors).toContain("#FF0000");
      expect(colors).toContain("#00FF00");

      logger.logResult(true, "BHV-057: In-progress game appears in listing with full player list");
    });

    it("BHV-058: reclaim join by player name and color succeeds in active game", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-058-reclaim-by-name-color";

      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      engine.joinGame(gameId, "key", "client-2");
      const p1 = engine.addPlayer(gameId, "client-1", "Alice", "#FF0000", "100")!;
      engine.addPlayer(gameId, "client-2", "Bob", "#00FF00", "200");
      engine.startGame(gameId, "master");

      logger.logPhase("SPLIT", "Claiming Alice's seat from a new browser session");
      const result = engine.joinGame(gameId, "key", "new-browser-client", "Alice", "#FF0000");

      expect(result).not.toBeNull();
      expect(result!.playerId).toBe(p1.player.id);
      expect(result!.clientId).toBe("new-browser-client");
      expect(result!.displacedClientId).toBe("client-1");

      logger.logResult(true, "BHV-058: Reclaim by name+color succeeded; old session displaced");
    });

    it("BHV-059: reclaim join with wrong color is rejected in active game", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-059-reclaim-wrong-color";

      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      engine.joinGame(gameId, "key", "client-2");
      engine.addPlayer(gameId, "client-1", "Alice", "#FF0000", "100");
      engine.addPlayer(gameId, "client-2", "Bob", "#00FF00", "200");
      engine.startGame(gameId, "master");

      logger.logPhase("SPLIT", "Attempting to claim Alice's seat with a wrong color");
      const result = engine.joinGame(gameId, "key", "new-browser-client", "Alice", "#0000FF");

      expect(result).toBeNull();

      logger.logResult(true, "BHV-059: Reclaim with mismatched color was rejected");
    });

    it("BHV-060: reclaimed player retains legions and game state after takeover", () => {
      const logger = createLogger("VERBOSE");
      const gameId = "bhv-060-reclaim-state-intact";

      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      engine.joinGame(gameId, "key", "client-2");
      const p1 = engine.addPlayer(gameId, "client-1", "Alice", "#FF0000", "100")!;
      engine.addPlayer(gameId, "client-2", "Bob", "#00FF00", "200");
      engine.startGame(gameId, "master");

      const beforeGame = engine.getGame(gameId)!;
      const beforeLegions = beforeGame.players.get(p1.player.id)!.legions;
      expect(beforeLegions.length).toBeGreaterThan(0);

      logger.logPhase("SPLIT", "Reclaiming seat; verifying legions are unchanged");
      const result = engine.joinGame(gameId, "key", "new-browser-client", "Alice", "#FF0000");

      expect(result).not.toBeNull();
      const afterGame = result!.gameState;
      const afterLegions = afterGame.players.get(p1.player.id)!.legions;

      expect(afterLegions.length).toBe(beforeLegions.length);
      expect(afterLegions[0].id).toBe(beforeLegions[0].id);
      expect(afterLegions[0].creatures.length).toBe(beforeLegions[0].creatures.length);

      logger.logResult(true, "BHV-060: Reclaimed player's legions and state are fully intact");
    });
  });

  describe("Terrain-Specific Recruitment", () => {
    it("recruits Troll from Marsh terrain with forced die roll", () => {
      const logger = createLogger("VERBOSE");
      const create = engine.createGame("marsh-recruitment", "key", "master");
      const gameId = create!.gameId;

      const p1 = engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100")!;
      const p1Id = p1.player.id;

      engine.startGame(gameId, "master");

      const game = engine.getGame(gameId)!;
      const player = game.players.get(p1Id)!;
      const originalLegion = player.legions[0];
      const legionId = originalLegion.id;
      const startTile = originalLegion.tile;

      // Split phase
      const splitPhaseCreatures = originalLegion.creatures.map((c) => c.type);
      logger.logPhase(
        "SPLIT",
        `Split [${splitPhaseCreatures.join(", ")}] into [${originalLegion.creatures
          .slice(0, 4)
          .map((c) => c.type)
          .join(", ")}] and [${originalLegion.creatures
          .slice(4, 8)
          .map((c) => c.type)
          .join(", ")}]`
      );

      const splitResult = engine.splitLegion(
        gameId,
        legionId,
        originalLegion.creatures.slice(0, 4),
        originalLegion.creatures.slice(4, 8),
        startTile
      );
      expect(splitResult).not.toBeNull();
      expect(originalLegion.creatures.length).toBe(4);

      engine.endPhase(gameId, p1Id);

      // Move phase
      engine.forceRollForMove(gameId, p1Id, 3);
      const moveState = engine.getGame(gameId)!;

      logger.logPhase("MOVE", "Rolled 3, moved Stack A to Tile 212 (MARSH terrain)");

      const marshTile = "212" as TileId;
      const moved = engine.moveLegion(gameId, legionId, startTile, marshTile);
      expect(moved).not.toBeNull();

      const tile = moved!.tiles.get(marshTile)!;
      expect(tile.terrainType).toBe(TerrainType.MARSH);

      engine.endPhase(gameId, p1Id);

      // Recruit phase
      const recruitState = engine.getGame(gameId)!;
      const updatedPlayer = recruitState.players.get(p1Id)!;
      const legion = updatedPlayer.legions.find((l) => l.id === legionId)!;

      const creatureTypes = legion.creatures.map((c) => c.type);
      const eligible = getEligibleRecruitments(TerrainType.MARSH, creatureTypes, 7);

      expect(eligible.length).toBeGreaterThan(0);
      expect(eligible).toContain(CreatureType.TROLL);

      logger.logPhase(
        "RECRUIT",
        `Stack has [${creatureTypes.join(", ")}], recruiting TROLL because we have 2 OGREs and can promote via Troll`
      );

      const result = engine.recruitCreature(gameId, legionId, CreatureType.TROLL);
      expect(result).not.toBeNull();
      expect(result?.creature.type).toBe(CreatureType.TROLL);

      logger.logResult(true, "Marsh recruitment: Split → Move to Marsh (roll 3) → Recruited Troll");
    });

    it("recruits Centaur from Plains terrain with forced die roll", () => {
      const logger = createLogger("VERBOSE");
      const create = engine.createGame("plains-recruitment", "key", "master");
      const gameId = create!.gameId;

      const p1 = engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100")!;
      const p1Id = p1.player.id;

      engine.startGame(gameId, "master");

      const game = engine.getGame(gameId)!;
      const player = game.players.get(p1Id)!;
      const originalLegion = player.legions[0];
      const legionId = originalLegion.id;
      const startTile = originalLegion.tile;

      // Split phase - keep Centaurs in original
      const initialCreatures = originalLegion.creatures.map((c) => c.type);
      logger.logPhase(
        "SPLIT",
        `Split [${initialCreatures.join(", ")}] into [${originalLegion.creatures
          .slice(4, 8)
          .map((c) => c.type)
          .join(", ")}] and [${originalLegion.creatures
          .slice(0, 4)
          .map((c) => c.type)
          .join(", ")}]`
      );

      const splitResult = engine.splitLegion(
        gameId,
        legionId,
        originalLegion.creatures.slice(4, 8), // Keep Centaurs + Trolls
        originalLegion.creatures.slice(0, 4), // New legion: Titan, Angel, Ogres
        startTile
      );
      expect(splitResult).not.toBeNull();
      expect(originalLegion.creatures.length).toBe(4);

      engine.endPhase(gameId, p1Id);

      // Move phase
      engine.forceRollForMove(gameId, p1Id, 1);
      const moveState = engine.getGame(gameId)!;

      logger.logPhase("MOVE", "Rolled 1, moved Stack B to Tile 312 (PLAINS terrain)");

      const plainsTile = "312" as TileId;
      const moved = engine.moveLegion(gameId, legionId, startTile, plainsTile);
      expect(moved).not.toBeNull();

      const tile = moved!.tiles.get(plainsTile)!;
      expect(tile.terrainType).toBe(TerrainType.PLAINS);

      engine.endPhase(gameId, p1Id);

      // Recruit phase
      const recruitState = engine.getGame(gameId)!;
      const updatedPlayer = recruitState.players.get(p1Id)!;
      const legion = updatedPlayer.legions.find((l) => l.id === legionId)!;

      const creatureTypes = legion.creatures.map((c) => c.type);
      const eligible = getEligibleRecruitments(TerrainType.PLAINS, creatureTypes, 7);

      expect(eligible.length).toBeGreaterThan(0);
      expect(eligible).toContain(CreatureType.CENTAUR);

      logger.logPhase(
        "RECRUIT",
        `Stack has [${creatureTypes.join(", ")}], recruiting CENTAUR because we have 2 CEONTAURs`
      );

      const result = engine.recruitCreature(gameId, legionId, CreatureType.CENTAUR);
      expect(result).not.toBeNull();
      expect(result?.creature.type).toBe(CreatureType.CENTAUR);

      logger.logResult(true, "Plains recruitment: Split → Move to Plains (roll 1) → Recruited Centaur");
    });
  });
});
