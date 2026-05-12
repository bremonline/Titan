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

describe("GameEngine - Advanced Features", () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = new GameEngine();
  });

  describe("Terrain-Specific Recruitment", () => {
    it("recruits Troll from Marsh terrain with forced die roll", () => {
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

      // Split legion from 8 to 4+4 so recruitment becomes possible (max is 7 but legion needs room)
      const splitResult = engine.splitLegion(
        gameId,
        legionId,
        originalLegion.creatures.slice(0, 4),
        originalLegion.creatures.slice(4, 8),
        startTile
      );
      expect(splitResult).not.toBeNull();

      console.log("[MARSH TEST] After split, legion 1 creatures:", originalLegion.creatures.map((c) => c.type));
      expect(originalLegion.creatures.length).toBe(4);

      engine.endPhase(gameId, p1Id); // SPLIT → MOVE
      engine.forceRollForMove(gameId, p1Id, 3); // Roll 3 from tower 100: [212 (MARSH), 321 (JUNGLE), 412]

      const moveState = engine.getGame(gameId)!;
      const dieRoll = moveState.dieRoll!;
      expect(dieRoll).toBe(3);

      const marshTile = "212" as TileId;
      const moved = engine.moveLegion(gameId, legionId, startTile, marshTile);
      expect(moved).not.toBeNull();

      const tile = moved!.tiles.get(marshTile)!;
      console.log("[MARSH TEST] Tile terrain:", tile.terrainType);
      expect(tile.terrainType).toBe(TerrainType.MARSH);

      engine.endPhase(gameId, p1Id); // MOVE → RECRUIT

      const recruitState = engine.getGame(gameId)!;
      const updatedPlayer = recruitState.players.get(p1Id)!;
      const legion = updatedPlayer.legions.find((l) => l.id === legionId)!;
      expect(legion).not.toBeUndefined();

      console.log("[MARSH TEST] Legion creatures in RECRUIT phase:", legion.creatures.map((c) => c.type));
      console.log("[MARSH TEST] Legion size:", legion.creatures.length);

      const eligible = getEligibleRecruitments(
        TerrainType.MARSH,
        legion.creatures.map((c) => c.type),
        7
      );

      console.log("[MARSH TEST] Eligible recruits:", eligible);
      expect(eligible.length).toBeGreaterThan(0);
      expect(eligible).toContain(CreatureType.TROLL);

      const result = engine.recruitCreature(gameId, legionId, CreatureType.TROLL);
      expect(result).not.toBeNull();
      expect(result?.creature.type).toBe(CreatureType.TROLL);
      expect(legion.creatures.length).toBe(5); // 4 + 1 recruited
    });

    it("recruits Centaur from Plains terrain with forced die roll", () => {
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

      // Split legion from 8 to 4+4 so recruitment becomes possible (max is 7 but legion needs room)
      // Original: [Titan, Angel, Ogre, Ogre, Troll, Troll, Centaur, Centaur]
      // Keep Centaurs in original by swapping split groups
      const splitResult = engine.splitLegion(
        gameId,
        legionId,
        originalLegion.creatures.slice(4, 8), // Original keeps: [Troll, Troll, Centaur, Centaur]
        originalLegion.creatures.slice(0, 4), // New legion: [Titan, Angel, Ogre, Ogre]
        startTile
      );
      expect(splitResult).not.toBeNull();

      console.log("[PLAINS TEST] After split, legion 1 creatures:", originalLegion.creatures.map((c) => c.type));
      expect(originalLegion.creatures.length).toBe(4);

      engine.endPhase(gameId, p1Id); // SPLIT → MOVE
      engine.forceRollForMove(gameId, p1Id, 1); // Roll 1 from tower 100: [312 (PLAINS), 314 (BRUSH), 414 (MARSH)]

      const moveState = engine.getGame(gameId)!;
      const dieRoll = moveState.dieRoll!;
      expect(dieRoll).toBe(1);

      const plainsTile = "312" as TileId;
      const moved = engine.moveLegion(gameId, legionId, startTile, plainsTile);
      expect(moved).not.toBeNull();

      const tile = moved!.tiles.get(plainsTile)!;
      console.log("[PLAINS TEST] Tile terrain:", tile.terrainType);
      expect(tile.terrainType).toBe(TerrainType.PLAINS);

      engine.endPhase(gameId, p1Id); // MOVE → RECRUIT

      const recruitState = engine.getGame(gameId)!;
      const updatedPlayer = recruitState.players.get(p1Id)!;
      const legion = updatedPlayer.legions.find((l) => l.id === legionId)!;
      expect(legion).not.toBeUndefined();

      console.log("[PLAINS TEST] Legion creatures in RECRUIT phase:", legion.creatures.map((c) => c.type));
      console.log("[PLAINS TEST] Legion size:", legion.creatures.length);

      const eligible = getEligibleRecruitments(
        TerrainType.PLAINS,
        legion.creatures.map((c) => c.type),
        7
      );

      console.log("[PLAINS TEST] Eligible recruits:", eligible);
      expect(eligible.length).toBeGreaterThan(0);
      expect(eligible).toContain(CreatureType.CENTAUR);

      const result = engine.recruitCreature(gameId, legionId, CreatureType.CENTAUR);
      expect(result).not.toBeNull();
      expect(result?.creature.type).toBe(CreatureType.CENTAUR);
      expect(legion.creatures.length).toBe(5); // 4 + 1 recruited
    });
  });

  describe("Turn Flow Scenario", () => {
    it("runs two-player split and three full turns with move and recruit phases", () => {
      const create = engine.createGame("three-turn-flow", "key", "master");
      expect(create).not.toBeNull();

      const gameId = create!.gameId;

      const p1 = engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100");
      const p2 = engine.addPlayer(gameId, "client-2", "Player 2", "#00FF00", "200");
      expect(p1).not.toBeNull();
      expect(p2).not.toBeNull();

      const p1Id = p1!.player.id;
      const p2Id = p2!.player.id;

      const started = engine.startGame(gameId, "master");
      expect(started?.phase).toBe(Phase.SPLIT);

      const splitIfNeeded = (playerId: PlayerId) => {
        const game = engine.getGame(gameId)!;
        const player = game.players.get(playerId)!;
        if (player.legions.length !== 1) {
          return;
        }

        const original = player.legions[0];
        expect(original.creatures.length).toBe(8);

        const splitTarget = getValidDestinations(original.tile, 1)[0] ?? original.tile;
        const result = engine.splitLegion(
          gameId,
          original.id,
          original.creatures.slice(0, 4),
          original.creatures.slice(4, 8),
          splitTarget
        );

        expect(result).not.toBeNull();
        expect(result?.originalLegion.creatures.length).toBe(4);
        expect(result?.newLegion.creatures.length).toBe(4);
      };

      const playTurn = (playerId: PlayerId) => {
        const splitState = engine.getGame(gameId)!;
        expect(splitState.phase).toBe(Phase.SPLIT);
        expect(splitState.activePlayer).toBe(playerId);

        splitIfNeeded(playerId);

        const afterSplit = engine.endPhase(gameId, playerId);
        expect(afterSplit?.phase).toBe(Phase.MOVE);

        const rolled = engine.rollForMove(gameId, playerId);
        expect(rolled?.phase).toBe(Phase.MOVE);
        expect(rolled?.dieRoll).not.toBeNull();

        const moveState = engine.getGame(gameId)!;
        const movingPlayer = moveState.players.get(playerId)!;
        const dieRoll = moveState.dieRoll!;

        let movedCount = 0;
        for (const legion of movingPlayer.legions) {
          const destinations = getValidDestinations(legion.tile, dieRoll);
          const destination = destinations.find((tileId) => {
            const tile = moveState.tiles.get(tileId);
            return !tile || tile.legions.length === 0;
          });

          if (!destination) {
            continue;
          }

          const moved = engine.moveLegion(gameId, legion.id, legion.tile, destination);
          if (moved) {
            movedCount += 1;
          }
        }

        expect(movedCount).toBeGreaterThan(0);

        const afterMove = engine.endPhase(gameId, playerId);
        expect([Phase.RECRUIT, Phase.FIGHT]).toContain(afterMove?.phase as Phase);

        if (afterMove?.phase === Phase.FIGHT) {
          const afterFight = engine.endPhase(gameId, playerId);
          expect(afterFight?.phase).toBe(Phase.RECRUIT);
        }

        const recruitState = engine.getGame(gameId)!;
        const recruitingPlayer = recruitState.players.get(playerId)!;

        let recruited = false;
        for (const movedLegionId of [...recruitState.movedLegionsThisTurn]) {
          const legion = recruitingPlayer.legions.find((candidate) => candidate.id === movedLegionId);
          if (!legion) {
            continue;
          }

          let tile = recruitState.tiles.get(legion.tile);
          if (!tile) {
            continue;
          }

          let eligible = getEligibleRecruitments(
            tile.terrainType,
            legion.creatures.map((creature) => creature.type),
            7
          );

          if (eligible.length === 0) {
            const placed = engine.placeLegionForTest(gameId, legion.id, recruitingPlayer.towerAssignment!);
            if (!placed) {
              continue;
            }

            const refreshed = engine.getGame(gameId)!;
            const refreshedPlayer = refreshed.players.get(playerId)!;
            const refreshedLegion = refreshedPlayer.legions.find((candidate) => candidate.id === movedLegionId);
            if (!refreshedLegion) {
              continue;
            }

            tile = refreshed.tiles.get(refreshedLegion.tile);
            if (!tile) {
              continue;
            }

            eligible = getEligibleRecruitments(
              tile.terrainType,
              refreshedLegion.creatures.map((creature) => creature.type),
              7
            );
          }

          if (eligible.length === 0) {
            continue;
          }

          const result = engine.recruitCreature(gameId, legion.id, eligible[0]);
          if (result) {
            recruited = true;
            break;
          }
        }

        expect(recruited).toBe(true);

        const endTurn = engine.endPhase(gameId, playerId);
        expect(endTurn?.phase).toBe(Phase.SPLIT);
      };

      playTurn(p1Id);
      playTurn(p2Id);
      playTurn(p1Id);

      const finalState = engine.getGame(gameId)!;
      expect(finalState.phase).toBe(Phase.SPLIT);
      expect(finalState.activePlayer).toBe(p2Id);

      const p1LegionCount = finalState.players.get(p1Id)?.legions.length ?? 0;
      const p2LegionCount = finalState.players.get(p2Id)?.legions.length ?? 0;
      expect(p1LegionCount).toBeGreaterThanOrEqual(2);
      expect(p2LegionCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Rejoin Game", () => {
    it("allows known client to rejoin with correct key", () => {
      const create = engine.createGame("rejoin-game", "key", "master");
      const gameId = create!.gameId;
      const player = engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100")!;
      const playerId = player.player.id;

      const result = engine.rejoinGame(gameId, "key", "master");
      expect(result?.playerId).toBe(playerId);
      expect(result?.isGameMaster).toBe(true);
    });

    it("returns null when rejoining with wrong key", () => {
      engine.createGame("rejoin-game", "correct-key", "master");
      const result = engine.rejoinGame("rejoin-game", "wrong-key", "master");
      expect(result).toBeNull();
    });

    it("allows rejoin after game started", () => {
      const create = engine.createGame("rejoin-started", "key", "master");
      const gameId = create!.gameId;
      const player = engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100")!;
      const playerId = player.player.id;
      engine.startGame(gameId, "master");

      const result = engine.rejoinGame(gameId, "key", "master");
      expect(result?.gameState.phase).toBe(Phase.SPLIT);
      expect(result?.playerId).toBe(playerId);
    });

    it("returns null when non-gamemaster tries rejoin without player mapping", () => {
      const create = engine.createGame("rejoin-auth", "key", "master");
      const gameId = create!.gameId;
      engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100");
      engine.startGame(gameId, "master");

      const result = engine.rejoinGame(gameId, "key", "unknown-client");
      expect(result).toBeNull();
    });
  });

  describe("Legion Movement (MOVE phase)", () => {
    let gameId: string;
    let playerId: PlayerId;
    let legionId: string;

    beforeEach(() => {
      const create = engine.createGame("move-game", "key", "master");
      gameId = create!.gameId;
      const player = engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100")!;
      playerId = player.player.id;
      engine.startGame(gameId, "master");

      const game = engine.getGame(gameId)!;
      game.phase = Phase.MOVE;
      game.dieRoll = 2;
      legionId = game.players.get(playerId)!.legions[0].id;
    });

    it("moves legion to valid destination with die roll", () => {
      const result = engine.moveLegion(gameId, legionId, "100", "211");
      expect(result).not.toBeNull();
      expect(result?.tiles.get("211")?.legions.length).toBe(1);
    });

    it("returns null when moving during wrong phase", () => {
      const game = engine.getGame(gameId)!;
      game.phase = Phase.SPLIT;
      const result = engine.moveLegion(gameId, legionId, "100", "312");
      expect(result).toBeNull();
    });

    it("returns null when no die roll set", () => {
      const game = engine.getGame(gameId)!;
      game.dieRoll = null;
      const result = engine.moveLegion(gameId, legionId, "100", "312");
      expect(result).toBeNull();
    });

    it("returns null when legion already moved this turn", () => {
      const game = engine.getGame(gameId)!;
      game.movedLegionsThisTurn.push(legionId);
      const result = engine.moveLegion(gameId, legionId, "100", "312");
      expect(result).toBeNull();
    });

    it("returns null when destination not in valid move set", () => {
      // Roll 2 from 100 allows [211, 315, 413], not 999
      const result = engine.moveLegion(gameId, legionId, "100", "999");
      expect(result).toBeNull();
    });

    it("returns null when destination already occupied", () => {
      const game = engine.getGame(gameId)!;
      // Place a dummy legion on destination
      const dummyLegion = {
        id: "dummy-1",
        playerId,
        tile: "312",
        creatures: [],
      };
      if (!game.tiles.has("312")) {
        game.tiles.set("312", {
          id: "312",
          terrainType: TerrainType.PLAINS,
          legions: [dummyLegion],
        });
      }

      const result = engine.moveLegion(gameId, legionId, "100", "312");
      expect(result).toBeNull();
    });

    it("returns null when legion source tile mismatch", () => {
      const game = engine.getGame(gameId)!;
      const legion = game.players.get(playerId)!.legions[0];
      const result = engine.moveLegion(gameId, legion.id, "999", "312");
      expect(result).toBeNull();
    });

    it("tracks moved legion in movedLegionsThisTurn", () => {
      const result = engine.moveLegion(gameId, legionId, "100", "211");
      expect(result?.movedLegionsThisTurn).toContain(legionId);
    });

    it("stops at first enemy distance even with higher die roll", () => {
      // Test the fix for: roll a 5 but enemy at die=1 distance should force stop at die=1
      const game = engine.getGame(gameId)!;
      
      // Place moving legion at tile 100
      const sourceTile = "100";
      const legion = game.players.get(playerId)!.legions[0];
      legion.tile = sourceTile as TileId;
      game.tiles.clear();
      game.tiles.set(sourceTile as TileId, {
        id: sourceTile as TileId,
        terrainType: TerrainType.TOWER,
        legions: [legion],
      });

      // Get valid destinations for die=1 from tile 100
      const die1Destinations = getValidDestinations(sourceTile as TileId, 1);
      expect(die1Destinations.length).toBeGreaterThan(0);
      const die1EnemyTile = die1Destinations[0]; // First destination at die=1
      
      // Place enemy at the die=1 destination
      const enemyLegion = {
        id: "enemy-1",
        playerId: "enemy-player",
        tile: die1EnemyTile,
        creatures: [],
      };
      game.tiles.set(die1EnemyTile, {
        id: die1EnemyTile,
        terrainType: TerrainType.PLAINS,
        legions: [enemyLegion],
      });

      // Force a roll of 5
      game.dieRoll = 5;
      
      // Get a destination for die=5 that's different from die=1
      const die5Destinations = getValidDestinations(sourceTile as TileId, 5);
      const die5TargetTile = die5Destinations.find((t) => t !== die1EnemyTile) ?? die5Destinations[0];
      
      // Attempt to move to die=5 destination, but should be stopped at die=1 enemy
      const result = engine.moveLegion(gameId, legionId, sourceTile as TileId, die5TargetTile);
      expect(result).not.toBeNull();
      
      // Verify the legion is at the die=1 enemy tile, not at the die=5 target
      const updatedGame = engine.getGame(gameId)!;
      const movedLegion = updatedGame.players.get(playerId)!.legions[0];
      expect(movedLegion.tile).toBe(die1EnemyTile);
      expect(movedLegion.tile).not.toBe(die5TargetTile);
    });

    it("stops on enemy stack if moving path crosses enemy before destination", () => {
      const game = engine.getGame(gameId)!;

      // Enemy stack placed on a likely intermediate tile from 100 toward 211.
      const enemyLegion = {
        id: "enemy-1",
        playerId: "enemy-player",
        tile: "312",
        creatures: [],
      };
      game.tiles.set("312", {
        id: "312",
        terrainType: TerrainType.PLAINS,
        legions: [enemyLegion],
      });

      const result = engine.moveLegion(gameId, legionId, "100", "211");
      expect(result).not.toBeNull();
      expect(game.players.get(playerId)!.legions[0].tile).toBe("312");
      expect(game.tiles.get("312")?.legions.length).toBeGreaterThanOrEqual(2);
      expect(game.tiles.get("211")?.legions.some((l) => l.id === legionId) ?? false).toBe(false);
    });
  });

  describe("Creature Recruitment (RECRUIT phase)", () => {
    let gameId: string;
    let playerId: PlayerId;
    let legionId: string;

    beforeEach(() => {
      const create = engine.createGame("recruit-game", "key", "master");
      gameId = create!.gameId;
      const player = engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100")!;
      playerId = player.player.id;
      engine.startGame(gameId, "master");

      const game = engine.getGame(gameId)!;
      game.phase = Phase.RECRUIT;
      game.activePlayer = playerId;
      legionId = game.players.get(playerId)!.legions[0].id;
      game.movedLegionsThisTurn.push(legionId);
    });

    it("returns null when recruiting during wrong phase", () => {
      const game = engine.getGame(gameId)!;
      game.phase = Phase.MOVE;
      const result = engine.recruitCreature(gameId, legionId, CreatureType.OGRE);
      expect(result).toBeNull();
    });

    it("returns null when legion did not move this turn", () => {
      const game = engine.getGame(gameId)!;
      game.movedLegionsThisTurn = [];
      const result = engine.recruitCreature(gameId, legionId, CreatureType.OGRE);
      expect(result).toBeNull();
    });

    it("returns null when legion at max size (7)", () => {
      const game = engine.getGame(gameId)!;
      const legion = game.players.get(playerId)!.legions[0];
      legion.creatures = legion.creatures.slice(0, 7);

      const result = engine.recruitCreature(gameId, legionId, CreatureType.OGRE);
      expect(result).toBeNull();
    });

    it("returns null when creature not eligible for terrain", () => {
      const result = engine.recruitCreature(gameId, legionId, CreatureType.DRAGON);
      expect(result).toBeNull();
    });
  });

  describe("Battle Resolution (FIGHT phase)", () => {
    let gameId: string;
    let p1Id: PlayerId;
    let p2Id: PlayerId;
    let p1LegionId: string;
    let p2LegionId: string;

    beforeEach(() => {
      const create = engine.createGame("battle-game", "key", "master");
      gameId = create!.gameId;
      const p1 = engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100")!;
      const p2 = engine.addPlayer(gameId, "c2", "Player 2", "#00FF00", "200")!;
      p1Id = p1.player.id;
      p2Id = p2.player.id;

      engine.startGame(gameId, "master");

      const game = engine.getGame(gameId)!;
      game.phase = Phase.FIGHT;

      p1LegionId = game.players.get(p1Id)!.legions[0].id;
      p2LegionId = game.players.get(p2Id)!.legions[0].id;

      // Place both legions on same tile
      const battleTile = "312";
      const p1Legion = game.players.get(p1Id)!.legions[0];
      const p2Legion = game.players.get(p2Id)!.legions[0];
      p1Legion.tile = battleTile;
      p2Legion.tile = battleTile;

      if (!game.tiles.has(battleTile)) {
        game.tiles.set(battleTile, {
          id: battleTile,
          terrainType: TerrainType.PLAINS,
          legions: [p1Legion, p2Legion],
        });
      } else {
        game.tiles.get(battleTile)!.legions = [p1Legion, p2Legion];
      }
    });

    it("resolves battle with attacker victory", () => {
      const game = engine.getGame(gameId)!;
      const p1Legion = game.players.get(p1Id)!.legions[0];
      const p2Legion = game.players.get(p2Id)!.legions[0];

      const result = engine.resolveBattle(
        gameId,
        p1Id,
        "312",
        p2LegionId,
        p1LegionId,
        [], // p2 loses all
        p1Legion.creatures // p1 survives
      );


      expect(result?.winnerPlayerId).toBe(p1Id);
      expect(result?.tie).toBe(false);
    });

    describe("Forced Battle Setup", () => {
      it("forces two players into FIGHT on a chosen tile", () => {
        const create = engine.createGame("force-battle", "key", "master");
        const gameId = create!.gameId;
        const first = engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100")!;
        const second = engine.addPlayer(gameId, "client-2", "Player 2", "#00FF00", "200")!;
        engine.startGame(gameId, "master");

        const result = engine.forceBattle(gameId, first.player.id, second.player.id, "211");

        expect(result).not.toBeNull();
        expect(result?.game.phase).toBe(Phase.FIGHT);
        expect(result?.game.activePlayer).toBe(first.player.id);
        expect(result?.battleTileId).toBe("211");
        expect(result?.game.tiles.get("211")?.legions.map((legion) => legion.id)).toEqual([
          result?.defenderLegionId,
          result?.attackerLegionId,
        ]);
      });

      it("returns null when one selected player has no legion", () => {
        const create = engine.createGame("force-battle-invalid", "key", "master");
        const gameId = create!.gameId;
        const first = engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100")!;
        const second = engine.addPlayer(gameId, "client-2", "Player 2", "#00FF00", "200")!;
        engine.startGame(gameId, "master");

        const game = engine.getGame(gameId)!;
        second.player.legions = [];
        game.players.get(second.player.id)!.legions = [];

        const result = engine.forceBattle(gameId, first.player.id, second.player.id, "211");
        expect(result).toBeNull();
      });

      it("resolves forced battle and does not loop back into FIGHT", () => {
        const create = engine.createGame("force-battle-resolve", "key", "master");
        const gameId = create!.gameId;
        const first = engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100")!;
        const second = engine.addPlayer(gameId, "client-2", "Player 2", "#00FF00", "200")!;
        engine.startGame(gameId, "master");

        const forced = engine.forceBattle(gameId, first.player.id, second.player.id, "211");
        expect(forced).not.toBeNull();

        const forcedGame = forced!.game;
        const attackerLegion = forcedGame.tiles
          .get("211")!
          .legions.find((legion) => legion.id === forced!.attackerLegionId)!;

        const resolved = engine.resolveBattle(
          gameId,
          first.player.id,
          "211",
          forced!.defenderLegionId,
          forced!.attackerLegionId,
          [],
          attackerLegion.creatures
        );

        expect(resolved).not.toBeNull();
        expect(resolved!.game.phase).toBe(Phase.RECRUIT);

        const tileAfter = resolved!.game.tiles.get("211")!;
        expect(tileAfter.legions.length).toBe(1);
        expect(new Set(tileAfter.legions.map((legion) => legion.playerId)).size).toBe(1);

        // If contested stacks were not removed correctly, MOVE->endPhase would re-enter FIGHT.
        resolved!.game.phase = Phase.MOVE;
        resolved!.game.activePlayer = first.player.id;
        resolved!.game.dieRoll = 1;
        const afterMoveEnd = engine.endPhase(gameId, first.player.id);
        expect(afterMoveEnd?.phase).toBe(Phase.RECRUIT);
      });
    });

    it("resolves battle with defender victory", () => {
      const game = engine.getGame(gameId)!;
      const p1Legion = game.players.get(p1Id)!.legions[0];
      const p2Legion = game.players.get(p2Id)!.legions[0];

      const result = engine.resolveBattle(
        gameId,
        p1Id,
        "312",
        p2LegionId,
        p1LegionId,
        p2Legion.creatures, // p2 survives
        [] // p1 loses all
      );

      expect(result?.winnerPlayerId).toBe(p2Id);
      expect(result?.tie).toBe(false);
    });

    it("resolves battle as tie when both lose all units", () => {
      const result = engine.resolveBattle(
        gameId,
        p1Id,
        "312",
        p2LegionId,
        p1LegionId,
        [], // both lose
        []
      );

      expect(result?.tie).toBe(true);
      expect(result?.winnerPlayerId).toBeNull();
    });

    it("returns null when battle outside FIGHT phase", () => {
      const game = engine.getGame(gameId)!;
      game.phase = Phase.SPLIT;

      const result = engine.resolveBattle(
        gameId,
        p1Id,
        "312",
        p2LegionId,
        p1LegionId,
        [],
        []
      );
      expect(result).toBeNull();
    });

    it("returns null when same player is both attacker and defender", () => {
      const game = engine.getGame(gameId)!;
      const result = engine.resolveBattle(
        gameId,
        p1Id,
        "312",
        p1LegionId, // same player
        p1LegionId,
        [],
        []
      );
      expect(result).toBeNull();
    });

    it("returns null when both legions have units (not resolved)", () => {
      const game = engine.getGame(gameId)!;
      const p1Legion = game.players.get(p1Id)!.legions[0];
      const p2Legion = game.players.get(p2Id)!.legions[0];

      const result = engine.resolveBattle(
        gameId,
        p1Id,
        "312",
        p2LegionId,
        p1LegionId,
        p2Legion.creatures, // both survive
        p1Legion.creatures
      );
      expect(result).toBeNull();
    });

    it("tracks Titan kills and eliminates player", () => {
      const game = engine.getGame(gameId)!;
      const p1Legion = game.players.get(p1Id)!.legions[0];

      const result = engine.resolveBattle(
        gameId,
        p1Id,
        "312",
        p2LegionId,
        p1LegionId,
        [], // p2 loses all including Titan
        p1Legion.creatures
      );

      expect(result?.titanKilledPlayerIds).toContain(p2Id);

      const updatedP2 = game.players.get(p2Id)!;
      expect(updatedP2.status).toBe("ELIMINATED");
      expect(updatedP2.legions.length).toBe(0);
    });

    it("awards points for non-Titan victory", () => {
      const game = engine.getGame(gameId)!;
      const p1Legion = game.players.get(p1Id)!.legions[0];
      const p2Legion = game.players.get(p2Id)!.legions[0];

      const result = engine.resolveBattle(
        gameId,
        p1Id,
        "312",
        p2LegionId,
        p1LegionId,
        [],
        p1Legion.creatures
      );

      expect(result?.pointsAwarded).toBe(p2Legion.creatures.reduce((sum, c) => sum + c.power * c.skill, 0));
    });

    it("ends game when last active player remains after Titan kill", () => {
      const result = engine.resolveBattle(
        gameId,
        p1Id,
        "312",
        p2LegionId,
        p1LegionId,
        [], // p2 loses all
        engine.getGame(gameId)!.players.get(p1Id)!.legions[0].creatures
      );

      expect(result?.gameWonByPlayerId).toBe(p1Id);
    });

    it("ends game when only one player has a Titan remaining", () => {
      const game = engine.getGame(gameId)!;
      const p1Legion = game.players.get(p1Id)!.legions[0];
      const p2Legion = game.players.get(p2Id)!.legions[0];

      // Simulate broken/inconsistent state where Blue has no Titan but is still marked ACTIVE.
      p2Legion.creatures = p2Legion.creatures.filter((creature) => creature.type !== CreatureType.TITAN);

      const result = engine.resolveBattle(
        gameId,
        p1Id,
        "312",
        p2LegionId,
        p1LegionId,
        [],
        p1Legion.creatures
      );

      expect(result).not.toBeNull();
      expect(result?.titanKilledPlayerIds).not.toContain(p2Id);
      expect(result?.gameWonByPlayerId).toBe(p1Id);
      expect(result?.game.players.get(p2Id)?.status).toBe("ELIMINATED");
    });

    it("transitions to RECRUIT phase after battle", () => {
      const game = engine.getGame(gameId)!;
      const p1Legion = game.players.get(p1Id)!.legions[0];

      engine.resolveBattle(
        gameId,
        p1Id,
        "312",
        p2LegionId,
        p1LegionId,
        [],
        p1Legion.creatures
      );

      expect(game.phase).toBe(Phase.RECRUIT);
    });
  });

  describe("Admin Stack Placement", () => {
    it("places a selected legion on a chosen tile", () => {
      const create = engine.createGame("place-stack", "key", "master");
      const gameId = create!.gameId;
      const first = engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100")!;
      engine.startGame(gameId, "master");

      const legionId = first.player.legions[0].id;
      const result = engine.placeLegionForTest(gameId, legionId, "211");

      expect(result).not.toBeNull();
      expect(result?.sourceTile).toBe("100");
      expect(result?.targetTile).toBe("211");
      expect(result?.game.tiles.get("211")?.legions.map((legion) => legion.id)).toContain(legionId);
      expect(result?.game.tiles.get("100")?.legions.map((legion) => legion.id) || []).not.toContain(legionId);
    });

    it("returns null for an invalid target tile", () => {
      const create = engine.createGame("place-stack-invalid", "key", "master");
      const gameId = create!.gameId;
      const first = engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100")!;
      engine.startGame(gameId, "master");

      const result = engine.placeLegionForTest(gameId, first.player.legions[0].id, "999");
      expect(result).toBeNull();
    });
  });

  describe("Game Serialization", () => {
    it("serializes game state to JSON-safe format", () => {
      const create = engine.createGame("serialize-game", "key", "master");
      const gameId = create!.gameId;
      engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100");
      engine.startGame(gameId, "master");

      const game = engine.getGame(gameId)!;
      const serialized = engine.serializeGame(game);

      // Maps should be converted to objects
      expect(serialized.players).toBeInstanceOf(Object);
      expect(serialized.tiles).toBeInstanceOf(Object);
      expect(typeof serialized.players).toBe("object");
    });
  });

  describe("Error Conditions", () => {
    it("returns null for non-existent game operations", () => {
      const result = engine.endPhase("nonexistent", "player-1");
      expect(result).toBeNull();
    });

    it("returns null when wrong player tries to end phase", () => {
      const create = engine.createGame("auth-game", "key", "master");
      const gameId = create!.gameId;
      const player = engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100")!;
      engine.startGame(gameId, "master");

      const result = engine.endPhase(gameId, "wrong-player-id");
      expect(result).toBeNull();
    });

    it("retrieves game by normalized ID", () => {
      const create = engine.createGame("test-game", "key", "master");
      const normalizedId = create!.gameId;
      const game = engine.getGame(normalizedId);
      expect(game).not.toBeNull();
    });
  });
});
