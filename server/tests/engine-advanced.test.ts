import { describe, it, expect, beforeEach } from "vitest";
import { GameEngine } from "../src/game/engine.js";
import { Phase, CreatureType, TerrainType, PlayerId } from "../src/types.js";

describe("GameEngine - Advanced Features", () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = new GameEngine();
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
