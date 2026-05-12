import { Socket } from "socket.io";
import { GameEngine } from "../game/engine.js";
import {
  SOCKET_EVENTS,
  ServerEvents,
  CreateGameRequestSchema,
  JoinGameRequestSchema,
  RejoinGameRequestSchema,
  CreateReconnectTokenRequestSchema,
  AddPlayerRequestSchema,
  AddAiPlayerRequestSchema,
  StartGameRequestSchema,
  AssignTowerRequestSchema,
  SplitLegionRequestSchema,
  RecruitCreatureRequestSchema,
  MoveLegionRequestSchema,
  RollForMoveRequestSchema,
  RerollDiceRequestSchema,
  EndPhaseRequestSchema,
  ResolveBattleRequestSchema,
  Phase,
} from "../types.js";

// ============================================================================
// SOCKET HANDLERS
// ============================================================================

export class SocketHandlers {
  private socketsByClientId: Map<string, Socket> = new Map();

  constructor(private engine: GameEngine, private io: any) {}

  private ensureClientId(socket: Socket): string {
    if (!socket.data.clientId) {
      const handshakeClientId = socket.handshake.auth?.clientId;
      if (typeof handshakeClientId === "string" && handshakeClientId.trim()) {
        socket.data.clientId = handshakeClientId.trim();
      } else {
        socket.data.clientId = `client-${socket.id}`;
      }
    }
    return socket.data.clientId as string;
  }

  /**
   * Register all event handlers for a socket connection.
   */
  registerHandlers(socket: Socket) {
    const clientId = this.ensureClientId(socket);
    this.socketsByClientId.set(clientId, socket);

    // Lobby events
    socket.on(SOCKET_EVENTS.CLIENT.CREATE_GAME, (data, callback) =>
      this.handleCreateGame(socket, data, callback)
    );
    socket.on(SOCKET_EVENTS.CLIENT.JOIN_GAME, (data, callback) =>
      this.handleJoinGame(socket, data, callback)
    );
    socket.on(SOCKET_EVENTS.CLIENT.REJOIN_GAME, (data, callback) =>
      this.handleRejoinGame(socket, data, callback)
    );
    socket.on(SOCKET_EVENTS.CLIENT.CREATE_RECONNECT_TOKEN, (data, callback) =>
      this.handleCreateReconnectToken(socket, data, callback)
    );
    socket.on(SOCKET_EVENTS.CLIENT.ADD_PLAYER, (data, callback) =>
      this.handleAddPlayer(socket, data, callback)
    );
    socket.on(SOCKET_EVENTS.CLIENT.ADD_AI_PLAYER, (data, callback) =>
      this.handleAddAiPlayer(socket, data, callback)
    );
    socket.on(SOCKET_EVENTS.CLIENT.START_GAME, (data, callback) =>
      this.handleStartGame(socket, data, callback)
    );

    // Setup events
    socket.on(SOCKET_EVENTS.CLIENT.ASSIGN_TOWER, (data, callback) =>
      this.handleAssignTower(socket, data, callback)
    );

    // Split events
    socket.on(SOCKET_EVENTS.CLIENT.SPLIT_LEGION, (data, callback) =>
      this.handleSplitLegion(socket, data, callback)
    );

    // Recruit events
    socket.on(SOCKET_EVENTS.CLIENT.RECRUIT_CREATURE, (data, callback) =>
      this.handleRecruitCreature(socket, data, callback)
    );

    // Move events
    socket.on(SOCKET_EVENTS.CLIENT.ROLL_FOR_MOVE, (data, callback) =>
      this.handleRollForMove(socket, data, callback)
    );
    socket.on(SOCKET_EVENTS.CLIENT.REROLL_DICE, (data, callback) =>
      this.handleRerollDice(socket, data, callback)
    );
    socket.on(SOCKET_EVENTS.CLIENT.MOVE_LEGION, (data, callback) =>
      this.handleMoveLegion(socket, data, callback)
    );
    socket.on(SOCKET_EVENTS.CLIENT.END_PHASE, (data, callback) =>
      this.handleEndPhase(socket, data, callback)
    );
    socket.on(SOCKET_EVENTS.CLIENT.RESOLVE_BATTLE, (data, callback) =>
      this.handleResolveBattle(socket, data, callback)
    );

    // Disconnect
    socket.on(SOCKET_EVENTS.DISCONNECT, () => {
      const disconnectedClientId = socket.data.clientId as string | undefined;
      if (disconnectedClientId && this.socketsByClientId.get(disconnectedClientId) === socket) {
        this.socketsByClientId.delete(disconnectedClientId);
      }
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  }

  private broadcastLog(gameId: string, game: any) {
    const lastEntry = game.log[game.log.length - 1];
    if (lastEntry) {
      this.io.to(gameId).emit(SOCKET_EVENTS.SERVER.LOG_ENTRY, lastEntry);
    }
  }


  private handleCreateGame(socket: Socket, data: unknown, callback: (error: any, response?: any) => void) {
    try {
      const validated = CreateGameRequestSchema.parse(data);
      const clientId = this.ensureClientId(socket);
      const created = this.engine.createGame(
        validated.gameId,
        validated.gameKey,
        clientId
      );

      if (!created) {
        callback({ message: "Game ID already exists or invalid" });
        return;
      }

      const { gameId, isGameMaster } = created;

      // Join the socket to a room for this game
      socket.join(gameId);
      socket.data.gameId = gameId;

      const response: ServerEvents.GameCreated = {
        gameId,
        clientId,
        isGameMaster,
        createdAt: Date.now(),
      };

      callback(null, response);
      const createdGame = this.engine.getGame(gameId)!;
      this.io.to(gameId).emit(SOCKET_EVENTS.SERVER.STATE_SNAPSHOT, {
        gameId,
        state: this.engine.serializeGame(createdGame),
      });
      this.broadcastLog(gameId, createdGame);

      console.log(`[Game] Created: ${gameId} by ${clientId}`);
    } catch (error) {
      callback({ message: "Invalid create game request", error });
    }
  }

  private handleJoinGame(socket: Socket, data: unknown, callback: (error: any, response?: any) => void) {
    try {
      const validated = JoinGameRequestSchema.parse(data);
      const clientId = this.ensureClientId(socket);
      const result = this.engine.joinGame(
        validated.gameId,
        validated.gameKey,
        clientId,
        validated.playerName,
        validated.playerColor
      );

      if (!result) {
        callback({ message: "Game not found, key invalid, or game already started" });
        return;
      }

      const { gameState, isGameMaster, playerId, displacedClientId } = result;
      socket.join(gameState.id);
      socket.data.gameId = gameState.id;

      if (displacedClientId && displacedClientId !== clientId) {
        const displacedSocket = this.socketsByClientId.get(displacedClientId);
        if (displacedSocket) {
          displacedSocket.emit(SOCKET_EVENTS.SERVER.ERROR, {
            message: "Your session was resumed in another browser",
            code: "SESSION_TRANSFERRED",
            gameId: gameState.id,
          });
          displacedSocket.disconnect(true);
          this.socketsByClientId.delete(displacedClientId);
        }
      }

      const playerResponse: ServerEvents.PlayerJoined = {
        gameId: gameState.id,
        clientId,
        isGameMaster,
      };

      callback(null, { clientId, isGameMaster, playerId, game: this.engine.serializeGame(gameState) });
      this.io.to(gameState.id).emit(SOCKET_EVENTS.SERVER.PLAYER_JOINED, playerResponse);
      this.broadcastLog(gameState.id, gameState);

      console.log(`[Game] Client ${clientId} joined ${gameState.id}`);
    } catch (error) {
      callback({ message: "Invalid join game request", error });
    }
  }

  private handleRejoinGame(socket: Socket, data: unknown, callback: (error: any, response?: any) => void) {
    try {
      const validated = RejoinGameRequestSchema.parse(data);
      const clientId = this.ensureClientId(socket);
      const result = this.engine.rejoinGame(
        validated.gameId,
        validated.gameKey,
        clientId,
        validated.transferToken
      );

      if (!result) {
        callback({ message: "Could not rejoin game" });
        return;
      }

      const { gameState, isGameMaster, playerId } = result;
      socket.join(gameState.id);
      socket.data.gameId = gameState.id;

      callback(null, {
        clientId,
        isGameMaster,
        playerId,
        game: this.engine.serializeGame(gameState),
      });

      this.io.to(gameState.id).emit(SOCKET_EVENTS.SERVER.STATE_SNAPSHOT, {
        gameId: gameState.id,
        state: this.engine.serializeGame(gameState),
      });
      this.broadcastLog(gameState.id, gameState);

      console.log(`[Game] Client ${clientId} rejoined ${gameState.id}`);
    } catch (error) {
      callback({ message: "Invalid rejoin game request", error });
    }
  }

  private handleCreateReconnectToken(socket: Socket, data: unknown, callback: (error: any, response?: any) => void) {
    try {
      const validated = CreateReconnectTokenRequestSchema.parse(data);
      const clientId = this.ensureClientId(socket);
      const result = this.engine.issueReconnectToken(
        validated.gameId,
        validated.gameKey,
        clientId
      );

      if (!result) {
        callback({ message: "Could not create reconnect token" });
        return;
      }

      const response: ServerEvents.ReconnectTokenCreated = {
        gameId: validated.gameId,
        transferToken: result.transferToken,
        expiresAt: result.expiresAt,
      };

      callback(null, response);
    } catch (error) {
      callback({ message: "Invalid reconnect token request", error });
    }
  }

  private handleAddPlayer(socket: Socket, data: unknown, callback: (error: any, response?: any) => void) {
    try {
      const validated = AddPlayerRequestSchema.parse(data);
      const clientId = this.ensureClientId(socket);
      const result = this.engine.addPlayer(
        validated.gameId,
        clientId,
        validated.playerName,
        validated.playerColor,
        validated.towerTile
      );

      if (!result) {
        callback({ message: "Could not add player (already added, color/tower used, or game already started)" });
        return;
      }

      const { game, player } = result;
      const response: ServerEvents.PlayerAdded = {
        gameId: game.id,
        player,
        totalPlayers: game.players.size,
      };

      callback(null, response);
      this.io.to(game.id).emit(SOCKET_EVENTS.SERVER.PLAYER_ADDED, response);
      this.io.to(game.id).emit(SOCKET_EVENTS.SERVER.STATE_SNAPSHOT, {
        gameId: game.id,
        state: this.engine.serializeGame(game),
      });
      this.broadcastLog(game.id, game);
    } catch (error) {
      callback({ message: "Invalid add player request", error });
    }
  }

  private handleAddAiPlayer(socket: Socket, data: unknown, callback: (error: any, response?: any) => void) {
    try {
      const validated = AddAiPlayerRequestSchema.parse(data);
      const clientId = this.ensureClientId(socket);
      const result = this.engine.addAiPlayer(
        validated.gameId,
        clientId,
        validated.playerName,
        validated.playerColor,
        validated.towerTile,
        validated.aiPlayStyle
      );

      if (!result) {
        callback({ message: "Could not add AI player (gamemaster only, color/tower used, or game already started)" });
        return;
      }

      const { game, player } = result;
      const response: ServerEvents.PlayerAdded = {
        gameId: game.id,
        player,
        totalPlayers: game.players.size,
      };

      callback(null, response);
      this.io.to(game.id).emit(SOCKET_EVENTS.SERVER.PLAYER_ADDED, response);
      this.io.to(game.id).emit(SOCKET_EVENTS.SERVER.STATE_SNAPSHOT, {
        gameId: game.id,
        state: this.engine.serializeGame(game),
      });
      this.broadcastLog(game.id, game);
    } catch (error) {
      callback({ message: "Invalid add AI player request", error });
    }
  }

  private handleStartGame(socket: Socket, data: unknown, callback: (error: any, response?: any) => void) {
    try {
      const validated = StartGameRequestSchema.parse(data);
      const clientId = this.ensureClientId(socket);
      const game = this.engine.startGame(validated.gameId, clientId);

      if (!game) {
        callback({ message: "Only the gamemaster can start, and every player must have a tower" });
        return;
      }

      const response: ServerEvents.GameStarted = {
        gameId: game.id,
        phase: Phase.SPLIT,
        round: 1,
        players: Array.from(game.players.values()),
        availableTowers: [],
      };

      callback(null, response);
      this.io.to(game.id).emit(SOCKET_EVENTS.SERVER.GAME_STARTED, response);
      this.io.to(game.id).emit(SOCKET_EVENTS.SERVER.STATE_SNAPSHOT, {
        gameId: game.id,
        state: this.engine.serializeGame(game),
      });
      this.broadcastLog(game.id, game);

      console.log(`[Game] Started: ${game.id}`);
    } catch (error) {
      callback({ message: "Invalid start game request", error });
    }
  }

  // ========================================================================
  // SETUP PHASE HANDLERS
  // ========================================================================

  private handleAssignTower(socket: Socket, data: unknown, callback: (error: any, response?: any) => void) {
    try {
      const validated = AssignTowerRequestSchema.parse(data);
      const result = this.engine.assignTower(
        validated.gameId,
        validated.playerId,
        validated.towerTile
      );

      if (!result) {
        callback({ message: "Failed to assign tower" });
        return;
      }

      const { game, legion } = result;

      const response: ServerEvents.TowerAssigned = {
        gameId: validated.gameId,
        playerId: validated.playerId,
        towerTile: validated.towerTile,
        legion,
      };

      callback(null, response);
      this.io.to(validated.gameId).emit(SOCKET_EVENTS.SERVER.TOWER_ASSIGNED, response);
      this.broadcastLog(validated.gameId, game);

      // Check if setup is complete
      const allAssigned = Array.from(game.players.values()).every(
        (p) => p.towerAssignment
      );
      if (allAssigned) {
        const setupComplete: ServerEvents.SetupComplete = {
          gameId: validated.gameId,
          phase: Phase.SPLIT,
          round: 1,
          activePlayer: Array.from(game.players.keys())[0],
        };
        this.io.to(validated.gameId).emit(SOCKET_EVENTS.SERVER.SETUP_COMPLETE, setupComplete);
        this.broadcastLog(validated.gameId, game);
        console.log(`[Game] Setup complete: ${validated.gameId}`);
      }

      console.log(`[Game] ${validated.playerId} assigned tower ${validated.towerTile}`);
    } catch (error) {
      callback({ message: "Invalid assign tower request", error });
    }
  }

  // ========================================================================
  // SPLIT PHASE HANDLERS
  // ========================================================================

  private handleSplitLegion(socket: Socket, data: unknown, callback: (error: any, response?: any) => void) {
    try {
      const validated = SplitLegionRequestSchema.parse(data);
      const result = this.engine.splitLegion(
        validated.gameId,
        validated.legionId,
        validated.splitCreatures,
        validated.newCreatures,
        validated.targetTile
      );

      if (!result) {
        callback({ message: "Failed to split legion" });
        return;
      }

      const { game, originalLegion, newLegion } = result;

      const response: ServerEvents.LegionSplit = {
        gameId: validated.gameId,
        originalLegion,
        newLegion,
      };

      callback(null, response);
      this.io.to(validated.gameId).emit(SOCKET_EVENTS.SERVER.LEGION_SPLIT, response);
      this.io.to(validated.gameId).emit(SOCKET_EVENTS.SERVER.STATE_SNAPSHOT, {
        gameId: validated.gameId,
        state: this.engine.serializeGame(game),
      });
      this.broadcastLog(validated.gameId, game);

      console.log(
        `[Game] Legion split: ${validated.legionId} → ${newLegion.id}`
      );
    } catch (error) {
      callback({ message: "Invalid split legion request", error });
    }
  }

  private handleRecruitCreature(socket: Socket, data: unknown, callback: (error: any, response?: any) => void) {
    try {
      const validated = RecruitCreatureRequestSchema.parse(data);
      const result = this.engine.recruitCreature(
        validated.gameId,
        validated.legionId,
        validated.creatureType
      );

      if (!result) {
        callback({ message: "Failed to recruit creature" });
        return;
      }

      const { game, creature } = result;

      const response: ServerEvents.CreatureRecruited = {
        gameId: validated.gameId,
        legionId: validated.legionId,
        creature,
      };

      callback(null, response);
      this.io.to(validated.gameId).emit(SOCKET_EVENTS.SERVER.CREATURE_RECRUITED, response);
      this.io.to(validated.gameId).emit(SOCKET_EVENTS.SERVER.STATE_SNAPSHOT, {
        gameId: validated.gameId,
        state: this.engine.serializeGame(game),
      });
      this.broadcastLog(validated.gameId, game);

      console.log(`[Game] Creature recruited: ${validated.legionId} recruited ${validated.creatureType}`);
    } catch (error) {
      callback({ message: "Invalid recruit creature request", error });
    }
  }

  private handleMoveLegion(socket: Socket, data: unknown, callback: (error: any, response?: any) => void) {
    try {
      const validated = MoveLegionRequestSchema.parse(data);
      const game = this.engine.moveLegion(
        validated.gameId,
        validated.legionId,
        validated.sourceTile,
        validated.targetTile
      );

      if (!game) {
        callback({ message: "Failed to move legion" });
        return;
      }

      const response: ServerEvents.LegionMoved = {
        gameId: validated.gameId,
        legionId: validated.legionId,
        sourceTile: validated.sourceTile,
        targetTile: validated.targetTile,
      };

      callback(null, response);
      this.io.to(validated.gameId).emit(SOCKET_EVENTS.SERVER.LEGION_MOVED, response);
      this.broadcastLog(validated.gameId, game);

      console.log(`[Game] Legion moved: ${validated.legionId}`);
    } catch (error) {
      callback({ message: "Invalid move legion request", error });
    }
  }

  private handleRollForMove(socket: Socket, data: unknown, callback: (error: any, response?: any) => void) {
    try {
      const validated = RollForMoveRequestSchema.parse(data);
      const game = this.engine.rollForMove(validated.gameId, validated.playerId);

      if (!game) {
        callback({ message: "Failed to roll for move" });
        return;
      }

      callback(null, { dieRoll: game.dieRoll });
      this.io.to(validated.gameId).emit(SOCKET_EVENTS.SERVER.STATE_SNAPSHOT, {
        gameId: validated.gameId,
        state: this.engine.serializeGame(game),
      });
      this.broadcastLog(validated.gameId, game);

      console.log(`[Game] Rolled for move in ${validated.gameId}: ${game.dieRoll}`);
    } catch (error) {
      callback({ message: "Invalid roll for move request", error });
    }
  }

  private handleRerollDice(socket: Socket, data: unknown, callback: (error: any, response?: any) => void) {
    try {
      const validated = RerollDiceRequestSchema.parse(data);
      const game = this.engine.rerollDice(validated.gameId, validated.playerId);

      if (!game) {
        callback({ message: "Failed to reroll dice or mulligan already used" });
        return;
      }

      callback(null, { dieRoll: game.dieRoll });
      this.io.to(validated.gameId).emit(SOCKET_EVENTS.SERVER.STATE_SNAPSHOT, {
        gameId: validated.gameId,
        state: this.engine.serializeGame(game),
      });
      this.broadcastLog(validated.gameId, game);

      console.log(`[Game] Rerolled dice in ${validated.gameId}: ${game.dieRoll} (mulligan used)`);
    } catch (error) {
      callback({ message: "Invalid reroll dice request", error });
    }
  }

  private handleEndPhase(socket: Socket, data: unknown, callback: (error: any, response?: any) => void) {
    try {
      const validated = EndPhaseRequestSchema.parse(data);
      const game = this.engine.endPhase(validated.gameId, validated.playerId);

      if (!game) {
        callback({ message: "Failed to end phase" });
        return;
      }

      const response: ServerEvents.PhaseEnded = {
        gameId: validated.gameId,
        currentPhase: game.phase,
        nextPhase: game.phase, // TODO: calculate next phase
        activePlayer: game.activePlayer,
      };

      callback(null, response);
      this.io.to(validated.gameId).emit(SOCKET_EVENTS.SERVER.PHASE_ENDED, response);
      this.io.to(validated.gameId).emit(SOCKET_EVENTS.SERVER.STATE_SNAPSHOT, {
        gameId: validated.gameId,
        state: this.engine.serializeGame(game),
      });
      this.broadcastLog(validated.gameId, game);

      console.log(`[Game] Phase ended for ${validated.playerId}`);
    } catch (error) {
      callback({ message: "Invalid end phase request", error });
    }
  }

  private handleResolveBattle(socket: Socket, data: unknown, callback: (error: any, response?: any) => void) {
    try {
      const validated = ResolveBattleRequestSchema.parse(data);
      const result = this.engine.resolveBattle(
        validated.gameId,
        validated.playerId,
        validated.battleTileId,
        validated.defenderLegionId,
        validated.attackerLegionId,
        validated.defenderSurvivors,
        validated.attackerSurvivors
      );

      if (!result) {
        callback({ message: "Failed to resolve battle" });
        return;
      }

      const response: ServerEvents.BattleResolved = {
        gameId: validated.gameId,
        winnerPlayerId: result.winnerPlayerId,
        tie: result.tie,
        titanKilledPlayerIds: result.titanKilledPlayerIds,
        pointsAwarded: result.pointsAwarded,
        gameWonByPlayerId: result.gameWonByPlayerId,
        nextPhase: result.game.phase,
        activePlayer: result.game.activePlayer,
      };

      callback(null, response);
      this.io.to(validated.gameId).emit(SOCKET_EVENTS.SERVER.BATTLE_RESOLVED, response);
      this.io.to(validated.gameId).emit(SOCKET_EVENTS.SERVER.STATE_SNAPSHOT, {
        gameId: validated.gameId,
        state: this.engine.serializeGame(result.game),
      });
      this.broadcastLog(validated.gameId, result.game);

      console.log(`[Game] Battle resolved on tile ${validated.battleTileId} in ${validated.gameId}`);
    } catch (error) {
      callback({ message: "Invalid resolve battle request", error });
    }
  }
}
