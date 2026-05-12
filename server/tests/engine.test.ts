import { describe, it, expect, beforeEach } from "vitest";
import { GameEngine } from "../src/game/engine.js";
import { Phase, CreatureType, TerrainType, PlayerId } from "../src/types.js";

describe("GameEngine", () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = new GameEngine();
  });

  describe("Game Creation & Joining", () => {
    it("creates a new game with valid parameters", () => {
      const result = engine.createGame("test-game", "secret-key", "client-1");
      expect(result).not.toBeNull();
      expect(result?.gameId).toBe("test-game");
      expect(result?.isGameMaster).toBe(true);
    });

    it("returns null for empty game ID", () => {
      const result = engine.createGame("", "secret-key", "client-1");
      expect(result).toBeNull();
    });

    it("returns null when game already exists", () => {
      engine.createGame("duplicate-game", "key1", "client-1");
      const result = engine.createGame("duplicate-game", "key2", "client-2");
      expect(result).toBeNull();
    });

    it("normalizes game IDs by trimming whitespace", () => {
      const result = engine.createGame("  spaced  game  ", "key", "client-1");
      expect(result?.gameId).toBe("spaced-game");
    });

    it("joins an existing game with correct key", () => {
      engine.createGame("join-game", "correct-key", "master");
      const result = engine.joinGame("join-game", "correct-key", "client-2");
      expect(result).not.toBeNull();
      expect(result?.clientId).toBe("client-2");
      expect(result?.isGameMaster).toBe(false);
    });

    it("returns null when joining with wrong key", () => {
      engine.createGame("join-game", "correct-key", "master");
      const result = engine.joinGame("join-game", "wrong-key", "client-2");
      expect(result).toBeNull();
    });

    it("returns null when joining non-existent game", () => {
      const result = engine.joinGame("nonexistent", "key", "client-1");
      expect(result).toBeNull();
    });

    it("returns null when joining after game started", () => {
      const create = engine.createGame("full-game", "key", "master");
      engine.addPlayer("full-game", "master", "Player 1", "#FF0000", "100");
      engine.startGame("full-game", "master");
      const result = engine.joinGame("full-game", "key", "client-2");
      expect(result).toBeNull();
    });

    it("allows reclaim join in started game with matching player name and color", () => {
      const gameId = "started-reclaim";
      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      const added = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;
      engine.startGame(gameId, "master");

      const reclaimed = engine.joinGame(gameId, "key", "client-2", "Player 1", "#FF0000");
      expect(reclaimed).not.toBeNull();
      expect(reclaimed?.playerId).toBe(added.player.id);
      expect(reclaimed?.displacedClientId).toBe("client-1");
    });

    it("rejects reclaim join in started game when name/color does not match", () => {
      const gameId = "started-reclaim-invalid";
      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100");
      engine.startGame(gameId, "master");

      const reclaimed = engine.joinGame(gameId, "key", "client-2", "Player 1", "#00FF00");
      expect(reclaimed).toBeNull();
    });

    it("allows cross-client rejoin with a valid reconnect transfer token", () => {
      const gameId = "reconnect-transfer";
      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      const added = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;
      engine.startGame(gameId, "master");

      const issued = engine.issueReconnectToken(gameId, "key", "client-1");
      expect(issued).not.toBeNull();

      const rejoin = engine.rejoinGame(gameId, "key", "other-client", issued!.transferToken);
      expect(rejoin).not.toBeNull();
      expect(rejoin?.playerId).toBe(added.player.id);
      expect(rejoin?.clientId).toBe("other-client");

      const oldClientRejoin = engine.rejoinGame(gameId, "key", "client-1");
      expect(oldClientRejoin).toBeNull();
    });

    it("rejects reconnect transfer token reuse", () => {
      const gameId = "reconnect-transfer-single-use";
      engine.createGame(gameId, "key", "master");
      engine.joinGame(gameId, "key", "client-1");
      const added = engine.addPlayer(gameId, "client-1", "Player 1", "#FF0000", "100")!;

      const issued = engine.issueReconnectToken(gameId, "key", "client-1");
      expect(issued).not.toBeNull();

      const firstUse = engine.rejoinGame(gameId, "key", "other-client", issued!.transferToken);
      expect(firstUse).not.toBeNull();
      expect(firstUse?.playerId).toBe(added.player.id);

      const secondUse = engine.rejoinGame(gameId, "key", "third-client", issued!.transferToken);
      expect(secondUse).toBeNull();
    });
  });

  describe("Player Management", () => {
    let gameId: string;

    beforeEach(() => {
      const result = engine.createGame("player-test", "key", "master");
      gameId = result!.gameId;
    });

    it("adds a player to a game", () => {
      const result = engine.addPlayer(gameId, "master", "Alice", "#FF0000", "100");
      expect(result).not.toBeNull();
      expect(result?.player.name).toBe("Alice");
      expect(result?.player.towerAssignment).toBe("100");
    });

    it("returns null when adding player to non-existent game", () => {
      const result = engine.addPlayer("nonexistent", "client", "Bob", "#00FF00", "200");
      expect(result).toBeNull();
    });

    it("returns null when adding player with duplicate color", () => {
      engine.addPlayer(gameId, "client-1", "Alice", "#FF0000", "100");
      const result = engine.addPlayer(gameId, "client-2", "Bob", "#FF0000", "200");
      expect(result).toBeNull();
    });

    it("returns null when tower is already taken", () => {
      engine.addPlayer(gameId, "client-1", "Alice", "#FF0000", "100");
      const result = engine.addPlayer(gameId, "client-2", "Bob", "#00FF00", "100");
      expect(result).toBeNull();
    });

    it("returns null when tower is invalid", () => {
      const result = engine.addPlayer(gameId, "client-1", "Alice", "#FF0000", "999");
      expect(result).toBeNull();
    });

    it("returns null when same client joins twice", () => {
      engine.addPlayer(gameId, "client-1", "Alice", "#FF0000", "100");
      const result = engine.addPlayer(gameId, "client-1", "Alice", "#00FF00", "200");
      expect(result).toBeNull();
    });

    it("lists active games in LOBBY phase", () => {
      engine.createGame("lobby-game-1", "key1", "master1");
      engine.createGame("lobby-game-2", "key2", "master2");
      const games = engine.listActiveGames();
      expect(games.length).toBeGreaterThanOrEqual(2);
      expect(games[0].phase).toBe(Phase.LOBBY);
    });
  });

  describe("Game Initialization & Phases", () => {
    it("starts game and transitions to SPLIT phase", () => {
      const create = engine.createGame("start-game", "key", "master");
      const gameId = create!.gameId;
      engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100");
      const result = engine.startGame(gameId, "master");
      expect(result?.phase).toBe(Phase.SPLIT);
      expect(result?.activePlayer).not.toBeNull();
    });

    it("returns null when starting game with no players", () => {
      const create = engine.createGame("empty-game", "key", "master");
      const gameId = create!.gameId;
      const result = engine.startGame(gameId, "master");
      expect(result).toBeNull();
    });

    it("returns null when non-game-master starts game", () => {
      const create = engine.createGame("auth-game", "key", "master");
      const gameId = create!.gameId;
      engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100");
      const result = engine.startGame(gameId, "other-client");
      expect(result).toBeNull();
    });

    it("returns null when starting game that already started", () => {
      const create = engine.createGame("double-start", "key", "master");
      const gameId = create!.gameId;
      engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100");
      engine.startGame(gameId, "master");
      const result = engine.startGame(gameId, "master");
      expect(result).toBeNull();
    });

    it("creates initial legion with 8 creatures on game start", () => {
      const create = engine.createGame("legion-game", "key", "master");
      const gameId = create!.gameId;
      engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100");
      const started = engine.startGame(gameId, "master");
      const game = engine.getGame(gameId);
      const players = Array.from(game!.players.values());
      expect(players[0].legions.length).toBe(1);
      expect(players[0].legions[0].creatures.length).toBe(8);
      expect(players[0].legions[0].creatures[0].type).toBe(CreatureType.TITAN);
    });
  });

  describe("Tower Assignment (SETUP phase)", () => {
    it("assigns tower and creates initial legion", () => {
      const create = engine.createGame("tower-game", "key", "master");
      const gameId = create!.gameId;
      const added = engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100");
      const playerId = added!.player.id;

      // Manually put game in SETUP phase
      const game = engine.getGame(gameId)!;
      game.phase = Phase.SETUP;

      const result = engine.assignTower(gameId, playerId, "200");
      expect(result?.legion.tile).toBe("200");
      expect(result?.game.players.get(playerId)?.legions.length).toBe(1);
    });

    it("returns null when assigning to already-taken tower", () => {
      const create = engine.createGame("tower-conflict", "key", "master");
      const gameId = create!.gameId;
      const p1 = engine.addPlayer(gameId, "c1", "P1", "#FF0000", "100")!.player.id;
      const p2 = engine.addPlayer(gameId, "c2", "P2", "#00FF00", "200")!.player.id;

      const game = engine.getGame(gameId)!;
      game.phase = Phase.SETUP;

      engine.assignTower(gameId, p1, "100");
      const result = engine.assignTower(gameId, p2, "100");
      expect(result).toBeNull();
    });

    it("transitions to SPLIT phase when all players assigned towers", () => {
      const create = engine.createGame("full-tower", "key", "master");
      const gameId = create!.gameId;
      const p1 = engine.addPlayer(gameId, "c1", "P1", "#FF0000", "100")!.player.id;
      const p2 = engine.addPlayer(gameId, "c2", "P2", "#00FF00", "200")!.player.id;

      const game = engine.getGame(gameId)!;
      game.phase = Phase.SETUP;
      // Clear tower assignments so assignTower can assign them
      game.players.get(p1)!.towerAssignment = null;
      game.players.get(p2)!.towerAssignment = null;

      engine.assignTower(gameId, p1, "100");
      const result = engine.assignTower(gameId, p2, "200");

      expect(result?.game.phase).toBe(Phase.SPLIT);
    });
  });

  describe("Legion Splitting (SPLIT phase)", () => {
    let gameId: string;
    let playerId: PlayerId;
    let legionId: string;

    beforeEach(() => {
      const create = engine.createGame("split-game", "key", "master");
      gameId = create!.gameId;
      const player = engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100")!;
      playerId = player.player.id;
      engine.startGame(gameId, "master");
      const game = engine.getGame(gameId)!;
      legionId = game.players.get(playerId)!.legions[0].id;
    });

    it("splits a legion into two", () => {
      const game = engine.getGame(gameId)!;
      const originalLegion = game.players.get(playerId)!.legions[0];
      const creatures = originalLegion.creatures;

      const result = engine.splitLegion(
        gameId,
        legionId,
        [creatures[0], creatures[1]],
        [creatures[2], creatures[3]],
        "312"
      );

      expect(result).not.toBeNull();
      expect(result?.newLegion.tile).toBe("312");
      expect(result?.newLegion.creatures.length).toBe(2);
      expect(result?.originalLegion.creatures.length).toBe(2);
    });

    it("returns null when splitting with no creatures in either group", () => {
      const game = engine.getGame(gameId)!;
      const originalLegion = game.players.get(playerId)!.legions[0];
      const creatures = originalLegion.creatures;

      const result = engine.splitLegion(gameId, legionId, [], [creatures[0]], "312");
      expect(result).toBeNull();
    });

    it("returns null when splitting during wrong phase", () => {
      const game = engine.getGame(gameId)!;
      game.phase = Phase.MOVE;
      const originalLegion = game.players.get(playerId)!.legions[0];
      const creatures = originalLegion.creatures;

      const result = engine.splitLegion(
        gameId,
        legionId,
        [creatures[0]],
        [creatures[1]],
        "312"
      );
      expect(result).toBeNull();
    });

    it("returns null when non-active player splits", () => {
      const create = engine.createGame("split-auth", "key", "master");
      const gameId2 = create!.gameId;
      const p1 = engine.addPlayer(gameId2, "c1", "P1", "#FF0000", "100")!.player.id;
      const p2 = engine.addPlayer(gameId2, "c2", "P2", "#00FF00", "200")!.player.id;
      engine.startGame(gameId2, "master");

      const game2 = engine.getGame(gameId2)!;
      const legion = game2.players.get(p1)!.legions[0];
      const creatures = legion.creatures;

      // Active player is p1, manually set it to p2 to test guard
      game2.activePlayer = p2;
      const result = engine.splitLegion(
        gameId2,
        legion.id,
        [creatures[0]],
        [creatures[1]],
        "312"
      );
      expect(result).toBeNull();
    });
  });

  describe("Phase Transitions & Turn Order", () => {
    it("cycles through phases correctly for single player", () => {
      const create = engine.createGame("phase-game", "key", "master");
      const gameId = create!.gameId;
      const player = engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100")!;
      const playerId = player.player.id;
      engine.startGame(gameId, "master");

      let game = engine.getGame(gameId)!;
      expect(game.phase).toBe(Phase.SPLIT);

      engine.endPhase(gameId, playerId);
      game = engine.getGame(gameId)!;
      expect(game.phase).toBe(Phase.MOVE);

      engine.endPhase(gameId, playerId);
      game = engine.getGame(gameId)!;
      expect(game.phase).toBe(Phase.RECRUIT);

      engine.endPhase(gameId, playerId);
      game = engine.getGame(gameId)!;
      expect(game.phase).toBe(Phase.SPLIT);
      expect(game.round).toBe(2);
    });

    it("handles turn order for multiple players", () => {
      const create = engine.createGame("multi-phase", "key", "master");
      const gameId = create!.gameId;
      const p1 = engine.addPlayer(gameId, "c1", "P1", "#FF0000", "100")!.player.id;
      const p2 = engine.addPlayer(gameId, "c2", "P2", "#00FF00", "200")!.player.id;
      engine.startGame(gameId, "master");

      let game = engine.getGame(gameId)!;
      const firstActive = game.activePlayer;
      expect(firstActive).toBe(p1);

      engine.endPhase(gameId, p1);
      game = engine.getGame(gameId)!;
      expect(game.activePlayer).toBe(p1); // Still p1's MOVE phase

      engine.endPhase(gameId, p1);
      game = engine.getGame(gameId)!;
      expect(game.activePlayer).toBe(p1); // Still p1's RECRUIT phase

      engine.endPhase(gameId, p1);
      game = engine.getGame(gameId)!;
      expect(game.activePlayer).toBe(p2); // Now p2's turn
    });

    it("resets die roll when MOVE phase ends", () => {
      const create = engine.createGame("die-reset", "key", "master");
      const gameId = create!.gameId;
      const player = engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100")!;
      const playerId = player.player.id;
      engine.startGame(gameId, "master");

      let game = engine.getGame(gameId)!;
      game.phase = Phase.MOVE;
      game.dieRoll = 4;

      engine.endPhase(gameId, playerId);
      game = engine.getGame(gameId)!;
      expect(game.dieRoll).toBeNull();
    });

    it("resets moved legions when RECRUIT phase ends", () => {
      const create = engine.createGame("recruit-reset", "key", "master");
      const gameId = create!.gameId;
      const player = engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100")!;
      const playerId = player.player.id;
      engine.startGame(gameId, "master");

      let game = engine.getGame(gameId)!;
      game.phase = Phase.RECRUIT;
      game.movedLegionsThisTurn = ["legion-1", "legion-2"];

      engine.endPhase(gameId, playerId);
      game = engine.getGame(gameId)!;
      expect(game.movedLegionsThisTurn).toEqual([]);
    });

    it("skips FIGHT when MOVE ends without pending battles", () => {
      const create = engine.createGame("skip-fight", "key", "master");
      const gameId = create!.gameId;
      const player = engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100")!;
      const playerId = player.player.id;
      engine.startGame(gameId, "master");

      const game = engine.getGame(gameId)!;
      game.phase = Phase.MOVE;
      game.activePlayer = playerId;
      game.dieRoll = 4;

      engine.endPhase(gameId, playerId);

      expect(game.phase).toBe(Phase.RECRUIT);
      expect(game.activePlayer).toBe(playerId);
      expect(game.dieRoll).toBeNull();
    });

    it("keeps FIGHT when MOVE ends with a pending battle", () => {
      const create = engine.createGame("keep-fight", "key", "master");
      const gameId = create!.gameId;
      const first = engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100")!;
      const second = engine.addPlayer(gameId, "client-2", "Player 2", "#00FF00", "200")!;
      engine.startGame(gameId, "master");

      const game = engine.getGame(gameId)!;
      game.phase = Phase.MOVE;
      game.activePlayer = first.player.id;
      game.dieRoll = 5;
      game.tiles.set("211", {
        id: "211",
        terrainType: TerrainType.DESERT,
        legions: [first.player.legions[0], second.player.legions[0]],
      });

      engine.endPhase(gameId, first.player.id);

      expect(game.phase).toBe(Phase.FIGHT);
      expect(game.activePlayer).toBe(first.player.id);
      expect(game.dieRoll).toBeNull();
    });
  });

  describe("Die Rolling", () => {
    it("rolls a die during MOVE phase", () => {
      const create = engine.createGame("die-game", "key", "master");
      const gameId = create!.gameId;
      const player = engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100")!;
      const playerId = player.player.id;
      engine.startGame(gameId, "master");

      const game = engine.getGame(gameId)!;
      game.phase = Phase.MOVE;
      game.dieRoll = null;

      const result = engine.rollForMove(gameId, playerId);
      expect(result?.dieRoll).toBeGreaterThanOrEqual(1);
      expect(result?.dieRoll).toBeLessThanOrEqual(6);
    });

    it("returns null when rolling outside MOVE phase", () => {
      const create = engine.createGame("wrong-phase", "key", "master");
      const gameId = create!.gameId;
      const player = engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100")!;
      const playerId = player.player.id;
      engine.startGame(gameId, "master");

      const game = engine.getGame(gameId)!;
      game.phase = Phase.SPLIT;

      const result = engine.rollForMove(gameId, playerId);
      expect(result).toBeNull();
    });

    it("returns null when die already rolled", () => {
      const create = engine.createGame("already-rolled", "key", "master");
      const gameId = create!.gameId;
      const player = engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100")!;
      const playerId = player.player.id;
      engine.startGame(gameId, "master");

      const game = engine.getGame(gameId)!;
      game.phase = Phase.MOVE;
      game.dieRoll = 3;

      const result = engine.rollForMove(gameId, playerId);
      expect(result).toBeNull();
    });

    it("allows mulligan reroll only once per player", () => {
      const create = engine.createGame("mulligan", "key", "master");
      const gameId = create!.gameId;
      const player = engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100")!;
      const playerId = player.player.id;
      engine.startGame(gameId, "master");

      const game = engine.getGame(gameId)!;
      game.phase = Phase.MOVE;
      game.dieRoll = 2;

      const first = engine.rerollDice(gameId, playerId);
      expect(first).not.toBeNull();

      game.dieRoll = 2;
      const second = engine.rerollDice(gameId, playerId);
      expect(second).toBeNull();
    });

    it("returns null when rerolling outside MOVE phase", () => {
      const create = engine.createGame("reroll-phase", "key", "master");
      const gameId = create!.gameId;
      const player = engine.addPlayer(gameId, "master", "Player 1", "#FF0000", "100")!;
      const playerId = player.player.id;
      engine.startGame(gameId, "master");

      const game = engine.getGame(gameId)!;
      game.phase = Phase.SPLIT;

      const result = engine.rerollDice(gameId, playerId);
      expect(result).toBeNull();
    });
  });

  describe("Utility Functions", () => {
    it("retrieves game by ID", () => {
      engine.createGame("retrieve-game", "key", "master");
      const game = engine.getGame("retrieve-game");
      expect(game).not.toBeNull();
      expect(game?.phase).toBe(Phase.LOBBY);
    });

    it("returns null for non-existent game", () => {
      const game = engine.getGame("nonexistent");
      expect(game).toBeNull();
    });

    it("clears all games", () => {
      engine.createGame("game1", "key1", "master1");
      engine.createGame("game2", "key2", "master2");
      const cleared = engine.clearAllGames();
      expect(cleared).toBe(2);
      expect(engine.getGame("game1")).toBeNull();
    });
  });
});
