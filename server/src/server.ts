import express, { Express, Request, Response } from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server as SocketIOServer, Socket } from "socket.io";
import { GameEngine } from "./game/engine.js";
import { runAiStep } from "./ai/controller.js";
import { SocketHandlers } from "./sockets/handlers.js";
import { SOCKET_EVENTS } from "./types.js";
import { getValidDestinations } from "./game/movementRules.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

const app: Express = express();
const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const engine = new GameEngine();
const socketHandlers = new SocketHandlers(engine, io);

let aiLoopRunning = false;

function emitSnapshot(gameId: string) {
  const game = engine.getGame(gameId);
  if (!game) {
    return;
  }

  io.to(gameId).emit(SOCKET_EVENTS.SERVER.STATE_SNAPSHOT, {
    gameId,
    state: engine.serializeGame(game),
  });

  const lastEntry = game.log[game.log.length - 1];
  if (lastEntry) {
    io.to(gameId).emit(SOCKET_EVENTS.SERVER.LOG_ENTRY, lastEntry);
  }
}

function runAiLoopTick() {
  if (aiLoopRunning) {
    return;
  }

  aiLoopRunning = true;
  try {
    const gameIds = engine.listGameIds();
    for (const gameId of gameIds) {
      const changed = runAiStep(engine, gameId);
      if (changed) {
        emitSnapshot(gameId);
      }
    }
  } finally {
    aiLoopRunning = false;
  }
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(express.json());

// Serve the Titan board and client assets from the project root
const publicDir = path.resolve(__dirname, "../..");
const socketIoClientDir = path.resolve(__dirname, "../node_modules/socket.io-client/dist");

app.use(
  "/vendor/socket.io-client",
  express.static(socketIoClientDir, { index: false })
);
app.use(express.static(publicDir, { index: "index.html" }));

// ============================================================================
// REST API ENDPOINTS
// ============================================================================

/**
 * Health check endpoint
 */
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

/**
 * List active (not yet started) games.
 */
app.get("/api/games", (_req: Request, res: Response) => {
  res.json(engine.listActiveGames());
});

/**
 * Serve the browser Socket.IO client from an API path that is routed to this server
 * in production environments.
 */
app.get("/api/socket.io-client.js", (_req: Request, res: Response) => {
  res.sendFile(path.join(socketIoClientDir, "socket.io.min.js"));
});

/**
 * Get game state (for debugging/UI sync)
 */
app.get("/api/game/:gameId", (req: Request, res: Response) => {
  const game = engine.getGame(req.params.gameId);
  if (!game) {
    return res.status(404).json({ error: "Game not found" });
  }
  res.json(engine.serializeGame(game));
});

/**
 * Get game action log
 */
app.get("/api/game/:gameId/log", (req: Request, res: Response) => {
  const game = engine.getGame(req.params.gameId);
  if (!game) {
    return res.status(404).json({ error: "Game not found" });
  }
  res.json(game.log);
});

/**
 * Get valid movement destinations for a source tile and die roll.
 */
app.get("/api/movement/:fromTile/:dieRoll", (req: Request, res: Response) => {
  const fromTile = String(req.params.fromTile || "").trim();
  const dieRoll = Number.parseInt(String(req.params.dieRoll || ""), 10);

  if (!/^\d{3}$/.test(fromTile)) {
    return res.status(400).json({ error: "fromTile must be a 3-digit tile id" });
  }

  if (!Number.isInteger(dieRoll) || dieRoll < 1 || dieRoll > 6) {
    return res.status(400).json({ error: "dieRoll must be an integer from 1 to 6" });
  }

  const destinations = getValidDestinations(fromTile as any, dieRoll);
  return res.json({ fromTile, dieRoll, destinations });
});

app.post("/api/admin/games/clear", (req: Request, res: Response) => {
  if (req.query.admin !== "true") {
    return res.status(403).json({ error: "Admin mode required" });
  }

  const cleared = engine.clearAllGames();
  res.json({ cleared });
});

app.post("/api/admin/game/:gameId/force-battle", (req: Request, res: Response) => {
  if (req.query.admin !== "true") {
    return res.status(403).json({ error: "Admin mode required" });
  }

  const attackerPlayerId = String(req.body?.attackerPlayerId || "").trim();
  const defenderPlayerId = String(req.body?.defenderPlayerId || "").trim();
  const battleTileId = String(req.body?.battleTileId || "211").trim();

  if (!attackerPlayerId || !defenderPlayerId) {
    return res.status(400).json({ error: "attackerPlayerId and defenderPlayerId are required" });
  }

  if (!/^\d{3}$/.test(battleTileId)) {
    return res.status(400).json({ error: "battleTileId must be a 3-digit tile id" });
  }

  const result = engine.forceBattle(req.params.gameId, attackerPlayerId, defenderPlayerId, battleTileId);
  if (!result) {
    return res.status(400).json({ error: "Could not force battle for the selected players" });
  }

  io.to(req.params.gameId).emit(SOCKET_EVENTS.SERVER.STATE_SNAPSHOT, {
    gameId: req.params.gameId,
    state: engine.serializeGame(result.game),
  });

  return res.json({
    battleTileId: result.battleTileId,
    attackerLegionId: result.attackerLegionId,
    defenderLegionId: result.defenderLegionId,
    state: engine.serializeGame(result.game),
  });
});

app.post("/api/admin/game/:gameId/place-stack", (req: Request, res: Response) => {
  if (req.query.admin !== "true") {
    return res.status(403).json({ error: "Admin mode required" });
  }

  const legionId = String(req.body?.legionId || "").trim();
  const targetTile = String(req.body?.targetTile || "").trim();

  if (!legionId) {
    return res.status(400).json({ error: "legionId is required" });
  }

  if (!/^\d{3}$/.test(targetTile)) {
    return res.status(400).json({ error: "targetTile must be a 3-digit tile id" });
  }

  const result = engine.placeLegionForTest(req.params.gameId, legionId, targetTile);
  if (!result) {
    return res.status(400).json({ error: "Could not place the selected stack on that tile" });
  }

  io.to(req.params.gameId).emit(SOCKET_EVENTS.SERVER.STATE_SNAPSHOT, {
    gameId: req.params.gameId,
    state: engine.serializeGame(result.game),
  });

  return res.json({
    legionId: result.legionId,
    sourceTile: result.sourceTile,
    targetTile: result.targetTile,
    playerId: result.playerId,
    state: engine.serializeGame(result.game),
  });
});

// ============================================================================
// SOCKET.IO SETUP
// ============================================================================

io.on(SOCKET_EVENTS.CONNECT, (socket: Socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  const clientId = socketHandlers["ensureClientId"](socket);

  // Register all event handlers for this socket
  socketHandlers.registerHandlers(socket);

  // Send initial connection confirmation
  socket.emit("connected", { socketId: socket.id, clientId, timestamp: Date.now() });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: Error, _req: Request, res: Response) => {
  console.error("[Error]", err);
  res.status(500).json({ error: "Internal server error" });
});

// ============================================================================
// START SERVER
// ============================================================================

server.listen(PORT, () => {
  console.log(`[Server] Titan game server listening on port ${PORT}`);
  console.log(`[Server] Ready for WebSocket connections`);
});

const aiIntervalHandle = setInterval(runAiLoopTick, 750);

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[Server] SIGTERM received, shutting down gracefully");
  clearInterval(aiIntervalHandle);
  server.close(() => {
    console.log("[Server] HTTP server closed");
    process.exit(0);
  });
});

export { server, io, engine };
