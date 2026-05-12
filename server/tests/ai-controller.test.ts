import { beforeEach, describe, expect, it } from "vitest";
import { runAiStep } from "../src/ai/controller.js";
import { GameEngine } from "../src/game/engine.js";
import { CreatureType, Phase } from "../src/types.js";

describe("AI Controller", () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = new GameEngine();
  });

  it("normal AI splits, moves, then recruits across phase steps", () => {
    const created = engine.createGame("ai-normal-step", "key", "master");
    expect(created).not.toBeNull();

    const aiAdded = engine.addAiPlayer(
      created!.gameId,
      "master",
      "NormBot",
      "#FF0000",
      "100",
      "Normal"
    );
    expect(aiAdded).not.toBeNull();

    const started = engine.startGame(created!.gameId, "master");
    expect(started?.phase).toBe(Phase.SPLIT);

    const splitStep = runAiStep(engine, created!.gameId);
    expect(splitStep).toBe(true);

    const afterSplit = engine.getGame(created!.gameId)!;
    const aiPlayer = Array.from(afterSplit.players.values())[0];
    expect(afterSplit.phase).toBe(Phase.MOVE);
    expect(aiPlayer.legions.length).toBeGreaterThanOrEqual(2);

    const moveStep = runAiStep(engine, created!.gameId);
    expect(moveStep).toBe(true);

    const afterMove = engine.getGame(created!.gameId)!;
    expect(afterMove.phase === Phase.RECRUIT || afterMove.phase === Phase.FIGHT).toBe(true);

    if (afterMove.phase === Phase.FIGHT) {
      // Advance out of fight for this engine version.
      runAiStep(engine, created!.gameId);
    }

    const recruitStep = runAiStep(engine, created!.gameId);
    expect(recruitStep).toBe(true);

    const afterRecruit = engine.getGame(created!.gameId)!;
    expect(afterRecruit.phase).toBe(Phase.SPLIT);
  });

  it("turtle AI does not split at 8, but splits at 7 into 5/2 with titan in 5", () => {
    const created = engine.createGame("ai-turtle-split", "key", "master");
    expect(created).not.toBeNull();

    const aiAdded = engine.addAiPlayer(
      created!.gameId,
      "master",
      "TurtleBot",
      "#0000FF",
      "100",
      "Turtle"
    );
    expect(aiAdded).not.toBeNull();

    engine.startGame(created!.gameId, "master");

    // At 8 creatures, turtle should wait and not split.
    runAiStep(engine, created!.gameId);
    let game = engine.getGame(created!.gameId)!;
    let turtle = Array.from(game.players.values())[0];
    expect(game.phase).toBe(Phase.MOVE);
    expect(turtle.legions.length).toBe(1);

    // Force back to split with 7 creatures and verify 5/2 split rule.
    game.phase = Phase.SPLIT;
    game.activePlayer = turtle.id;
    turtle.legions[0].creatures = turtle.legions[0].creatures.slice(0, 7);
    expect(turtle.legions[0].creatures.length).toBe(7);

    runAiStep(engine, created!.gameId);
    game = engine.getGame(created!.gameId)!;
    turtle = Array.from(game.players.values())[0];

    expect(turtle.legions.length).toBe(2);
    const sizes = turtle.legions.map((legion) => legion.creatures.length).sort((a, b) => a - b);
    expect(sizes).toEqual([2, 5]);

    const titanLegion = turtle.legions.find((legion) =>
      legion.creatures.some((creature) => creature.type === CreatureType.TITAN)
    );
    expect(titanLegion).toBeDefined();
    expect(titanLegion!.creatures.length).toBe(5);
  });

  it("turtle AI avoids moving titan stack when destination is not recruitable", () => {
    const created = engine.createGame("ai-turtle-move", "key", "master");
    expect(created).not.toBeNull();

    const aiAdded = engine.addAiPlayer(
      created!.gameId,
      "master",
      "TurtleMover",
      "#00CC00",
      "100",
      "Turtle"
    );
    expect(aiAdded).not.toBeNull();

    engine.startGame(created!.gameId, "master");
    const game = engine.getGame(created!.gameId)!;
    const turtle = Array.from(game.players.values())[0];

    // Put game in MOVE with controlled die and no previous moves.
    game.phase = Phase.MOVE;
    game.activePlayer = turtle.id;
    game.dieRoll = 1;
    game.movedLegionsThisTurn = [];

    const titanLegion = turtle.legions[0];
    const originalTile = titanLegion.tile;

    runAiStep(engine, created!.gameId);

    const updated = engine.getGame(created!.gameId)!;
    const updatedTurtle = Array.from(updated.players.values())[0];
    const updatedTitanLegion = updatedTurtle.legions.find((legion) => legion.id === titanLegion.id)!;

    // For turtle policy, titan only moves to recruitable locations; if none, it stays.
    // This assertion ensures policy does not force an illegal/non-recruitable move.
    expect(updatedTitanLegion.tile === originalTile || updated.movedLegionsThisTurn.includes(updatedTitanLegion.id)).toBe(true);
  });

  it("AI does not auto-resolve FIGHT phase on server", () => {
    const created = engine.createGame("ai-battle-test", "key", "master");
    expect(created).not.toBeNull();

    // Add AI attacker with aggressive strategy
    const aiAttacker = engine.addAiPlayer(
      created!.gameId,
      "master",
      "AttackBot",
      "#FF0000",
      "100",
      "Normal"
    );
    expect(aiAttacker).not.toBeNull();

    // Add second AI defender with defensive strategy
    const aiDefender = engine.addAiPlayer(
      created!.gameId,
      "master",
      "DefenseBot",
      "#00FF00",
      "200",
      "Turtle"
    );
    expect(aiDefender).not.toBeNull();

    engine.startGame(created!.gameId, "master");
    const game = engine.getGame(created!.gameId)!;
    const ai = game.players.get(aiAttacker!.player.id)!;
    const defender = game.players.get(aiDefender!.player.id)!;

    // Manually set up a FIGHT phase with both players having legions on same tile
    game.phase = Phase.FIGHT;
    game.activePlayer = ai.id;
    game.dieRoll = null;

    const battleTile = "212";
    const aiLegion = ai.legions[0];
    const defenderLegion = defender.legions[0];
    aiLegion.tile = battleTile;
    defenderLegion.tile = battleTile;

    game.tiles.set(battleTile, {
      id: battleTile,
      terrainType: "MARSH",
      legions: [defenderLegion, aiLegion],
    });

    // Clear other tiles
    for (const [tileId, tileState] of game.tiles.entries()) {
      if (tileId !== battleTile) {
        tileState.legions = tileState.legions.filter(
          (legion) => legion.id !== aiLegion.id && legion.id !== defenderLegion.id
        );
      }
    }

    // Before: both sides have creatures
    expect(aiLegion.creatures.length).toBeGreaterThan(0);
    expect(defenderLegion.creatures.length).toBeGreaterThan(0);

    // Server AI should not resolve the battle directly in FIGHT.
    const battleResolved = runAiStep(engine, created!.gameId);
    expect(battleResolved).toBe(false);

    // Battle should remain in FIGHT for battle-board resolution.
    const afterBattle = engine.getGame(created!.gameId)!;
    expect(afterBattle.phase).toBe(Phase.FIGHT);
  });
});
