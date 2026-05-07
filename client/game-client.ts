import { io, Socket } from "socket.io-client";
import {
  SOCKET_EVENTS,
  ClientEvents,
  ServerEvents,
  GameState,
  PlayerId,
  LegionId,
  TileId,
  CreatureDef,
  CreatureType,
} from "./types.js";

/**
 * Titan game client for browser-based communication with the server.
 */
export class TitanGameClient {
  private socket: Socket | null = null;
  private gameId: string | null = null;
  private playerId: PlayerId | null = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();

  /**
   * Connects to the game server.
   */
  async connect(serverUrl: string = "http://localhost:3000"): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(serverUrl, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
      });

      this.socket.on("connected", (data) => {
        console.log("[Client] Connected to server", data);
        resolve();
      });

      this.socket.on("error", (error) => {
        console.error("[Client] Connection error", error);
        reject(error);
      });

      // Register internal listeners
      this.registerInternalListeners();
    });
  }

  /**
   * Disconnects from the server.
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Creates a new game.
   */
  async createGame(
    playerName: string,
    playerColor: string
  ): Promise<ServerEvents.GameCreated> {
    return this.emit(SOCKET_EVENTS.CLIENT.CREATE_GAME, {
      playerName,
      playerColor,
    });
  }

  /**
   * Joins an existing game.
   */
  async joinGame(
    gameId: string,
    playerName: string,
    playerColor: string
  ): Promise<{ playerId: PlayerId; game: GameState }> {
    return this.emit(SOCKET_EVENTS.CLIENT.JOIN_GAME, {
      gameId,
      playerName,
      playerColor,
    });
  }

  /**
   * Starts the game (transitions from LOBBY to SETUP).
   */
  async startGame(gameId: string): Promise<ServerEvents.GameStarted> {
    return this.emit(SOCKET_EVENTS.CLIENT.START_GAME, { gameId });
  }

  /**
   * Assigns a tower to the current player.
   */
  async assignTower(
    gameId: string,
    playerId: PlayerId,
    towerTile: TileId
  ): Promise<ServerEvents.TowerAssigned> {
    return this.emit(SOCKET_EVENTS.CLIENT.ASSIGN_TOWER, {
      gameId,
      playerId,
      towerTile,
    });
  }

  /**
   * Splits a legion.
   */
  async splitLegion(
    gameId: string,
    legionId: LegionId,
    splitCreatures: CreatureDef[],
    newCreatures: CreatureDef[],
    targetTile: TileId
  ): Promise<ServerEvents.LegionSplit> {
    return this.emit(SOCKET_EVENTS.CLIENT.SPLIT_LEGION, {
      gameId,
      legionId,
      splitCreatures,
      newCreatures,
      targetTile,
    });
  }

  /**
   * Moves a legion to an adjacent tile.
   */
  async moveLegion(
    gameId: string,
    legionId: LegionId,
    sourceTile: TileId,
    targetTile: TileId
  ): Promise<ServerEvents.LegionMoved> {
    return this.emit(SOCKET_EVENTS.CLIENT.MOVE_LEGION, {
      gameId,
      legionId,
      sourceTile,
      targetTile,
    });
  }

  /**
   * Ends the current player's phase.
   */
  async endPhase(gameId: string, playerId: PlayerId): Promise<ServerEvents.PhaseEnded> {
    return this.emit(SOCKET_EVENTS.CLIENT.END_PHASE, {
      gameId,
      playerId,
    });
  }

  /**
   * Subscribes to a server event.
   */
  on(event: string, callback: (data: any) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Unsubscribes from a server event.
   */
  off(event: string, callback: (data: any) => void): void {
    this.listeners.get(event)?.delete(callback);
  }

  /**
   * Gets the current game ID (if any).
   */
  getGameId(): string | null {
    return this.gameId;
  }

  /**
   * Gets the current player ID (if any).
   */
  getPlayerId(): PlayerId | null {
    return this.playerId;
  }

  /**
   * Internal: registers listeners for server events.
   */
  private registerInternalListeners(): void {
    if (!this.socket) return;

    // Game lifecycle events
    this.socket.on(SOCKET_EVENTS.SERVER.GAME_CREATED, (data: ServerEvents.GameCreated) => {
      this.gameId = data.gameId;
      this.playerId = data.playerId;
      this.notifyListeners(SOCKET_EVENTS.SERVER.GAME_CREATED, data);
    });

    this.socket.on(SOCKET_EVENTS.SERVER.PLAYER_JOINED, (data: ServerEvents.PlayerJoined) => {
      this.notifyListeners(SOCKET_EVENTS.SERVER.PLAYER_JOINED, data);
    });

    this.socket.on(SOCKET_EVENTS.SERVER.GAME_STARTED, (data: ServerEvents.GameStarted) => {
      this.notifyListeners(SOCKET_EVENTS.SERVER.GAME_STARTED, data);
    });

    this.socket.on(SOCKET_EVENTS.SERVER.TOWER_ASSIGNED, (data: ServerEvents.TowerAssigned) => {
      this.notifyListeners(SOCKET_EVENTS.SERVER.TOWER_ASSIGNED, data);
    });

    this.socket.on(SOCKET_EVENTS.SERVER.SETUP_COMPLETE, (data: ServerEvents.SetupComplete) => {
      this.notifyListeners(SOCKET_EVENTS.SERVER.SETUP_COMPLETE, data);
    });

    this.socket.on(SOCKET_EVENTS.SERVER.LEGION_SPLIT, (data: ServerEvents.LegionSplit) => {
      this.notifyListeners(SOCKET_EVENTS.SERVER.LEGION_SPLIT, data);
    });

    this.socket.on(SOCKET_EVENTS.SERVER.LEGION_MOVED, (data: ServerEvents.LegionMoved) => {
      this.notifyListeners(SOCKET_EVENTS.SERVER.LEGION_MOVED, data);
    });

    this.socket.on(SOCKET_EVENTS.SERVER.PHASE_ENDED, (data: ServerEvents.PhaseEnded) => {
      this.notifyListeners(SOCKET_EVENTS.SERVER.PHASE_ENDED, data);
    });

    this.socket.on(SOCKET_EVENTS.SERVER.STATE_SNAPSHOT, (data: ServerEvents.GameStateSnapshot) => {
      this.notifyListeners(SOCKET_EVENTS.SERVER.STATE_SNAPSHOT, data);
    });

    this.socket.on(SOCKET_EVENTS.SERVER.ERROR, (data: ServerEvents.ErrorOccurred) => {
      console.error("[Client] Server error", data);
      this.notifyListeners(SOCKET_EVENTS.SERVER.ERROR, data);
    });
  }

  /**
   * Internal: emits an event and waits for the response.
   */
  private emit(event: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("Not connected to server"));
        return;
      }

      this.socket.emit(event, data, (error: any, response: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Internal: notifies all listeners of an event.
   */
  private notifyListeners(event: string, data: any): void {
    this.listeners.get(event)?.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`[Client] Error in listener for ${event}:`, error);
      }
    });
  }
}
